CREATE OR REPLACE FUNCTION public.touch_own_project_activity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.last_activity_at = clock_timestamp();
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.touch_project_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_pid := (to_jsonb(OLD)->>'project_id')::uuid;
  ELSE
    v_pid := (to_jsonb(NEW)->>'project_id')::uuid;
  END IF;
  IF v_pid IS NOT NULL THEN
    UPDATE public.projects SET last_activity_at = clock_timestamp() WHERE id = v_pid;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.touch_project_activity_via_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_tid uuid; v_pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tid := (to_jsonb(OLD)->>'task_id')::uuid;
  ELSE
    v_tid := (to_jsonb(NEW)->>'task_id')::uuid;
  END IF;
  IF v_tid IS NOT NULL THEN
    SELECT project_id INTO v_pid FROM public.tasks WHERE id = v_tid;
    IF v_pid IS NOT NULL THEN
      UPDATE public.projects SET last_activity_at = clock_timestamp() WHERE id = v_pid;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $function$;

REVOKE ALL ON FUNCTION public.touch_project_activity_via_task() FROM PUBLIC, anon, authenticated;
