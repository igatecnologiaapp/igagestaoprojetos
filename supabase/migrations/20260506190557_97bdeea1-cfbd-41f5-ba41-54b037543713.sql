-- Enum of modules
DO $$ BEGIN
  CREATE TYPE public.app_module AS ENUM ('companies','projects','tasks','appointments','reports');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Per-user module access (admins/owners ignore this and access everything).
-- If a non-owner has zero rows here, they default to access ALL modules (backwards compat).
-- If they have any row, they are restricted to those modules.
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module public.app_module NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Module access viewable" ON public.user_module_access
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners manage module access" ON public.user_module_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- External collaborators (users that are NOT registered in auth.users)
CREATE TABLE IF NOT EXISTS public.external_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);
ALTER TABLE public.external_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "External viewable" ON public.external_collaborators
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "External insert by editors" ON public.external_collaborators
  FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "External update by editors" ON public.external_collaborators
  FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "External delete by owners" ON public.external_collaborators
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER set_updated_at_external
  BEFORE UPDATE ON public.external_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Project shares (same shape as task_shares but supports external collaborators too)
CREATE TABLE IF NOT EXISTS public.project_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid,
  external_id uuid REFERENCES public.external_collaborators(id) ON DELETE CASCADE,
  permission public.task_permission NOT NULL DEFAULT 'view',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) <> (external_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS project_shares_user_uniq
  ON public.project_shares(project_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_shares_external_uniq
  ON public.project_shares(project_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project shares viewable" ON public.project_shares
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Project shares manage" ON public.project_shares
  FOR ALL TO authenticated
  USING (public.can_edit(auth.uid()))
  WITH CHECK (public.can_edit(auth.uid()));

-- Add external collaborator support to task_shares
ALTER TABLE public.task_shares
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS external_id uuid REFERENCES public.external_collaborators(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE public.task_shares
    ADD CONSTRAINT task_shares_target_chk CHECK ((user_id IS NOT NULL) <> (external_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS task_shares_external_uniq
  ON public.task_shares(task_id, external_id) WHERE external_id IS NOT NULL;