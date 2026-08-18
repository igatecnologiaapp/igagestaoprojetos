-- 1. Projects new columns
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

-- 2. Enums
DO $$ BEGIN
  CREATE TYPE public.prompt_type AS ENUM ('initial','adjustment','fix','feature','security','database','ux','audit','tests','docs','staging','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.custom_field_type AS ENUM ('text','textarea','number','currency','date','datetime','boolean','select','multiselect','url','email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Helper: touch project last_activity_at
CREATE OR REPLACE FUNCTION public.touch_project_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_pid := (to_jsonb(OLD)->>'project_id')::uuid;
  ELSE
    v_pid := (to_jsonb(NEW)->>'project_id')::uuid;
  END IF;
  IF v_pid IS NOT NULL THEN
    UPDATE public.projects SET last_activity_at = now() WHERE id = v_pid;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.touch_own_project_activity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.last_activity_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projects_activity ON public.projects;
CREATE TRIGGER trg_projects_activity BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.touch_own_project_activity();

DROP TRIGGER IF EXISTS trg_tasks_project_activity ON public.tasks;
CREATE TRIGGER trg_tasks_project_activity AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();

-- 4. project_emails
CREATE TABLE IF NOT EXISTS public.project_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  provider text,
  purpose text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_emails TO authenticated;
GRANT ALL ON public.project_emails TO service_role;
ALTER TABLE public.project_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project emails viewable" ON public.project_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "Project emails insert" ON public.project_emails FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Project emails update" ON public.project_emails FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "Project emails delete" ON public.project_emails FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

-- 5. project_github_repos
CREATE TABLE IF NOT EXISTS public.project_github_repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  owner text,
  repo_name text,
  default_branch text,
  status text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_github_repos TO authenticated;
GRANT ALL ON public.project_github_repos TO service_role;
ALTER TABLE public.project_github_repos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Github viewable" ON public.project_github_repos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Github insert" ON public.project_github_repos FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Github update" ON public.project_github_repos FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "Github delete" ON public.project_github_repos FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

-- 6. project_lovable
CREATE TABLE IF NOT EXISTS public.project_lovable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  account_email text,
  project_url text,
  public_url text,
  workspace text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_lovable TO authenticated;
GRANT ALL ON public.project_lovable TO service_role;
ALTER TABLE public.project_lovable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lovable viewable" ON public.project_lovable FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lovable insert" ON public.project_lovable FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Lovable update" ON public.project_lovable FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "Lovable delete" ON public.project_lovable FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

-- 7. project_credits
CREATE TABLE IF NOT EXISTS public.project_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT current_date,
  amount numeric NOT NULL,
  description text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_credits TO authenticated;
GRANT ALL ON public.project_credits TO service_role;
ALTER TABLE public.project_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Credits viewable" ON public.project_credits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Credits insert" ON public.project_credits FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Credits update" ON public.project_credits FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "Credits delete" ON public.project_credits FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

-- 8. project_prompts
CREATE TABLE IF NOT EXISTS public.project_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  prompt_type public.prompt_type NOT NULL DEFAULT 'other',
  purpose text,
  prompt_date date NOT NULL DEFAULT current_date,
  sent_to_lovable_at date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_prompts TO authenticated;
GRANT ALL ON public.project_prompts TO service_role;
ALTER TABLE public.project_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prompts viewable" ON public.project_prompts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Prompts insert" ON public.project_prompts FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Prompts update" ON public.project_prompts FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "Prompts delete" ON public.project_prompts FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

-- 9. project_links
CREATE TABLE IF NOT EXISTS public.project_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  category text NOT NULL DEFAULT 'Outro',
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_links TO authenticated;
GRANT ALL ON public.project_links TO service_role;
ALTER TABLE public.project_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Links viewable" ON public.project_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Links insert" ON public.project_links FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Links update" ON public.project_links FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "Links delete" ON public.project_links FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

-- 10. project_accounts (NO password/secret column by design)
CREATE TABLE IF NOT EXISTS public.project_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text,
  username text,
  email text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_accounts TO authenticated;
GRANT ALL ON public.project_accounts TO service_role;
ALTER TABLE public.project_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accounts owners only select" ON public.project_accounts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Accounts owners only write" ON public.project_accounts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- 11. Custom fields
CREATE TABLE IF NOT EXISTS public.project_custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  field_type public.custom_field_type NOT NULL DEFAULT 'text',
  active boolean NOT NULL DEFAULT true,
  required boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  options jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_custom_field_definitions TO authenticated;
GRANT ALL ON public.project_custom_field_definitions TO service_role;
ALTER TABLE public.project_custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Field defs viewable" ON public.project_custom_field_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Field defs owners manage" ON public.project_custom_field_definitions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TABLE IF NOT EXISTS public.project_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  field_definition_id uuid NOT NULL REFERENCES public.project_custom_field_definitions(id) ON DELETE CASCADE,
  value text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, field_definition_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_custom_field_values TO authenticated;
GRANT ALL ON public.project_custom_field_values TO service_role;
ALTER TABLE public.project_custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Field values viewable" ON public.project_custom_field_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "Field values insert" ON public.project_custom_field_values FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Field values update" ON public.project_custom_field_values FOR UPDATE TO authenticated USING (public.can_edit(auth.uid()));
CREATE POLICY "Field values delete" ON public.project_custom_field_values FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

-- 12. updated_at + activity + audit triggers on all new project child tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_emails','project_github_repos','project_lovable','project_credits','project_prompts','project_links','project_accounts','project_custom_field_values'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_activity ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_activity AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_audit ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.log_audit(%1$L)', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_field_defs_updated ON public.project_custom_field_definitions;
CREATE TRIGGER trg_field_defs_updated BEFORE UPDATE ON public.project_custom_field_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_field_defs_audit ON public.project_custom_field_definitions;
CREATE TRIGGER trg_field_defs_audit AFTER INSERT OR UPDATE OR DELETE ON public.project_custom_field_definitions FOR EACH ROW EXECUTE FUNCTION public.log_audit('project_custom_field_definitions');

-- 13. Indexes
CREATE INDEX IF NOT EXISTS idx_project_emails_project ON public.project_emails(project_id);
CREATE INDEX IF NOT EXISTS idx_project_github_project ON public.project_github_repos(project_id);
CREATE INDEX IF NOT EXISTS idx_project_lovable_project ON public.project_lovable(project_id);
CREATE INDEX IF NOT EXISTS idx_project_credits_project ON public.project_credits(project_id);
CREATE INDEX IF NOT EXISTS idx_project_prompts_project ON public.project_prompts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_links_project ON public.project_links(project_id);
CREATE INDEX IF NOT EXISTS idx_project_accounts_project ON public.project_accounts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_cfv_project ON public.project_custom_field_values(project_id);