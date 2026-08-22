-- ============ FASE 0: RBAC granular ============
CREATE TABLE public.app_permissions (
  key text PRIMARY KEY,
  category text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_permissions TO authenticated;
GRANT ALL ON public.app_permissions TO service_role;
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read permissions" ON public.app_permissions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.app_permissions(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission_key)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read role permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners manage role permissions" ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES public.app_permissions(key) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key)
);
GRANT SELECT ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own overrides" ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Owners manage overrides" ON public.user_permission_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_permission_overrides o
                 WHERE o.user_id = _user_id AND o.permission_key = _permission AND o.granted = false)
      THEN false
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'owner')
      THEN true
    WHEN EXISTS (SELECT 1 FROM public.user_permission_overrides o
                 WHERE o.user_id = _user_id AND o.permission_key = _permission AND o.granted = true)
      THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission_key = _permission
    )
  END;
$$;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, anon;

INSERT INTO public.app_permissions (key, category, description) VALUES
  ('projects.view','projects','Visualizar projetos'),
  ('projects.edit','projects','Criar e editar projetos'),
  ('projects.delete','projects','Excluir projetos'),
  ('tasks.view','tasks','Visualizar tarefas'),
  ('tasks.edit','tasks','Criar e editar tarefas'),
  ('tasks.delete','tasks','Excluir tarefas'),
  ('companies.view','companies','Visualizar empresas'),
  ('companies.edit','companies','Criar e editar empresas'),
  ('companies.delete','companies','Excluir empresas'),
  ('appointments.view','appointments','Visualizar agendamentos'),
  ('appointments.edit','appointments','Criar e editar agendamentos'),
  ('credentials.metadata.view','credentials','Ver metadados de credenciais (sem segredo)'),
  ('credentials.secret.view','credentials','Revelar segredo de credencial'),
  ('credentials.edit','credentials','Gerenciar credenciais'),
  ('financial.view','financial','Visualizar dados financeiros'),
  ('financial.edit','financial','Lançar e editar dados financeiros'),
  ('prompts.view','governance','Visualizar prompts'),
  ('prompts.edit','governance','Criar e editar prompts'),
  ('versions.manage','governance','Gerenciar versões'),
  ('homologation.approve','governance','Homologar versões'),
  ('audit.view','security','Consultar auditoria'),
  ('users.manage','security','Gerenciar usuários e permissões');

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'collaborator', key FROM public.app_permissions
WHERE key IN ('projects.view','projects.edit','tasks.view','tasks.edit','companies.view','companies.edit',
              'appointments.view','appointments.edit','credentials.metadata.view','prompts.view','prompts.edit','financial.view');

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'viewer', key FROM public.app_permissions
WHERE key IN ('projects.view','tasks.view','companies.view','appointments.view');

-- ============ FASE 0: log de acessos sensíveis ============
CREATE TABLE public.security_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  project_id uuid,
  origin text,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.security_access_log TO authenticated;
GRANT ALL ON public.security_access_log TO service_role;
ALTER TABLE public.security_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auditors read access log" ON public.security_access_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit.view'));
CREATE POLICY "Authenticated write own access log" ON public.security_access_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
CREATE INDEX idx_security_access_log_occurred ON public.security_access_log (occurred_at DESC);

CREATE OR REPLACE FUNCTION public.block_secret_metadata()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF NEW.metadata IS NOT NULL THEN
    FOREACH k IN ARRAY ARRAY['password','senha','secret','token','api_key','apikey','private_key','secret_value'] LOOP
      IF NEW.metadata ? k THEN
        RAISE EXCEPTION 'Metadados não podem conter campos sensíveis (%).', k;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_security_access_log_no_secrets
BEFORE INSERT OR UPDATE ON public.security_access_log
FOR EACH ROW EXECUTE FUNCTION public.block_secret_metadata();

-- ============ FASE 0: storage privado (políticas) ============
DROP POLICY IF EXISTS "task-files authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "task-files authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "task-files authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "task-files authenticated delete" ON storage.objects;

CREATE POLICY "task-files authenticated read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-files');
CREATE POLICY "task-files authenticated write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-files');
CREATE POLICY "task-files authenticated update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'task-files') WITH CHECK (bucket_id = 'task-files');
CREATE POLICY "task-files authenticated delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-files');