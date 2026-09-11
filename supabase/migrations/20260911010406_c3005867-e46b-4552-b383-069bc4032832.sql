CREATE TABLE public.finance_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_finance_budgets_amount CHECK (amount >= 0),
  CONSTRAINT chk_finance_budgets_period CHECK (period_end >= period_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_budgets TO authenticated;
GRANT ALL ON public.finance_budgets TO service_role;
REVOKE ALL ON public.finance_budgets FROM anon;

CREATE UNIQUE INDEX uq_finance_budgets_scope
  ON public.finance_budgets (project_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, period_end);
CREATE INDEX idx_finance_budgets_project ON public.finance_budgets (project_id);
CREATE INDEX idx_finance_budgets_category ON public.finance_budgets (category_id);
CREATE INDEX idx_finance_budgets_period ON public.finance_budgets (period_start, period_end);

ALTER TABLE public.finance_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_budgets_select ON public.finance_budgets
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      public.has_permission(auth.uid(), 'financial.view')
      OR public.can_view_project(project_id, auth.uid())
    )
  );

CREATE POLICY finance_budgets_insert ON public.finance_budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'financial.edit')
    AND public.can_view_project(project_id, auth.uid())
  );

CREATE POLICY finance_budgets_update ON public.finance_budgets
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'financial.edit'))
  WITH CHECK (
    public.has_permission(auth.uid(), 'financial.edit')
    AND public.can_view_project(project_id, auth.uid())
  );

CREATE POLICY finance_budgets_delete ON public.finance_budgets
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'financial.edit'));

CREATE TRIGGER trg_finance_budgets_updated
  BEFORE UPDATE ON public.finance_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_finance_budgets_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_budgets
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('finance_budgets');

CREATE TRIGGER trg_finance_budgets_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_budgets
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();