-- ============================================================
-- BLOCO 2A — Integridade Histórica, Última Atividade e Auditoria
-- Migration incremental. Não altera RLS/RBAC/Storage/Auth.
-- ============================================================

-- 1) Ruído de auditoria: alterações automáticas de last_activity_at
--    não devem gerar entradas 'updated' em audit_history.
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity text := TG_ARGV[0];
  v_changes jsonb;
  v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_id := NEW.id;
    v_changes := to_jsonb(NEW);
    INSERT INTO public.audit_history (entity_type, entity_id, action, changes, changed_by)
    VALUES (v_entity, v_id, 'created', v_changes, COALESCE(auth.uid(), (to_jsonb(NEW)->>'created_by')::uuid));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_id := NEW.id;
    SELECT jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val))
    INTO v_changes
    FROM (
      SELECT key, to_jsonb(OLD)->key AS old_val, to_jsonb(NEW)->key AS new_val
      FROM jsonb_object_keys(to_jsonb(NEW)) AS key
      WHERE to_jsonb(OLD)->key IS DISTINCT FROM to_jsonb(NEW)->key
        AND key NOT IN ('updated_at', 'last_activity_at')
    ) diff;
    IF v_changes IS NOT NULL THEN
      INSERT INTO public.audit_history (entity_type, entity_id, action, changes, changed_by)
      VALUES (v_entity, v_id, 'updated', v_changes, auth.uid());
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    INSERT INTO public.audit_history (entity_type, entity_id, action, changes, changed_by)
    VALUES (v_entity, v_id, 'deleted', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- 2) Atividade do projeto a partir de entidades ligadas à TAREFA
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
      UPDATE public.projects SET last_activity_at = now() WHERE id = v_pid;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $function$;

REVOKE ALL ON FUNCTION public.touch_project_activity_via_task() FROM PUBLIC, anon;

-- 3) last_activity_at: comentários, anexos e agendamentos
DROP TRIGGER IF EXISTS trg_task_comments_activity ON public.task_comments;
CREATE TRIGGER trg_task_comments_activity
AFTER INSERT OR UPDATE OR DELETE ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity_via_task();

DROP TRIGGER IF EXISTS trg_task_attachments_activity ON public.task_attachments;
CREATE TRIGGER trg_task_attachments_activity
AFTER INSERT OR UPDATE OR DELETE ON public.task_attachments
FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity_via_task();

DROP TRIGGER IF EXISTS trg_appointments_activity ON public.appointments;
CREATE TRIGGER trg_appointments_activity
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();

-- 4) Auditoria dos eventos ainda não cobertos (metadados existentes das linhas;
--    nenhuma dessas tabelas possui senha/token/segredo/conteúdo de arquivo)
DROP TRIGGER IF EXISTS trg_task_comments_audit ON public.task_comments;
CREATE TRIGGER trg_task_comments_audit
AFTER INSERT OR UPDATE OR DELETE ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.log_audit('task_comment');

DROP TRIGGER IF EXISTS trg_task_attachments_audit ON public.task_attachments;
CREATE TRIGGER trg_task_attachments_audit
AFTER INSERT OR UPDATE OR DELETE ON public.task_attachments
FOR EACH ROW EXECUTE FUNCTION public.log_audit('task_attachment');

DROP TRIGGER IF EXISTS trg_appointments_audit ON public.appointments;
CREATE TRIGGER trg_appointments_audit
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.log_audit('appointment');

DROP TRIGGER IF EXISTS trg_appointment_participants_audit ON public.appointment_participants;
CREATE TRIGGER trg_appointment_participants_audit
AFTER INSERT OR DELETE ON public.appointment_participants
FOR EACH ROW EXECUTE FUNCTION public.log_audit('appointment_participant');

DROP TRIGGER IF EXISTS trg_project_shares_audit ON public.project_shares;
CREATE TRIGGER trg_project_shares_audit
AFTER INSERT OR UPDATE OR DELETE ON public.project_shares
FOR EACH ROW EXECUTE FUNCTION public.log_audit('project_share');

DROP TRIGGER IF EXISTS trg_task_shares_audit ON public.task_shares;
CREATE TRIGGER trg_task_shares_audit
AFTER INSERT OR UPDATE OR DELETE ON public.task_shares
FOR EACH ROW EXECUTE FUNCTION public.log_audit('task_share');

DROP TRIGGER IF EXISTS trg_external_collaborators_audit ON public.external_collaborators;
CREATE TRIGGER trg_external_collaborators_audit
AFTER INSERT OR UPDATE OR DELETE ON public.external_collaborators
FOR EACH ROW EXECUTE FUNCTION public.log_audit('external_collaborator');
