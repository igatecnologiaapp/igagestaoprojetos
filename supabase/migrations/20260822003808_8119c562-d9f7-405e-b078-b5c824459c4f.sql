REVOKE EXECUTE ON FUNCTION public.log_audit() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_task_status_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.touch_project_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.block_secret_metadata() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.touch_own_project_activity() FROM anon, authenticated, public;