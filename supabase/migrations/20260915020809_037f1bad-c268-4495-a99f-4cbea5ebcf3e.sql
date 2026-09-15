DROP POLICY IF EXISTS finance_budgets_update ON public.finance_budgets;
DROP POLICY IF EXISTS finance_budgets_delete ON public.finance_budgets;

CREATE POLICY finance_budgets_update ON public.finance_budgets
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'financial.edit') AND public.can_view_project(project_id, auth.uid()))
  WITH CHECK (public.has_permission(auth.uid(), 'financial.edit') AND public.can_view_project(project_id, auth.uid()));

CREATE POLICY finance_budgets_delete ON public.finance_budgets
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'financial.edit') AND public.can_view_project(project_id, auth.uid()));