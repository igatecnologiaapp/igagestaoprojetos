
-- ============ APPOINTMENTS ============
CREATE TYPE public.appointment_status AS ENUM ('scheduled','in_progress','done','cancelled');

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  location text,
  status public.appointment_status NOT NULL DEFAULT 'scheduled',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Appointments viewable" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Appointments insert" ON public.appointments FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Appointments update" ON public.appointments FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "Appointments delete" ON public.appointments FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.appointment_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, user_id)
);
ALTER TABLE public.appointment_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants viewable" ON public.appointment_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Participants insert" ON public.appointment_participants FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Participants delete" ON public.appointment_participants FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

-- ============ AUDIT HISTORY ============
CREATE TABLE public.audit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL, -- 'company' | 'project' | 'task'
  entity_id uuid NOT NULL,
  action text NOT NULL, -- 'created' | 'updated' | 'deleted'
  changes jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit viewable" ON public.audit_history FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_audit_entity ON public.audit_history(entity_type, entity_id, changed_at DESC);

-- generic audit trigger function
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity text := TG_ARGV[0];
  v_changes jsonb;
  v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_id := NEW.id;
    v_changes := to_jsonb(NEW);
    INSERT INTO public.audit_history (entity_type, entity_id, action, changes, changed_by)
    VALUES (v_entity, v_id, 'created', v_changes, COALESCE(auth.uid(), NEW.created_by));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_id := NEW.id;
    SELECT jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val))
    INTO v_changes
    FROM (
      SELECT key, to_jsonb(OLD)->key AS old_val, to_jsonb(NEW)->key AS new_val
      FROM jsonb_object_keys(to_jsonb(NEW)) AS key
      WHERE to_jsonb(OLD)->key IS DISTINCT FROM to_jsonb(NEW)->key
        AND key NOT IN ('updated_at')
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
$$;

CREATE TRIGGER companies_audit AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('company');
CREATE TRIGGER projects_audit AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('project');
CREATE TRIGGER tasks_audit AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('task');

-- ============ TASK SHARES ============
CREATE TYPE public.task_permission AS ENUM ('view','comment','edit');

CREATE TABLE public.task_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  permission public.task_permission NOT NULL DEFAULT 'view',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);
ALTER TABLE public.task_shares ENABLE ROW LEVEL SECURITY;

-- helper to check if user has at least a given permission
CREATE OR REPLACE FUNCTION public.task_has_permission(_task_id uuid, _user_id uuid, _min_perm public.task_permission)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_shares
    WHERE task_id = _task_id AND user_id = _user_id
      AND CASE _min_perm
        WHEN 'view' THEN permission IN ('view','comment','edit')
        WHEN 'comment' THEN permission IN ('comment','edit')
        WHEN 'edit' THEN permission = 'edit'
      END
  );
$$;

GRANT EXECUTE ON FUNCTION public.task_has_permission(uuid,uuid,public.task_permission) TO authenticated, anon;

CREATE POLICY "Shares viewable" ON public.task_shares FOR SELECT TO authenticated USING (true);
CREATE POLICY "Shares manage" ON public.task_shares FOR ALL TO authenticated
  USING (public.can_edit(auth.uid()))
  WITH CHECK (public.can_edit(auth.uid()));

-- extend tasks update policy to include 'edit' shared users
DROP POLICY IF EXISTS "Tasks update" ON public.tasks;
CREATE POLICY "Tasks update" ON public.tasks FOR UPDATE TO authenticated
  USING (public.can_edit(auth.uid()) OR auth.uid() = assignee_id OR public.task_has_permission(id, auth.uid(), 'edit'));

-- ============ TASK COMMENTS ============
CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable" ON public.task_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Comments insert" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      public.can_edit(auth.uid())
      OR public.task_has_permission(task_id, auth.uid(), 'comment')
    )
  );
CREATE POLICY "Comments delete own or owner" ON public.task_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'owner'));
