REVOKE ALL ON FUNCTION public.can_view_cost(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.validate_cost_allocation() FROM anon, public;
REVOKE ALL ON FUNCTION public.touch_project_activity_via_allocation() FROM anon, public;
REVOKE ALL ON FUNCTION public.touch_projects_via_cost() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_view_cost(uuid, uuid) TO authenticated, service_role;