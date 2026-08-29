-- FASE 0 / BLOCO 1: least privilege separation between project access and task-only access

CREATE OR REPLACE FUNCTION public.can_view_project_dossier(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND _user_id IS NOT NULL AND (
      public.has_role(_user_id, 'owner')
      OR p.owner_id = _user_id
      OR p.created_by = _user_id
      OR EXISTS (SELECT 1 FROM public.project_shares ps
                 WHERE ps.project_id = p.id AND ps.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.tasks t
                 WHERE t.project_id = p.id AND (t.assignee_id = _user_id OR t.created_by = _user_id))
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_project_dossier(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_project_dossier(uuid, uuid) TO authenticated, service_role;

-- project_credits
DROP POLICY IF EXISTS "Credits viewable by project members" ON public.project_credits;
CREATE POLICY "Credits viewable by project dossier members" ON public.project_credits
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));

-- project_emails
DROP POLICY IF EXISTS "Project emails viewable by project members" ON public.project_emails;
CREATE POLICY "Project emails viewable by project dossier members" ON public.project_emails
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));

-- project_github_repos
DROP POLICY IF EXISTS "Github viewable by project members" ON public.project_github_repos;
CREATE POLICY "Github viewable by project dossier members" ON public.project_github_repos
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));

-- project_lovable
DROP POLICY IF EXISTS "Lovable viewable by project members" ON public.project_lovable;
CREATE POLICY "Lovable viewable by project dossier members" ON public.project_lovable
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));

-- project_prompts
DROP POLICY IF EXISTS "Prompts viewable by project members" ON public.project_prompts;
CREATE POLICY "Prompts viewable by project dossier members" ON public.project_prompts
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));

-- project_links
DROP POLICY IF EXISTS "Links viewable by project members" ON public.project_links;
CREATE POLICY "Links viewable by project dossier members" ON public.project_links
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));

-- project_custom_field_values
DROP POLICY IF EXISTS "Field values viewable by project members" ON public.project_custom_field_values;
CREATE POLICY "Field values viewable by project dossier members" ON public.project_custom_field_values
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));

-- audit_history: project-scoped entities follow dossier rule
DROP POLICY IF EXISTS "Audit viewable by auditors" ON public.audit_history;
CREATE POLICY "Audit viewable by auditors" ON public.audit_history
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(), 'audit.view')
    OR (entity_type = ANY (ARRAY['project','project_accounts','project_credits','project_custom_field_definitions','project_custom_field_values','project_emails','project_github_repos','project_links','project_lovable','project_prompts'])
        AND public.can_view_project_dossier(entity_id, auth.uid()))
    OR (entity_type = 'task' AND public.can_view_task(entity_id, auth.uid()))
    OR (entity_type = 'company' AND public.can_view_company(entity_id, auth.uid()))
  );

COMMENT ON FUNCTION public.can_view_project_dossier(uuid, uuid) IS
  'Autorizacao de leitura do dossie tecnico/administrativo do projeto. Exclui deliberadamente acesso obtido apenas por task_shares (principio do menor privilegio, Bloco 1 / Fase 0).';