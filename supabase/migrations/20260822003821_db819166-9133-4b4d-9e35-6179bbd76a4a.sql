REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.can_edit(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.task_has_permission(uuid, uuid, task_permission) FROM public;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_has_permission(uuid, uuid, task_permission) TO authenticated;