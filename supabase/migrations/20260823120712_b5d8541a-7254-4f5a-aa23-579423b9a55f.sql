REVOKE ALL ON FUNCTION public.audit_rbac_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_last_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_admin_override() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.task_file_task_id(text) FROM PUBLIC, anon;