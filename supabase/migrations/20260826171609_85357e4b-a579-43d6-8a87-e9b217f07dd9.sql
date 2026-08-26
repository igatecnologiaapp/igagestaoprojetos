-- =====================================================================
-- FASE 0.2 — Endurecimento de leitura, isolamento e homologação
-- Substitui policies SELECT true por autorização efetiva no banco.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. HELPERS CANÔNICOS
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND _user_id IS NOT NULL AND (
      public.has_role(_user_id, 'owner')
      OR p.owner_id = _user_id
      OR p.created_by = _user_id
      OR EXISTS (SELECT 1 FROM public.project_shares ps WHERE ps.project_id = p.id AND ps.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = p.id AND (t.assignee_id = _user_id OR t.created_by = _user_id))
      OR EXISTS (SELECT 1 FROM public.task_shares ts JOIN public.tasks t2 ON t2.id = ts.task_id
                 WHERE t2.project_id = p.id AND ts.user_id = _user_id)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND _user_id IS NOT NULL AND (
      public.has_role(_user_id, 'owner')
      OR p.owner_id = _user_id
      OR p.created_by = _user_id
      OR EXISTS (SELECT 1 FROM public.project_shares ps
                 WHERE ps.project_id = p.id AND ps.user_id = _user_id AND ps.permission = 'edit')
    )
  );
$$;

-- Redefinição (mesmo nome, mesma assinatura): remove o acesso global de colaborador
CREATE OR REPLACE FUNCTION public.can_view_task(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id AND _user_id IS NOT NULL AND (
      public.has_role(_user_id, 'owner')
      OR t.created_by = _user_id
      OR t.assignee_id = _user_id
      OR public.task_has_permission(t.id, _user_id, 'view')
      OR public.can_view_project(t.project_id, _user_id)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_task(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id AND _user_id IS NOT NULL AND (
      public.has_role(_user_id, 'owner')
      OR t.assignee_id = _user_id
      OR t.created_by = _user_id
      OR public.task_has_permission(t.id, _user_id, 'edit')
      OR public.can_edit_project(t.project_id, _user_id)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_modify_task_files(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_edit_task(_task_id, _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_company(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'owner')
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.created_by = _user_id)
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.company_id = _company_id
               AND public.can_view_project(p.id, _user_id))
  );
$$;

-- Pessoas com quem o usuário efetivamente compartilha trabalho (para profiles)
CREATE OR REPLACE FUNCTION public.shares_workspace_with(_viewer uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _viewer IS NOT NULL AND _target IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE public.can_view_project(p.id, _viewer) AND (
      p.owner_id = _target OR p.created_by = _target
      OR EXISTS (SELECT 1 FROM public.project_shares ps WHERE ps.project_id = p.id AND ps.user_id = _target)
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = p.id
                 AND (t.assignee_id = _target OR t.created_by = _target))
      OR EXISTS (SELECT 1 FROM public.task_shares ts JOIN public.tasks t2 ON t2.id = ts.task_id
                 WHERE t2.project_id = p.id AND ts.user_id = _target)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_task(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_company(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_workspace_with(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_task(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_company(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_workspace_with(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. PROJETOS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Projects viewable" ON public.projects;
CREATE POLICY "Projects viewable by authorized" ON public.projects
  FOR SELECT TO authenticated USING (public.can_view_project(id, auth.uid()));

DROP POLICY IF EXISTS "Projects update" ON public.projects;
CREATE POLICY "Projects update by authorized" ON public.projects
  FOR UPDATE TO authenticated USING (public.can_edit_project(id, auth.uid()));

-- ---------------------------------------------------------------
-- 3. SUBTABELAS DO PROJETO
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Credits viewable" ON public.project_credits;
CREATE POLICY "Credits viewable by project members" ON public.project_credits
  FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Credits insert" ON public.project_credits;
CREATE POLICY "Credits insert" ON public.project_credits
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Credits update" ON public.project_credits;
CREATE POLICY "Credits update" ON public.project_credits
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Credits delete" ON public.project_credits;
CREATE POLICY "Credits delete" ON public.project_credits
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project emails viewable" ON public.project_emails;
CREATE POLICY "Project emails viewable by project members" ON public.project_emails
  FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Project emails insert" ON public.project_emails;
CREATE POLICY "Project emails insert" ON public.project_emails
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Project emails update" ON public.project_emails;
CREATE POLICY "Project emails update" ON public.project_emails
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Project emails delete" ON public.project_emails;
CREATE POLICY "Project emails delete" ON public.project_emails
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Github viewable" ON public.project_github_repos;
CREATE POLICY "Github viewable by project members" ON public.project_github_repos
  FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Github insert" ON public.project_github_repos;
CREATE POLICY "Github insert" ON public.project_github_repos
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Github update" ON public.project_github_repos;
CREATE POLICY "Github update" ON public.project_github_repos
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Github delete" ON public.project_github_repos;
CREATE POLICY "Github delete" ON public.project_github_repos
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Lovable viewable" ON public.project_lovable;
CREATE POLICY "Lovable viewable by project members" ON public.project_lovable
  FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Lovable insert" ON public.project_lovable;
CREATE POLICY "Lovable insert" ON public.project_lovable
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Lovable update" ON public.project_lovable;
CREATE POLICY "Lovable update" ON public.project_lovable
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Lovable delete" ON public.project_lovable;
CREATE POLICY "Lovable delete" ON public.project_lovable
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Prompts viewable" ON public.project_prompts;
CREATE POLICY "Prompts viewable by project members" ON public.project_prompts
  FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Prompts insert" ON public.project_prompts;
CREATE POLICY "Prompts insert" ON public.project_prompts
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Prompts update" ON public.project_prompts;
CREATE POLICY "Prompts update" ON public.project_prompts
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Prompts delete" ON public.project_prompts;
CREATE POLICY "Prompts delete" ON public.project_prompts
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Links viewable" ON public.project_links;
CREATE POLICY "Links viewable by project members" ON public.project_links
  FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Links insert" ON public.project_links;
CREATE POLICY "Links insert" ON public.project_links
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Links update" ON public.project_links;
CREATE POLICY "Links update" ON public.project_links
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Links delete" ON public.project_links;
CREATE POLICY "Links delete" ON public.project_links
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

-- Contas: mantém restrição a Administradores (mais restritiva que projeto)
-- (policies "Accounts owners only select/write" preservadas)

DROP POLICY IF EXISTS "Field values viewable" ON public.project_custom_field_values;
CREATE POLICY "Field values viewable by project members" ON public.project_custom_field_values
  FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Field values insert" ON public.project_custom_field_values;
CREATE POLICY "Field values insert" ON public.project_custom_field_values
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Field values update" ON public.project_custom_field_values;
CREATE POLICY "Field values update" ON public.project_custom_field_values
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Field values delete" ON public.project_custom_field_values;
CREATE POLICY "Field values delete" ON public.project_custom_field_values
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project shares viewable" ON public.project_shares;
CREATE POLICY "Project shares viewable by members" ON public.project_shares
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Project shares manage" ON public.project_shares;
CREATE POLICY "Project shares manage" ON public.project_shares
  FOR ALL TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));

-- ---------------------------------------------------------------
-- 4. TAREFAS E FILHAS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Tasks viewable" ON public.tasks;
CREATE POLICY "Tasks viewable by authorized" ON public.tasks
  FOR SELECT TO authenticated USING (public.can_view_task(id, auth.uid()));

DROP POLICY IF EXISTS "Tasks insert" ON public.tasks;
CREATE POLICY "Tasks insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit(auth.uid()) AND public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Tasks update" ON public.tasks;
CREATE POLICY "Tasks update by authorized" ON public.tasks
  FOR UPDATE TO authenticated USING (public.can_edit_task(id, auth.uid()));

DROP POLICY IF EXISTS "Tasks delete" ON public.tasks;
CREATE POLICY "Tasks delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Comments viewable" ON public.task_comments;
CREATE POLICY "Comments viewable by task members" ON public.task_comments
  FOR SELECT TO authenticated USING (public.can_view_task(task_id, auth.uid()));
DROP POLICY IF EXISTS "Comments insert" ON public.task_comments;
CREATE POLICY "Comments insert" ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (
    public.can_edit_task(task_id, auth.uid())
    OR public.task_has_permission(task_id, auth.uid(), 'comment')
  ));

DROP POLICY IF EXISTS "Shares viewable" ON public.task_shares;
CREATE POLICY "Task shares viewable by members" ON public.task_shares
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_task(task_id, auth.uid()));
DROP POLICY IF EXISTS "Shares manage" ON public.task_shares;
CREATE POLICY "Task shares manage" ON public.task_shares
  FOR ALL TO authenticated
  USING (public.can_edit_task(task_id, auth.uid()))
  WITH CHECK (public.can_edit_task(task_id, auth.uid()));

DROP POLICY IF EXISTS "History viewable" ON public.task_status_history;
CREATE POLICY "Task history viewable by members" ON public.task_status_history
  FOR SELECT TO authenticated USING (public.can_view_task(task_id, auth.uid()));

-- ---------------------------------------------------------------
-- 5. EMPRESAS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Companies viewable" ON public.companies;
CREATE POLICY "Companies viewable by authorized" ON public.companies
  FOR SELECT TO authenticated USING (public.can_view_company(id, auth.uid()));

-- ---------------------------------------------------------------
-- 6. AGENDAMENTOS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Appointments viewable" ON public.appointments;
CREATE POLICY "Appointments viewable by authorized" ON public.appointments
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'owner')
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.appointment_participants ap
               WHERE ap.appointment_id = id AND ap.user_id = auth.uid())
    OR (project_id IS NOT NULL AND public.can_view_project(project_id, auth.uid()))
    OR (company_id IS NOT NULL AND public.can_view_company(company_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Participants viewable" ON public.appointment_participants;
CREATE POLICY "Participants viewable by appointment members" ON public.appointment_participants
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id)
  );

-- ---------------------------------------------------------------
-- 7. PROFILES (dados pessoais)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by related users" ON public.profiles
  FOR SELECT TO authenticated USING (
    auth.uid() = id
    OR public.has_permission(auth.uid(), 'users.manage')
    OR public.shares_workspace_with(auth.uid(), id)
  );

-- ---------------------------------------------------------------
-- 8. AUDITORIA
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Audit viewable" ON public.audit_history;
CREATE POLICY "Audit viewable by auditors" ON public.audit_history
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(), 'audit.view')
    OR (entity_type IN ('project','project_accounts','project_credits','project_custom_field_definitions',
                        'project_custom_field_values','project_emails','project_github_repos',
                        'project_links','project_lovable','project_prompts')
        AND public.can_view_project(entity_id, auth.uid()))
    OR (entity_type = 'task' AND public.can_view_task(entity_id, auth.uid()))
    OR (entity_type = 'company' AND public.can_view_company(entity_id, auth.uid()))
  );

-- ---------------------------------------------------------------
-- 9. RBAC / ADMINISTRAÇÃO
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "Roles viewable by self or admins" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS "Module access viewable" ON public.user_module_access;
CREATE POLICY "Module access viewable by self or admins" ON public.user_module_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS "External viewable" ON public.external_collaborators;
CREATE POLICY "External viewable by editors" ON public.external_collaborators
  FOR SELECT TO authenticated USING (public.can_edit(auth.uid()));