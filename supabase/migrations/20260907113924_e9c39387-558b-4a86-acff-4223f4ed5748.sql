-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.finance_cost_type AS ENUM ('recurring','one_off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.finance_cost_status AS ENUM ('forecast','open','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TABELA DE CUSTOS
CREATE TABLE IF NOT EXISTS public.finance_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.finance_services(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.finance_vendors(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  description text NOT NULL,
  cost_type public.finance_cost_type NOT NULL DEFAULT 'one_off',
  competence date NOT NULL,
  due_date date,
  paid_at date,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  amount_brl numeric(14,2) CHECK (amount_brl IS NULL OR amount_brl >= 0),
  status public.finance_cost_status NOT NULL DEFAULT 'open',
  is_shared boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_costs TO authenticated;
GRANT ALL ON public.finance_costs TO service_role;

ALTER TABLE public.finance_costs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_finance_costs_competence ON public.finance_costs(competence DESC);
CREATE INDEX IF NOT EXISTS idx_finance_costs_status ON public.finance_costs(status);
CREATE INDEX IF NOT EXISTS idx_finance_costs_vendor ON public.finance_costs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_finance_costs_category ON public.finance_costs(category_id);
CREATE INDEX IF NOT EXISTS idx_finance_costs_service ON public.finance_costs(service_id);

-- TABELA DE RATEIOS
CREATE TABLE IF NOT EXISTS public.finance_cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_id uuid NOT NULL REFERENCES public.finance_costs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  percentage numeric(6,3) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cost_id, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_cost_allocations TO authenticated;
GRANT ALL ON public.finance_cost_allocations TO service_role;

ALTER TABLE public.finance_cost_allocations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_finance_cost_alloc_project ON public.finance_cost_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_finance_cost_alloc_cost ON public.finance_cost_allocations(cost_id);

-- VALIDACAO DE SOMA DE RATEIO
CREATE OR REPLACE FUNCTION public.validate_cost_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct numeric;
  v_amt numeric;
  v_cost_amount numeric;
BEGIN
  SELECT COALESCE(SUM(percentage),0), COALESCE(SUM(amount),0)
    INTO v_pct, v_amt
    FROM public.finance_cost_allocations
   WHERE cost_id = NEW.cost_id AND id <> NEW.id;

  v_pct := v_pct + NEW.percentage;
  v_amt := v_amt + NEW.amount;

  IF v_pct > 100.0001 THEN
    RAISE EXCEPTION 'A soma dos rateios deste custo não pode ultrapassar 100%% (total seria %).', round(v_pct,3);
  END IF;

  SELECT amount INTO v_cost_amount FROM public.finance_costs WHERE id = NEW.cost_id;
  IF v_cost_amount IS NOT NULL AND v_amt > v_cost_amount + 0.01 THEN
    RAISE EXCEPTION 'O valor rateado (%) não pode exceder o valor do custo (%).', round(v_amt,2), v_cost_amount;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_cost_allocation ON public.finance_cost_allocations;
CREATE TRIGGER trg_validate_cost_allocation
BEFORE INSERT OR UPDATE ON public.finance_cost_allocations
FOR EACH ROW EXECUTE FUNCTION public.validate_cost_allocation();

-- ULTIMA ATIVIDADE VIA RATEIO
CREATE OR REPLACE FUNCTION public.touch_project_activity_via_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_pid := OLD.project_id; ELSE v_pid := NEW.project_id; END IF;
  IF v_pid IS NOT NULL THEN
    UPDATE public.projects SET last_activity_at = clock_timestamp() WHERE id = v_pid;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_alloc_activity ON public.finance_cost_allocations;
CREATE TRIGGER trg_alloc_activity
AFTER INSERT OR UPDATE OR DELETE ON public.finance_cost_allocations
FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity_via_allocation();

-- ULTIMA ATIVIDADE DOS PROJETOS RATEADOS QUANDO O CUSTO MUDA
CREATE OR REPLACE FUNCTION public.touch_projects_via_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_cid := OLD.id; ELSE v_cid := NEW.id; END IF;
  UPDATE public.projects p SET last_activity_at = clock_timestamp()
   WHERE p.id IN (SELECT a.project_id FROM public.finance_cost_allocations a WHERE a.cost_id = v_cid);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_costs_activity ON public.finance_costs;
CREATE TRIGGER trg_costs_activity
AFTER UPDATE OR DELETE ON public.finance_costs
FOR EACH ROW EXECUTE FUNCTION public.touch_projects_via_cost();

-- UPDATED_AT + AUDITORIA
DROP TRIGGER IF EXISTS trg_finance_costs_updated ON public.finance_costs;
CREATE TRIGGER trg_finance_costs_updated
BEFORE UPDATE ON public.finance_costs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_finance_costs_audit ON public.finance_costs;
CREATE TRIGGER trg_finance_costs_audit
AFTER INSERT OR UPDATE OR DELETE ON public.finance_costs
FOR EACH ROW EXECUTE FUNCTION public.log_audit('finance_costs');

DROP TRIGGER IF EXISTS trg_finance_cost_allocations_audit ON public.finance_cost_allocations;
CREATE TRIGGER trg_finance_cost_allocations_audit
AFTER INSERT OR UPDATE OR DELETE ON public.finance_cost_allocations
FOR EACH ROW EXECUTE FUNCTION public.log_audit('finance_cost_allocations');

-- HELPER: custo visivel por projeto rateado
CREATE OR REPLACE FUNCTION public.can_view_cost(_cost_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_permission(_user_id, 'financial.view')
    OR EXISTS (
      SELECT 1 FROM public.finance_cost_allocations a
      WHERE a.cost_id = _cost_id AND public.can_view_project(a.project_id, _user_id)
    )
  );
$$;

-- POLICIES: finance_costs
DROP POLICY IF EXISTS "finance_costs_select" ON public.finance_costs;
CREATE POLICY "finance_costs_select" ON public.finance_costs
FOR SELECT TO authenticated
USING (public.can_view_cost(id, auth.uid()));

DROP POLICY IF EXISTS "finance_costs_insert" ON public.finance_costs;
CREATE POLICY "finance_costs_insert" ON public.finance_costs
FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));

DROP POLICY IF EXISTS "finance_costs_update" ON public.finance_costs;
CREATE POLICY "finance_costs_update" ON public.finance_costs
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'financial.edit'))
WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));

DROP POLICY IF EXISTS "finance_costs_delete" ON public.finance_costs;
CREATE POLICY "finance_costs_delete" ON public.finance_costs
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), 'financial.edit'));

-- POLICIES: finance_cost_allocations
DROP POLICY IF EXISTS "finance_cost_allocations_select" ON public.finance_cost_allocations;
CREATE POLICY "finance_cost_allocations_select" ON public.finance_cost_allocations
FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'financial.view')
  OR public.can_view_project(project_id, auth.uid())
);

DROP POLICY IF EXISTS "finance_cost_allocations_insert" ON public.finance_cost_allocations;
CREATE POLICY "finance_cost_allocations_insert" ON public.finance_cost_allocations
FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));

DROP POLICY IF EXISTS "finance_cost_allocations_update" ON public.finance_cost_allocations;
CREATE POLICY "finance_cost_allocations_update" ON public.finance_cost_allocations
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'financial.edit'))
WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));

DROP POLICY IF EXISTS "finance_cost_allocations_delete" ON public.finance_cost_allocations;
CREATE POLICY "finance_cost_allocations_delete" ON public.finance_cost_allocations
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), 'financial.edit'));

REVOKE ALL ON public.finance_costs FROM anon;
REVOKE ALL ON public.finance_cost_allocations FROM anon;