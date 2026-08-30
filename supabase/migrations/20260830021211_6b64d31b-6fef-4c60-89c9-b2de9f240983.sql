-- DT-04: quebra da recursão entre appointments e appointment_participants

CREATE OR REPLACE FUNCTION public.is_appointment_participant(_appointment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.appointment_participants ap
    WHERE ap.appointment_id = _appointment_id AND ap.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_appointment(_appointment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = _appointment_id AND (
      public.has_role(_user_id, 'owner')
      OR a.created_by = _user_id
      OR public.is_appointment_participant(a.id, _user_id)
      OR (a.project_id IS NOT NULL AND public.can_view_project(a.project_id, _user_id))
      OR (a.company_id IS NOT NULL AND public.can_view_company(a.company_id, _user_id))
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_appointment_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_appointment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_appointment_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_appointment(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Appointments viewable by authorized" ON public.appointments;
CREATE POLICY "Appointments viewable by authorized"
ON public.appointments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR created_by = auth.uid()
  OR public.is_appointment_participant(id, auth.uid())
  OR (project_id IS NOT NULL AND public.can_view_project(project_id, auth.uid()))
  OR (company_id IS NOT NULL AND public.can_view_company(company_id, auth.uid()))
);

DROP POLICY IF EXISTS "Participants viewable by appointment members" ON public.appointment_participants;
CREATE POLICY "Participants viewable by appointment members"
ON public.appointment_participants FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_view_appointment(appointment_id, auth.uid())
);
