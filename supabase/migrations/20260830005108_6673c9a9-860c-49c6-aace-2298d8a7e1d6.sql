CREATE TYPE public.dev_record_type AS ENUM ('decision','version','test','homologation','deployment');
CREATE TYPE public.tech_debt_status AS ENUM ('open','analysis','planned','resolved','accepted');
CREATE TYPE public.tech_debt_priority AS ENUM ('low','medium','high','critical');

CREATE TABLE public.project_development_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  record_type public.dev_record_type NOT NULL,
  title text NOT NULL,
  description text,
  result text,
  event_date date NOT NULL DEFAULT current_date,
  commit_ref text,
  version_ref text,
  environment text,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_development_records TO authenticated;
GRANT ALL ON public.project_development_records TO service_role;
ALTER TABLE public.project_development_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dev records viewable by project dossier members" ON public.project_development_records
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));
CREATE POLICY "Dev records insert" ON public.project_development_records
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Dev records update" ON public.project_development_records
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Dev records delete" ON public.project_development_records
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

CREATE TABLE public.project_technical_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code text,
  title text NOT NULL,
  description text,
  origin text,
  priority public.tech_debt_priority NOT NULL DEFAULT 'medium',
  impact text,
  status public.tech_debt_status NOT NULL DEFAULT 'open',
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  identified_at date NOT NULL DEFAULT current_date,
  resolved_at date,
  resolution text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_technical_debts TO authenticated;
GRANT ALL ON public.project_technical_debts TO service_role;
ALTER TABLE public.project_technical_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Debts viewable by project dossier members" ON public.project_technical_debts
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));
CREATE POLICY "Debts insert" ON public.project_technical_debts
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Debts update" ON public.project_technical_debts
  FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "Debts delete" ON public.project_technical_debts
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

CREATE INDEX idx_dev_records_project ON public.project_development_records(project_id, event_date DESC);
CREATE INDEX idx_tech_debts_project ON public.project_technical_debts(project_id, status);

CREATE TRIGGER trg_dev_records_updated BEFORE UPDATE ON public.project_development_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tech_debts_updated BEFORE UPDATE ON public.project_technical_debts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_dev_records_activity AFTER INSERT OR UPDATE OR DELETE ON public.project_development_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();
CREATE TRIGGER trg_tech_debts_activity AFTER INSERT OR UPDATE OR DELETE ON public.project_technical_debts
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();

CREATE TRIGGER trg_dev_records_audit AFTER INSERT OR UPDATE OR DELETE ON public.project_development_records
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('project_development_records');
CREATE TRIGGER trg_tech_debts_audit AFTER INSERT OR UPDATE OR DELETE ON public.project_technical_debts
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('project_technical_debts');