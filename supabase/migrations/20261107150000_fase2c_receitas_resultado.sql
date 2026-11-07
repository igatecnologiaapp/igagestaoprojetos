-- =====================================================================
-- FASE 2C — Receitas e resultado bruto (Superávit / Déficit)
-- Regras aprovadas pela IGA (06/11/2026):
--  * receitas da venda do projeto: implantação (única ou parcelada) e recorrente
--    (mensalidade), cada parcela como contratada, faturada e recebida;
--  * resultado bruto = receitas − custo do projeto; com lucro → Superávit;
--    custo maior ou projeto sem venda → Déficit; zero → Equilíbrio;
--  * base padrão do resultado: valores RECEBIDOS (alternativa: contratados);
--  * valores visíveis só a quem tem permissão financeira.
-- Custo do projeto = parcelas de rateio (finance_cost_allocations) de custos não
-- cancelados com competência até o mês corrente.
-- Idempotente. Não cria bucket nem extensão. Não altera projects.value.
-- =====================================================================

-- 1. Contratos de receita ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL,
  installments int NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date,
  billing_day int,
  status text NOT NULL DEFAULT 'active',
  cancelled_at date,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_revenues_kind_valid CHECK (kind IN ('implementation', 'recurring')),
  CONSTRAINT project_revenues_amount_valid CHECK (amount >= 0),
  CONSTRAINT project_revenues_installments_valid CHECK (installments BETWEEN 1 AND 120),
  CONSTRAINT project_revenues_billing_day_valid CHECK (billing_day IS NULL OR billing_day BETWEEN 1 AND 31),
  CONSTRAINT project_revenues_status_valid CHECK (status IN ('active', 'cancelled')),
  CONSTRAINT project_revenues_dates_valid CHECK (end_date IS NULL OR end_date >= start_date)
);
COMMENT ON TABLE public.project_revenues IS
  'Fase 2C: receitas do projeto. implementation: amount = valor total, dividido em installments parcelas mensais. recurring: amount = valor mensal, de start_date até end_date (ou sem fim).';

-- 2. Parcelas: contratado / faturado / recebido -------------------------
CREATE TABLE IF NOT EXISTS public.project_revenue_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_id uuid NOT NULL REFERENCES public.project_revenues(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  number int NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  invoiced_at date,
  invoice_ref text,
  received_at date,
  received_amount numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_revenue_installments_amount_valid CHECK (amount >= 0),
  CONSTRAINT project_revenue_installments_received_valid CHECK (
    (received_at IS NULL AND received_amount IS NULL)
    OR (received_at IS NOT NULL AND received_amount IS NOT NULL AND received_amount >= 0)),
  CONSTRAINT project_revenue_installments_unique UNIQUE (revenue_id, number)
);
CREATE INDEX IF NOT EXISTS idx_project_revenue_installments_project
  ON public.project_revenue_installments (project_id, due_date);

-- project_id da parcela sempre igual ao do contrato
CREATE OR REPLACE FUNCTION public.project_revenue_installments_sync_project()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT r.project_id INTO NEW.project_id FROM public.project_revenues r WHERE r.id = NEW.revenue_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_project_revenue_installments_sync_project ON public.project_revenue_installments;
CREATE TRIGGER trg_project_revenue_installments_sync_project
  BEFORE INSERT OR UPDATE OF revenue_id, project_id ON public.project_revenue_installments
  FOR EACH ROW EXECUTE FUNCTION public.project_revenue_installments_sync_project();
REVOKE ALL ON FUNCTION public.project_revenue_installments_sync_project() FROM PUBLIC, anon, authenticated;

-- 3. Privilégios, RLS, auditoria ----------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_revenues', 'project_revenue_installments'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s view by financial viewers" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s view by financial viewers" ON public.%I FOR SELECT TO authenticated
                    USING (public.has_permission(auth.uid(), ''financial.view'')
                           AND public.can_view_project(project_id, auth.uid()))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s insert by financial editors" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s insert by financial editors" ON public.%I FOR INSERT TO authenticated
                    WITH CHECK (public.has_permission(auth.uid(), ''financial.edit''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s update by financial editors" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s update by financial editors" ON public.%I FOR UPDATE TO authenticated
                    USING (public.has_permission(auth.uid(), ''financial.edit''))
                    WITH CHECK (public.has_permission(auth.uid(), ''financial.edit''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s delete by financial editors" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s delete by financial editors" ON public.%I FOR DELETE TO authenticated
                    USING (public.has_permission(auth.uid(), ''financial.edit''))', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_audit ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.log_audit(%L)', t, t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_activity ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_activity AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity()', t, t);
  END LOOP;
END $$;

-- 4. Geração das parcelas --------------------------------------------------
-- Implantação: todas as parcelas na criação (mensais a partir do início; a última
-- leva o arredondamento). Recorrente: uma parcela por mês até o mês de _until,
-- enquanto ativa e dentro do período.
CREATE OR REPLACE FUNCTION public.project_revenue_due_date(_start date, _month_offset int, _billing_day int)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT make_date(extract(year FROM m)::int, extract(month FROM m)::int,
                   least(coalesce(_billing_day, extract(day FROM _start)::int),
                         extract(day FROM (m + interval '1 month' - interval '1 day'))::int))
    FROM (SELECT (date_trunc('month', _start) + make_interval(months => _month_offset))::date AS m) x
$$;

CREATE OR REPLACE FUNCTION public.project_revenue_generate_installments(_until date DEFAULT current_date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  k int;
  each_amt numeric;
  due date;
  created int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'financial.view') THEN
    RETURN 0;
  END IF;

  FOR r IN SELECT * FROM public.project_revenues WHERE status = 'active' LOOP
    IF r.kind = 'implementation' THEN
      each_amt := round(r.amount / r.installments, 2);
      FOR k IN 1..r.installments LOOP
        INSERT INTO public.project_revenue_installments (revenue_id, project_id, number, due_date, amount)
        VALUES (r.id, r.project_id, k, public.project_revenue_due_date(r.start_date, k - 1, r.billing_day),
                CASE WHEN k = r.installments THEN r.amount - each_amt * (r.installments - 1) ELSE each_amt END)
        ON CONFLICT (revenue_id, number) DO NOTHING;
        IF FOUND THEN created := created + 1; END IF;
      END LOOP;
    ELSE
      k := 0;
      LOOP
        due := public.project_revenue_due_date(r.start_date, k, r.billing_day);
        EXIT WHEN date_trunc('month', due) > date_trunc('month', _until);
        EXIT WHEN r.end_date IS NOT NULL AND due > r.end_date;
        INSERT INTO public.project_revenue_installments (revenue_id, project_id, number, due_date, amount)
        VALUES (r.id, r.project_id, k + 1, due, r.amount)
        ON CONFLICT (revenue_id, number) DO NOTHING;
        IF FOUND THEN created := created + 1; END IF;
        k := k + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN created;
END; $$;
REVOKE ALL ON FUNCTION public.project_revenue_generate_installments(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_revenue_generate_installments(date) TO authenticated, service_role;

-- Cancelar contrato: parcelas futuras ainda não faturadas nem recebidas são removidas.
CREATE OR REPLACE FUNCTION public.project_revenues_on_cancel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    NEW.cancelled_at := coalesce(NEW.cancelled_at, current_date);
    DELETE FROM public.project_revenue_installments
     WHERE revenue_id = NEW.id AND due_date >= NEW.cancelled_at
       AND invoiced_at IS NULL AND received_at IS NULL;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_project_revenues_on_cancel ON public.project_revenues;
CREATE TRIGGER trg_project_revenues_on_cancel BEFORE UPDATE OF status ON public.project_revenues
  FOR EACH ROW EXECUTE FUNCTION public.project_revenues_on_cancel();
REVOKE ALL ON FUNCTION public.project_revenues_on_cancel() FROM PUBLIC, anon, authenticated;

-- 5. Resultado por projeto ---------------------------------------------------
-- security_invoker: cada usuário só vê o que a RLS de receitas e custos já permite.
CREATE OR REPLACE VIEW public.v_project_financial_result
WITH (security_invoker = true) AS
WITH rev AS (
  SELECT project_id,
         sum(amount) AS contracted,
         sum(amount) FILTER (WHERE invoiced_at IS NOT NULL) AS invoiced,
         sum(received_amount) FILTER (WHERE received_at IS NOT NULL) AS received
    FROM public.project_revenue_installments GROUP BY project_id
), rev_planned AS (
  -- recorrente sem fim: conta o contratado até o mês corrente (parcelas geradas);
  -- implantação: valor total do contrato
  SELECT project_id, sum(amount) FILTER (WHERE kind = 'implementation' AND status = 'active') AS impl_total
    FROM public.project_revenues GROUP BY project_id
), cost AS (
  SELECT a.project_id,
         sum(a.amount) AS cost_total,
         sum(a.amount) FILTER (WHERE c.status = 'paid') AS cost_paid
    FROM public.finance_cost_allocations a
    JOIN public.finance_costs c ON c.id = a.cost_id
   WHERE c.status <> 'cancelled'
     AND c.competence <= (date_trunc('month', current_date) + interval '1 month - 1 day')::date
   GROUP BY a.project_id
)
SELECT p.id AS project_id,
       p.name AS project_name,
       coalesce(rev.contracted, 0) AS revenue_contracted,
       coalesce(rev.invoiced, 0) AS revenue_invoiced,
       coalesce(rev.received, 0) AS revenue_received,
       coalesce(rp.impl_total, 0) AS implementation_total,
       coalesce(cost.cost_total, 0) AS cost_total,
       coalesce(cost.cost_paid, 0) AS cost_paid,
       coalesce(rev.received, 0) - coalesce(cost.cost_total, 0) AS result_received,
       coalesce(rev.contracted, 0) - coalesce(cost.cost_total, 0) AS result_contracted,
       CASE WHEN coalesce(rev.received, 0) - coalesce(cost.cost_total, 0) > 0 THEN 'surplus'
            WHEN coalesce(rev.received, 0) - coalesce(cost.cost_total, 0) < 0 THEN 'deficit'
            WHEN coalesce(rev.received, 0) = 0 AND coalesce(cost.cost_total, 0) = 0 THEN 'none'
            ELSE 'balanced' END AS label_received,
       CASE WHEN coalesce(rev.contracted, 0) - coalesce(cost.cost_total, 0) > 0 THEN 'surplus'
            WHEN coalesce(rev.contracted, 0) - coalesce(cost.cost_total, 0) < 0 THEN 'deficit'
            WHEN coalesce(rev.contracted, 0) = 0 AND coalesce(cost.cost_total, 0) = 0 THEN 'none'
            ELSE 'balanced' END AS label_contracted
  FROM public.projects p
  LEFT JOIN rev ON rev.project_id = p.id
  LEFT JOIN rev_planned rp ON rp.project_id = p.id
  LEFT JOIN cost ON cost.project_id = p.id
 WHERE public.has_permission(auth.uid(), 'financial.view');
GRANT SELECT ON public.v_project_financial_result TO authenticated;
REVOKE ALL ON public.v_project_financial_result FROM anon;
COMMENT ON VIEW public.v_project_financial_result IS
  'Fase 2C: resultado bruto por projeto (receitas − custo rateado até o mês corrente). label: surplus = Superávit, deficit = Déficit, balanced = Equilíbrio, none = sem movimento. Só para quem tem financial.view.';
