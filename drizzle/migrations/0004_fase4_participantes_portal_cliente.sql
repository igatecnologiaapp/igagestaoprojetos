-- =============================================================================
-- Fase 4 — Participantes com acesso limitado e Portal do Cliente (somente consulta)
--
-- 1. Financeiro só para quem tem financial.view: custos, rateios, orçamentos e
--    assinaturas deixam de ser visíveis a qualquer participante do projeto.
-- 2. Perfil Cliente: usuário SEM papel interno (sem user_roles), vinculado a uma
--    empresa. Não acessa nenhuma tabela diretamente; vê apenas o que as funções
--    client_portal_* devolvem, e somente de projetos com o portal liberado:
--      - nome, situação, fase, prazos e % de conclusão do projeto
--      - tarefas marcadas como visíveis ao cliente
--      - documentos marcados como compartilhados com o cliente
--      - valores que ele JÁ PAGOU (parcelas recebidas) — nunca custos
-- 3. Proteções: um Cliente não pode receber papel interno, ser participante,
--    responsável por tarefa ou dono de projeto.
-- Idempotente. Não cria bucket (usa o project-files existente).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Financeiro restrito a financial.view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_cost(_cost_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND public.has_permission(_user_id, 'financial.view');
$$;

DROP POLICY IF EXISTS finance_cost_allocations_select ON public.finance_cost_allocations;
CREATE POLICY finance_cost_allocations_select ON public.finance_cost_allocations
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financial.view'));

DROP POLICY IF EXISTS finance_budgets_select ON public.finance_budgets;
CREATE POLICY finance_budgets_select ON public.finance_budgets
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financial.view'));

DROP POLICY IF EXISTS "Services viewable by financial viewers or project members" ON public.finance_services;
DROP POLICY IF EXISTS "Services viewable by financial viewers" ON public.finance_services;
CREATE POLICY "Services viewable by financial viewers" ON public.finance_services
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financial.view'));

-- ---------------------------------------------------------------------------
-- 2. Clientes do portal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_users_company ON public.client_users(company_id);
COMMENT ON TABLE public.client_users IS
  'Fase 4: usuários do Portal do Cliente (sem papel interno), vinculados a uma empresa.';

ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_users view self or admins" ON public.client_users;
CREATE POLICY "client_users view self or admins" ON public.client_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'users.manage'));
DROP POLICY IF EXISTS "client_users owners manage" ON public.client_users;
CREATE POLICY "client_users owners manage" ON public.client_users
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
REVOKE ALL ON public.client_users FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_users TO authenticated;

DROP TRIGGER IF EXISTS trg_client_users_updated ON public.client_users;
CREATE TRIGGER trg_client_users_updated BEFORE UPDATE ON public.client_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_client_users_audit ON public.client_users;
CREATE TRIGGER trg_client_users_audit AFTER INSERT OR UPDATE OR DELETE ON public.client_users
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('client_users');

CREATE OR REPLACE FUNCTION public.is_portal_client(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.client_users WHERE user_id = _user_id);
$$;

-- Novo usuário criado como Cliente (metadado account_type = 'client') não recebe papel interno.
-- O metadado só pode REDUZIR acesso, nunca ampliar.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  IF COALESCE(NEW.raw_user_meta_data->>'account_type', '') = 'client' THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'collaborator');
  END IF;
  RETURN NEW;
END;
$$;

-- Proteções: Cliente nunca vira usuário interno nem participante.
CREATE OR REPLACE FUNCTION public.client_users_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Este usuário tem perfil interno; remova o perfil antes de torná-lo Cliente.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_shares WHERE user_id = NEW.user_id)
     OR EXISTS (SELECT 1 FROM public.task_shares WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Este usuário participa de projetos/tarefas internos e não pode ser Cliente.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_client_users_guard ON public.client_users;
CREATE TRIGGER trg_client_users_guard BEFORE INSERT OR UPDATE OF user_id ON public.client_users
  FOR EACH ROW EXECUTE FUNCTION public.client_users_guard();

CREATE OR REPLACE FUNCTION public.reject_portal_client()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v uuid;
BEGIN
  v := CASE TG_ARGV[0]
         WHEN 'user_id' THEN (to_jsonb(NEW)->>'user_id')::uuid
         WHEN 'assignee_id' THEN (to_jsonb(NEW)->>'assignee_id')::uuid
         WHEN 'owner_id' THEN (to_jsonb(NEW)->>'owner_id')::uuid
       END;
  IF v IS NOT NULL AND public.is_portal_client(v) THEN
    RAISE EXCEPTION 'Usuários do Portal do Cliente não podem ter acesso interno (%).', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_user_roles_no_client ON public.user_roles;
CREATE TRIGGER trg_user_roles_no_client BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.reject_portal_client('user_id');
DROP TRIGGER IF EXISTS trg_project_shares_no_client ON public.project_shares;
CREATE TRIGGER trg_project_shares_no_client BEFORE INSERT OR UPDATE ON public.project_shares
  FOR EACH ROW EXECUTE FUNCTION public.reject_portal_client('user_id');
DROP TRIGGER IF EXISTS trg_task_shares_no_client ON public.task_shares;
CREATE TRIGGER trg_task_shares_no_client BEFORE INSERT OR UPDATE ON public.task_shares
  FOR EACH ROW EXECUTE FUNCTION public.reject_portal_client('user_id');
DROP TRIGGER IF EXISTS trg_tasks_no_client_assignee ON public.tasks;
CREATE TRIGGER trg_tasks_no_client_assignee BEFORE INSERT OR UPDATE OF assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.reject_portal_client('assignee_id');
DROP TRIGGER IF EXISTS trg_projects_no_client_owner ON public.projects;
CREATE TRIGGER trg_projects_no_client_owner BEFORE INSERT OR UPDATE OF owner_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.reject_portal_client('owner_id');

-- ---------------------------------------------------------------------------
-- 3. O que o gestor libera para o cliente (tudo começa fechado)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_portal boolean NOT NULL DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_files ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.projects.client_portal IS 'Fase 4: projeto liberado no Portal do Cliente da empresa.';
COMMENT ON COLUMN public.tasks.client_visible IS 'Fase 4: tarefa visível no Portal do Cliente.';
COMMENT ON COLUMN public.project_files.client_visible IS 'Fase 4: documento compartilhado com o cliente.';

-- ---------------------------------------------------------------------------
-- 4. Funções do portal (único caminho de leitura do Cliente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_portal_can_view_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.client_users cu ON cu.company_id = p.company_id AND cu.user_id = _user_id
    WHERE p.id = _project_id AND p.client_portal
  );
$$;

CREATE OR REPLACE FUNCTION public.client_portal_projects()
RETURNS TABLE (
  id uuid, name text, company_name text, status text, phase text,
  start_date date, end_date date, tasks_total int, tasks_done int,
  next_due date, paid_total numeric, documents int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, c.name, p.status::text, p.phase::text, p.start_date, p.end_date,
         (SELECT count(*)::int FROM public.tasks t WHERE t.project_id = p.id),
         (SELECT count(*)::int FROM public.tasks t WHERE t.project_id = p.id AND t.status = 'completed'),
         (SELECT min(t.due_date) FROM public.tasks t
           WHERE t.project_id = p.id AND t.client_visible AND t.status <> 'completed' AND t.due_date >= current_date),
         (SELECT coalesce(sum(i.received_amount), 0) FROM public.project_revenue_installments i
           WHERE i.project_id = p.id AND i.received_at IS NOT NULL),
         (SELECT count(*)::int FROM public.project_files f WHERE f.project_id = p.id AND f.client_visible)
    FROM public.projects p
    JOIN public.companies c ON c.id = p.company_id
   WHERE public.client_portal_can_view_project(p.id, auth.uid())
   ORDER BY p.name;
$$;

CREATE OR REPLACE FUNCTION public.client_portal_project(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.client_portal_can_view_project(_project_id, auth.uid()) THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object(
    'project', (SELECT to_jsonb(x) FROM (
        SELECT p.id, p.name, c.name AS company_name, p.status::text AS status, p.phase::text AS phase,
               p.start_date, p.end_date,
               (SELECT count(*) FROM public.tasks t WHERE t.project_id = p.id) AS tasks_total,
               (SELECT count(*) FROM public.tasks t WHERE t.project_id = p.id AND t.status = 'completed') AS tasks_done
          FROM public.projects p JOIN public.companies c ON c.id = p.company_id
         WHERE p.id = _project_id) x),
    'tasks', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.due_date NULLS LAST, x.name) FROM (
        SELECT t.id, t.name, t.status::text AS status, t.start_date, t.due_date
          FROM public.tasks t WHERE t.project_id = _project_id AND t.client_visible) x), '[]'::jsonb),
    'documents', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
        SELECT f.id, f.file_name, f.description, f.size_bytes, f.mime_type, f.created_at
          FROM public.project_files f WHERE f.project_id = _project_id AND f.client_visible) x), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.received_at DESC, x.number DESC) FROM (
        SELECT i.id, r2.description, r2.kind, i.number, i.received_at, i.received_amount, i.invoice_ref
          FROM public.project_revenue_installments i
          JOIN public.project_revenues r2 ON r2.id = i.revenue_id
         WHERE i.project_id = _project_id AND i.received_at IS NOT NULL) x), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END;
$$;

-- Caminho do arquivo para download (o Storage confere a mesma regra abaixo).
CREATE OR REPLACE FUNCTION public.client_portal_document_path(_file_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.storage_path FROM public.project_files f
   WHERE f.id = _file_id AND f.client_visible
     AND public.client_portal_can_view_project(f.project_id, auth.uid());
$$;

-- Para o gestor: quem da empresa do projeto tem acesso ao portal.
CREATE OR REPLACE FUNCTION public.client_portal_contacts(_project_id uuid)
RETURNS TABLE (user_id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cu.user_id, pr.full_name
    FROM public.projects p
    JOIN public.client_users cu ON cu.company_id = p.company_id
    LEFT JOIN public.profiles pr ON pr.id = cu.user_id
   WHERE p.id = _project_id
     AND (public.can_edit_project(_project_id, auth.uid()) OR public.has_permission(auth.uid(), 'users.manage'))
   ORDER BY pr.full_name;
$$;

REVOKE ALL ON FUNCTION public.client_portal_projects() FROM anon, public;
REVOKE ALL ON FUNCTION public.client_portal_project(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.client_portal_document_path(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.client_portal_contacts(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.client_portal_projects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_document_path(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_contacts(uuid) TO authenticated;

-- Download pelo Cliente: somente arquivos compartilhados de projetos liberados.
CREATE OR REPLACE FUNCTION public.client_portal_can_download(_object_name text, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.project_files f
     WHERE f.storage_path = _object_name AND f.client_visible
       AND public.client_portal_can_view_project(f.project_id, _user_id)
  );
$$;

DROP POLICY IF EXISTS "project-files select portal client" ON storage.objects;
CREATE POLICY "project-files select portal client" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-files' AND public.client_portal_can_download(name, auth.uid()));