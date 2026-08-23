-- ============ 1. Funções de autorização por tarefa ============
CREATE OR REPLACE FUNCTION public.can_view_task(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = _task_id AND _user_id IS NOT NULL AND (
      public.has_role(_user_id, 'owner')
      OR public.can_edit(_user_id)
      OR t.created_by = _user_id
      OR t.assignee_id = _user_id
      OR p.owner_id = _user_id
      OR public.task_has_permission(t.id, _user_id, 'view')
      OR EXISTS (SELECT 1 FROM public.project_shares ps WHERE ps.project_id = t.project_id AND ps.user_id = _user_id)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_modify_task_files(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = _task_id AND _user_id IS NOT NULL AND (
      public.has_role(_user_id, 'owner')
      OR public.can_edit(_user_id)
      OR t.assignee_id = _user_id
      OR p.owner_id = _user_id
      OR public.task_has_permission(t.id, _user_id, 'edit')
      OR EXISTS (SELECT 1 FROM public.project_shares ps WHERE ps.project_id = t.project_id AND ps.user_id = _user_id AND ps.permission = 'edit')
    )
  );
$$;

-- Autorização de um objeto do storage: caminho = <task_id>/<arquivo>
CREATE OR REPLACE FUNCTION public.task_file_task_id(_object_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  BEGIN
    v := (split_part(_object_name, '/', 1))::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN v;
END; $$;

REVOKE ALL ON FUNCTION public.can_view_task(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_modify_task_files(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.task_file_task_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_task(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_modify_task_files(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.task_file_task_id(text) TO authenticated, service_role;

-- ============ 2. Políticas do bucket task-files ============
DROP POLICY IF EXISTS "Task files viewable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Task files upload by editors" ON storage.objects;
DROP POLICY IF EXISTS "Task files delete by editors" ON storage.objects;
DROP POLICY IF EXISTS "task-files authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "task-files authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "task-files authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "task-files authenticated delete" ON storage.objects;

CREATE POLICY "task-files select authorized" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-files' AND public.can_view_task(public.task_file_task_id(name), auth.uid()));

CREATE POLICY "task-files insert authorized" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-files' AND public.can_modify_task_files(public.task_file_task_id(name), auth.uid()));

CREATE POLICY "task-files update authorized" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'task-files' AND public.can_modify_task_files(public.task_file_task_id(name), auth.uid()))
WITH CHECK (bucket_id = 'task-files' AND public.can_modify_task_files(public.task_file_task_id(name), auth.uid()));

CREATE POLICY "task-files delete authorized" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-files' AND public.can_modify_task_files(public.task_file_task_id(name), auth.uid()));

-- ============ 3. Metadados de anexos seguem a mesma autorização ============
DROP POLICY IF EXISTS "Attachments viewable" ON public.task_attachments;
DROP POLICY IF EXISTS "Attachments insert" ON public.task_attachments;
DROP POLICY IF EXISTS "Attachments delete" ON public.task_attachments;

CREATE POLICY "Attachments viewable" ON public.task_attachments FOR SELECT TO authenticated
USING (public.can_view_task(task_id, auth.uid()));
CREATE POLICY "Attachments insert" ON public.task_attachments FOR INSERT TO authenticated
WITH CHECK (public.can_modify_task_files(task_id, auth.uid()));
CREATE POLICY "Attachments delete" ON public.task_attachments FOR DELETE TO authenticated
USING (public.can_modify_task_files(task_id, auth.uid()));

-- ============ 4. Proteção do último administrador ============
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining int;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner') THEN
    SELECT COUNT(*) INTO remaining FROM public.user_roles
      WHERE role = 'owner' AND id <> OLD.id;
    IF remaining = 0 THEN
      RAISE EXCEPTION 'Operação recusada: o sistema precisa manter ao menos um Administrador ativo.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_last_owner ON public.user_roles;
CREATE TRIGGER trg_protect_last_owner BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

CREATE OR REPLACE FUNCTION public.protect_admin_override()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining int;
BEGIN
  IF NEW.permission_key = 'users.manage' AND NEW.granted = false THEN
    SELECT COUNT(*) INTO remaining FROM public.user_roles ur
      WHERE ur.role = 'owner' AND ur.user_id <> NEW.user_id
        AND NOT EXISTS (
          SELECT 1 FROM public.user_permission_overrides o
          WHERE o.user_id = ur.user_id AND o.permission_key = 'users.manage' AND o.granted = false
        );
    IF remaining = 0 THEN
      RAISE EXCEPTION 'Operação recusada: isso deixaria o sistema sem nenhum Administrador com gestão de usuários.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_admin_override ON public.user_permission_overrides;
CREATE TRIGGER trg_protect_admin_override BEFORE INSERT OR UPDATE ON public.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_override();

-- ============ 5. Auditoria das alterações de RBAC ============
CREATE OR REPLACE FUNCTION public.audit_rbac_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entity text := TG_ARGV[0];
  v_meta jsonb;
  v_target uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_meta := to_jsonb(OLD); v_action := v_entity || '.revoked';
  ELSIF TG_OP = 'INSERT' THEN
    v_meta := to_jsonb(NEW); v_action := v_entity || '.granted';
  ELSE
    v_meta := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    v_action := v_entity || '.updated';
  END IF;

  v_target := NULLIF(v_meta->>'user_id', '')::uuid;

  INSERT INTO public.security_access_log (actor_id, action, entity_type, entity_id, origin, metadata)
  VALUES (auth.uid(), v_action, v_entity, v_target, 'database.trigger', v_meta);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_change('user_roles');

DROP TRIGGER IF EXISTS trg_audit_role_permissions ON public.role_permissions;
CREATE TRIGGER trg_audit_role_permissions AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_change('role_permissions');

DROP TRIGGER IF EXISTS trg_audit_overrides ON public.user_permission_overrides;
CREATE TRIGGER trg_audit_overrides AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_change('user_permission_overrides');

DROP TRIGGER IF EXISTS trg_audit_module_access ON public.user_module_access;
CREATE TRIGGER trg_audit_module_access AFTER INSERT OR UPDATE OR DELETE ON public.user_module_access
FOR EACH ROW EXECUTE FUNCTION public.audit_rbac_change('user_module_access');
