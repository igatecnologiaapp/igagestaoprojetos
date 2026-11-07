-- =====================================================================
-- FASE 2A — Despesas fixas automáticas
-- Regras aprovadas pela IGA em 06/11/2026:
--  * despesa fixa (assinatura/mensalidade/plano) entra no custo AUTOMATICAMENTE
--    a cada vencimento, conforme a periodicidade, e é rateada entre os projetos;
--  * só para de somar quando o Gestor informa pausa ou cancelamento, com data
--    de efeito; meses já lançados não mudam; ao reativar, volta no próximo vencimento;
--  * o lançamento automático nasce "previsto" (forecast) e passa a "pago" quando
--    o pagamento é confirmado (fluxo já existente na tela de Custos).
--
-- Sem backfill: serviços já cadastrados começam a gerar a partir do mês corrente.
-- Idempotente: pode ser reaplicada sem erro; a geração nunca duplica um vencimento.
-- Nada aqui cria bucket nem extensão (restrições do Lovable Cloud).
-- =====================================================================

-- 1. Novos campos ------------------------------------------------------
ALTER TABLE public.finance_services
  ADD COLUMN IF NOT EXISTS auto_generate boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS generation_start date,
  ADD COLUMN IF NOT EXISTS status_effective_at date;

COMMENT ON COLUMN public.finance_services.auto_generate IS
  'Fase 2A: quando true, o custo de cada vencimento é lançado automaticamente (previsto).';
COMMENT ON COLUMN public.finance_services.generation_start IS
  'Fase 2A: só são gerados vencimentos com data >= generation_start (evita retroativos; ajustado na reativação).';
COMMENT ON COLUMN public.finance_services.status_effective_at IS
  'Fase 2A: data de efeito da última mudança de situação (pausa, cancelamento, reativação).';

UPDATE public.finance_services
   SET generation_start = date_trunc('month', current_date)::date
 WHERE generation_start IS NULL;

UPDATE public.finance_services
   SET status_effective_at = current_date
 WHERE status_effective_at IS NULL AND status <> 'active';

ALTER TABLE public.finance_costs
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.finance_costs.auto_generated IS
  'Fase 2A: true quando o custo foi lançado automaticamente a partir de uma despesa fixa.';

CREATE INDEX IF NOT EXISTS idx_finance_costs_service_competence
  ON public.finance_costs (service_id, competence) WHERE service_id IS NOT NULL;

-- 2. Datas de controle mantidas pelo banco ------------------------------
CREATE OR REPLACE FUNCTION public.finance_services_status_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.generation_start := coalesce(
      NEW.generation_start,
      date_trunc('month', greatest(coalesce(NEW.contracted_at, current_date), current_date))::date);
    IF NEW.status <> 'active' AND NEW.status_effective_at IS NULL THEN
      NEW.status_effective_at := current_date;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Sem data informada junto com a mudança: vale a partir de hoje.
    IF NEW.status_effective_at IS NOT DISTINCT FROM OLD.status_effective_at THEN
      NEW.status_effective_at := current_date;
    END IF;
    -- Reativação: volta a somar a partir do próximo vencimento (nada do período parado).
    IF NEW.status = 'active' AND OLD.status <> 'active' THEN
      NEW.generation_start := greatest(coalesce(NEW.status_effective_at, current_date), coalesce(OLD.generation_start, current_date));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_finance_services_status_dates ON public.finance_services;
CREATE TRIGGER trg_finance_services_status_dates
  BEFORE INSERT OR UPDATE ON public.finance_services
  FOR EACH ROW EXECUTE FUNCTION public.finance_services_status_dates();

-- 3. Geração dos lançamentos ------------------------------------------
-- Gera, para cada despesa fixa, os vencimentos devidos até o mês de _until.
-- Rateio do lançamento gerado: copia o rateio do último lançamento do mesmo serviço;
-- sem histórico, 100% para o projeto padrão do serviço; sem nenhum dos dois, fica
-- sem projeto (listado como "despesa fixa sem projeto" no Painel).
CREATE OR REPLACE FUNCTION public.finance_generate_recurring_costs(_until date DEFAULT current_date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  step int;
  anchor date;
  m date;
  last_month date := date_trunc('month', _until)::date;
  due date;
  bday int;
  v_cost uuid;
  v_prev uuid;
  alloc record;
  total_pct numeric;
  given numeric;
  n_alloc int;
  i int;
  generated int := 0;
BEGIN
  -- Usuário logado precisa poder ver o financeiro; rotina agendada (sem usuário) pode.
  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'financial.view') THEN
    RETURN 0;
  END IF;

  FOR s IN
    SELECT * FROM public.finance_services
     WHERE auto_generate
       AND recurrence <> 'one_off'
       AND amount IS NOT NULL
       AND status IN ('active', 'paused', 'cancelled', 'expired')
  LOOP
    step := CASE s.recurrence
              WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3
              WHEN 'semiannual' THEN 6 WHEN 'annual' THEN 12 END;
    anchor := date_trunc('month', coalesce(s.contracted_at, s.generation_start))::date;
    m := anchor;
    -- avança até o primeiro vencimento não anterior ao início da geração
    WHILE m < date_trunc('month', s.generation_start)::date LOOP
      m := (m + make_interval(months => step))::date;
    END LOOP;

    WHILE m <= last_month LOOP
      bday := coalesce(s.billing_day, extract(day FROM coalesce(s.contracted_at, m))::int, 1);
      due := make_date(extract(year FROM m)::int, extract(month FROM m)::int,
                       least(bday, extract(day FROM (m + interval '1 month' - interval '1 day'))::int));

      IF due >= s.generation_start
         AND (s.expires_at IS NULL OR due <= s.expires_at)
         AND (s.status = 'active' OR due < coalesce(s.status_effective_at, current_date))
         AND NOT EXISTS (
           SELECT 1 FROM public.finance_costs c
            WHERE c.service_id = s.id
              AND date_trunc('month', c.competence) = m)
      THEN
        SELECT c.id INTO v_prev
          FROM public.finance_costs c
         WHERE c.service_id = s.id
           AND EXISTS (SELECT 1 FROM public.finance_cost_allocations a WHERE a.cost_id = c.id)
         ORDER BY c.competence DESC, c.created_at DESC
         LIMIT 1;

        INSERT INTO public.finance_costs (service_id, vendor_id, category_id, description, cost_type,
                                          competence, due_date, amount, currency, amount_brl, status,
                                          is_shared, auto_generated, notes, created_by)
        VALUES (s.id, s.vendor_id, s.category_id,
                s.name || ' — ' || to_char(m, 'MM/YYYY'),
                'recurring', m, due, s.amount, s.currency,
                CASE WHEN s.currency = 'BRL' THEN s.amount END,
                'forecast', s.is_shared, true,
                'Lançado automaticamente (despesa fixa).', NULL)
        RETURNING id INTO v_cost;

        IF v_prev IS NOT NULL THEN
          SELECT count(*), sum(percentage) INTO n_alloc, total_pct
            FROM public.finance_cost_allocations a WHERE a.cost_id = v_prev;
          i := 0; given := 0;
          FOR alloc IN SELECT a.project_id, a.percentage FROM public.finance_cost_allocations a
                        WHERE a.cost_id = v_prev ORDER BY a.percentage DESC, a.project_id LOOP
            i := i + 1;
            INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount, created_by)
            VALUES (v_cost, alloc.project_id, alloc.percentage,
                    CASE WHEN i = n_alloc AND total_pct = 100
                         THEN s.amount - given                         -- último leva o arredondamento
                         ELSE round(s.amount * alloc.percentage / 100, 2) END,
                    NULL);
            given := given + round(s.amount * alloc.percentage / 100, 2);
          END LOOP;
        ELSIF s.default_project_id IS NOT NULL THEN
          INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount, created_by)
          VALUES (v_cost, s.default_project_id, 100, s.amount, NULL);
        END IF;

        generated := generated + 1;
      END IF;
      m := (m + make_interval(months => step))::date;
    END LOOP;
  END LOOP;

  RETURN generated;
END; $$;

REVOKE ALL ON FUNCTION public.finance_generate_recurring_costs(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_generate_recurring_costs(date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.finance_services_status_dates() FROM PUBLIC, anon, authenticated;

-- 4. Agendamento diário, se o pg_cron estiver disponível no ambiente.
--    Sem pg_cron, o sistema chama a geração ao abrir as telas financeiras e o Painel.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.schedule('iga-finance-generate-recurring-costs', '15 9 * * *',
                            'SELECT public.finance_generate_recurring_costs()');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Agendamento pg_cron não criado: %', SQLERRM;
    END;
  END IF;
END $$;
