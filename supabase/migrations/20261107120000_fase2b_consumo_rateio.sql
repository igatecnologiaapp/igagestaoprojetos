-- =====================================================================
-- FASE 2B — Consumo por conta de ferramenta e rateio automático
-- Regras aprovadas pela IGA (06–07/11/2026):
--  * cada conta (workspace) de ferramenta é um registro em finance_services
--    (ex.: Lovable — workspace X; plano gratuito = valor 0);
--  * o consumo (créditos de construção + hospedagem/banco) de cada projeto no
--    mês é importado colando o "Usage details" do Lovable, ou lançado à mão;
--  * todos os custos da conta no mês marcados para rateio por consumo
--    (assinatura automática e créditos extras) são divididos na proporção do
--    consumo de cada projeto;
--  * conta sem consumo no mês, ou consumo de projeto não vinculado, fica sem
--    rateio e aparece como "Custo ocioso da IGA" / "não atribuído";
--  * mês fechado congela o rateio; correções viram lançamento de ajuste.
-- Idempotente. Não cria bucket nem extensão.
-- =====================================================================

-- 1. Custos: origem do rateio ------------------------------------------
ALTER TABLE public.finance_costs
  ADD COLUMN IF NOT EXISTS allocation_source text NOT NULL DEFAULT 'manual';
DO $$ BEGIN
  ALTER TABLE public.finance_costs
    ADD CONSTRAINT finance_costs_allocation_source_valid CHECK (allocation_source IN ('manual', 'usage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.finance_costs.allocation_source IS
  'Fase 2B: manual = rateio informado à mão; usage = rateio calculado pelo consumo da conta no mês.';

-- Lançamentos automáticos de despesa fixa passam a ser rateados pelo consumo.
CREATE OR REPLACE FUNCTION public.finance_costs_default_allocation_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.auto_generated THEN
    NEW.allocation_source := 'usage';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_finance_costs_default_allocation_source ON public.finance_costs;
CREATE TRIGGER trg_finance_costs_default_allocation_source
  BEFORE INSERT ON public.finance_costs
  FOR EACH ROW EXECUTE FUNCTION public.finance_costs_default_allocation_source();
REVOKE ALL ON FUNCTION public.finance_costs_default_allocation_source() FROM PUBLIC, anon, authenticated;

UPDATE public.finance_costs SET allocation_source = 'usage'
 WHERE auto_generated AND allocation_source = 'manual';

-- 2. Períodos de consumo (conta × mês) ---------------------------------
CREATE TABLE IF NOT EXISTS public.finance_usage_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.finance_services(id) ON DELETE CASCADE,
  period date NOT NULL,
  unit text NOT NULL DEFAULT 'créditos',
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'open',
  notes text,
  imported_by uuid DEFAULT auth.uid(),
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_usage_periods_first_day CHECK (period = date_trunc('month', period)::date),
  CONSTRAINT finance_usage_periods_status_valid CHECK (status IN ('open', 'closed')),
  CONSTRAINT finance_usage_periods_source_valid CHECK (source IN ('manual', 'paste', 'assisted')),
  CONSTRAINT finance_usage_periods_unique UNIQUE (service_id, period)
);

-- 3. Consumo por projeto -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_usage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.finance_usage_periods(id) ON DELETE CASCADE,
  external_name text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  quantity numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_usage_entries_name_valid CHECK (char_length(btrim(external_name)) BETWEEN 1 AND 200),
  CONSTRAINT finance_usage_entries_quantity_valid CHECK (quantity >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_usage_entries_name
  ON public.finance_usage_entries (period_id, lower(btrim(external_name)));

-- 4. Vínculo lembrado: nome do projeto na ferramenta → projeto da IGA -----
CREATE TABLE IF NOT EXISTS public.finance_usage_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.finance_services(id) ON DELETE CASCADE,
  external_name text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_usage_aliases_name
  ON public.finance_usage_aliases (service_id, lower(btrim(external_name)));

-- 5. Privilégios e RLS (mesmas permissões do financeiro) -----------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_usage_periods', 'finance_usage_entries', 'finance_usage_aliases'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s view by financial viewers" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s view by financial viewers" ON public.%I FOR SELECT TO authenticated
                    USING (public.has_permission(auth.uid(), ''financial.view''))', t, t);
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
  END LOOP;
END $$;

-- 6. Mês fechado não muda ------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_usage_guard_closed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE st text;
BEGIN
  IF TG_TABLE_NAME = 'finance_usage_periods' THEN
    IF TG_OP = 'DELETE' AND OLD.status = 'closed' THEN
      RAISE EXCEPTION 'Mês fechado: o consumo não pode ser excluído. Registre um lançamento de ajuste.';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'closed' THEN
      RAISE EXCEPTION 'Mês fechado: o consumo não pode ser alterado. Registre um lançamento de ajuste.';
    END IF;
    RETURN coalesce(NEW, OLD);
  END IF;
  SELECT p.status INTO st FROM public.finance_usage_periods p
   WHERE p.id = coalesce(NEW.period_id, OLD.period_id);
  IF st = 'closed' THEN
    RAISE EXCEPTION 'Mês fechado: o consumo não pode ser alterado. Registre um lançamento de ajuste.';
  END IF;
  RETURN coalesce(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.finance_usage_guard_closed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finance_usage_periods_guard ON public.finance_usage_periods;
CREATE TRIGGER trg_finance_usage_periods_guard BEFORE UPDATE OR DELETE ON public.finance_usage_periods
  FOR EACH ROW EXECUTE FUNCTION public.finance_usage_guard_closed();
DROP TRIGGER IF EXISTS trg_finance_usage_entries_guard ON public.finance_usage_entries;
CREATE TRIGGER trg_finance_usage_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_usage_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_usage_guard_closed();

-- 7. Rateio pelo consumo -------------------------------------------------
-- Refaz o rateio de todos os custos da conta no mês com allocation_source = 'usage'
-- (não cancelados): parcela de cada projeto = valor × consumo do projeto ÷ consumo total.
-- Consumo de projeto não vinculado e conta sem consumo ficam sem rateio (ocioso).
CREATE OR REPLACE FUNCTION public.finance_apply_usage_allocation(_period_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  per record;
  c record;
  e record;
  total numeric;
  n int;
  i int;
  given numeric;
  pct numeric;
  amt numeric;
  touched int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'financial.edit') THEN
    RAISE EXCEPTION 'Sem permissão para ratear custos.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO per FROM public.finance_usage_periods WHERE id = _period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período de consumo não encontrado.'; END IF;
  IF per.status = 'closed' THEN
    RAISE EXCEPTION 'Mês fechado: o rateio está congelado. Registre um lançamento de ajuste.';
  END IF;

  SELECT coalesce(sum(quantity), 0) INTO total FROM public.finance_usage_entries WHERE period_id = per.id;

  FOR c IN
    SELECT fc.id, fc.amount AS value
      FROM public.finance_costs fc
     WHERE fc.service_id = per.service_id
       AND date_trunc('month', fc.competence)::date = per.period
       AND fc.allocation_source = 'usage'
       AND fc.status <> 'cancelled'
  LOOP
    DELETE FROM public.finance_cost_allocations WHERE cost_id = c.id;
    touched := touched + 1;
    CONTINUE WHEN total = 0;

    SELECT count(*) INTO n FROM (
      SELECT project_id FROM public.finance_usage_entries
       WHERE period_id = per.id AND project_id IS NOT NULL AND quantity > 0
       GROUP BY project_id) q;
    i := 0; given := 0;
    FOR e IN
      SELECT project_id, sum(quantity) AS qty FROM public.finance_usage_entries
       WHERE period_id = per.id AND project_id IS NOT NULL AND quantity > 0
       GROUP BY project_id ORDER BY sum(quantity) DESC, project_id
    LOOP
      i := i + 1;
      pct := round(e.qty * 100 / total, 3);
      -- quando todo o consumo está vinculado, o último projeto fecha o arredondamento
      IF i = n AND NOT EXISTS (SELECT 1 FROM public.finance_usage_entries
                                WHERE period_id = per.id AND project_id IS NULL AND quantity > 0) THEN
        amt := c.value - given;
        pct := greatest(least(100 - coalesce((SELECT sum(percentage) FROM public.finance_cost_allocations WHERE cost_id = c.id), 0), 100), 0.001);
      ELSE
        amt := least(round(c.value * e.qty / total, 2), c.value - given);
      END IF;
      given := given + amt;
      IF pct > 0 THEN
        INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount, created_by)
        VALUES (c.id, e.project_id, pct, greatest(amt, 0), auth.uid());
      END IF;
    END LOOP;
  END LOOP;

  RETURN touched;
END; $$;
REVOKE ALL ON FUNCTION public.finance_apply_usage_allocation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_apply_usage_allocation(uuid) TO authenticated, service_role;

-- Fecha o mês: reaplica o rateio uma última vez e congela.
CREATE OR REPLACE FUNCTION public.finance_close_usage_period(_period_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'financial.edit') THEN
    RAISE EXCEPTION 'Sem permissão para fechar o mês.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.finance_apply_usage_allocation(_period_id);
  UPDATE public.finance_usage_periods
     SET status = 'closed', closed_at = now(), closed_by = auth.uid()
   WHERE id = _period_id;
END; $$;
REVOKE ALL ON FUNCTION public.finance_close_usage_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_close_usage_period(uuid) TO authenticated, service_role;

-- 8. Custo ocioso / não atribuído --------------------------------------
-- Parte de cada custo (não cancelado) que não foi rateada a nenhum projeto.
CREATE OR REPLACE VIEW public.v_finance_unallocated_costs
WITH (security_invoker = true) AS
SELECT fc.id AS cost_id,
       fc.service_id,
       fc.description,
       date_trunc('month', fc.competence)::date AS period,
       fc.currency,
       fc.amount AS value,
       coalesce(sum(a.amount), 0) AS allocated,
       fc.amount - coalesce(sum(a.amount), 0) AS unallocated,
       fc.status
  FROM public.finance_costs fc
  LEFT JOIN public.finance_cost_allocations a ON a.cost_id = fc.id
 WHERE fc.status <> 'cancelled'
 GROUP BY fc.id
HAVING fc.amount - coalesce(sum(a.amount), 0) > 0;
GRANT SELECT ON public.v_finance_unallocated_costs TO authenticated;
REVOKE ALL ON public.v_finance_unallocated_costs FROM anon;
COMMENT ON VIEW public.v_finance_unallocated_costs IS
  'Fase 2B: custo ocioso / não atribuído (parte não rateada). Respeita a RLS de finance_costs (security_invoker).';
