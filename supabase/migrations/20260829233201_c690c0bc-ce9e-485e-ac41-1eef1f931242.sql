CREATE OR REPLACE FUNCTION public.can_view_task(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id AND _user_id IS NOT NULL AND (
      t.created_by = _user_id
      OR t.assignee_id = _user_id
      OR public.task_has_permission(t.id, _user_id, 'view')
      OR public.can_view_project_dossier(t.project_id, _user_id)
    )
  );
$$;