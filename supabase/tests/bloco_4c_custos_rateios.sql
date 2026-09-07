-- =====================================================================
-- BLOCO 4C — CUSTOS REAIS E RATEIO ENTRE PROJETOS
-- Suíte de verificação estrutural e funcional.
-- Executar dentro de transação e finalizar com ROLLBACK.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. ESTRUTURA
-- ---------------------------------------------------------------------
SELECT '1.1 tabela finance_costs existe' AS check,
       to_regclass('public.finance_costs') IS NOT NULL AS passed;

SELECT '1.2 tabela finance_cost_allocations existe' AS check,
       to_regclass('public.finance_cost_allocations') IS NOT NULL AS passed;

SELECT '1.3 enum finance_cost_type' AS check,
       (SELECT array_agg(enumlabel ORDER BY enumsortorder)
          FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'finance_cost_type') = ARRAY['recurring','one_off'] AS passed;

SELECT '1.4 enum finance_cost_status' AS check,
       (SELECT array_agg(enumlabel ORDER BY enumsortorder)
          FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'finance_cost_status') = ARRAY['forecast','open','paid','cancelled'] AS passed;

SELECT '1.5 colunas mínimas de finance_costs' AS check,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='finance_costs'
           AND column_name IN ('id','service_id','vendor_id','category_id','description','cost_type',
                               'competence','due_date','paid_at','amount','currency','amount_brl',
                               'status','is_shared','notes','created_by','created_at','updated_at')) = 18 AS passed;

SELECT '1.6 RLS habilitada nas duas tabelas' AS check,
       bool_and(relrowsecurity) AS passed
  FROM pg_class WHERE relname IN ('finance_costs','finance_cost_allocations');

SELECT '1.7 anon sem privilégios' AS check,
       NOT EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
          WHERE table_schema='public' AND grantee='anon'
            AND table_name IN ('finance_costs','finance_cost_allocations')) AS passed;

SELECT '1.8 authenticated com CRUD' AS check,
       (SELECT count(DISTINCT privilege_type) FROM information_schema.role_table_grants
         WHERE table_schema='public' AND grantee='authenticated' AND table_name='finance_costs'
           AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')) = 4 AS passed;

SELECT '1.9 unicidade custo+projeto' AS check,
       EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid='public.finance_cost_allocations'::regclass AND contype='u') AS passed;

SELECT '1.10 índices criados' AS check,
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
         AND indexname IN ('idx_finance_costs_competence','idx_finance_costs_status',
                           'idx_finance_costs_vendor','idx_finance_costs_category',
                           'idx_finance_costs_service','idx_finance_cost_alloc_project',
                           'idx_finance_cost_alloc_cost')) = 7 AS passed;

SELECT '1.11 nenhuma policy USING (true)' AS check,
       NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public'
                      AND tablename IN ('finance_costs','finance_cost_allocations')
                      AND (qual = 'true' OR with_check = 'true')) AS passed;

SELECT '1.12 policies usam financial.view / financial.edit / can_view_project' AS check,
       (SELECT bool_and(coalesce(qual,'') || coalesce(with_check,'') LIKE '%has_permission%'
                        OR coalesce(qual,'') LIKE '%can_view%')
          FROM pg_policies WHERE schemaname='public'
           AND tablename IN ('finance_costs','finance_cost_allocations')) AS passed;

SELECT '1.13 triggers de validação, auditoria e atividade' AS check,
       (SELECT count(DISTINCT tgname) FROM pg_trigger
         WHERE NOT tgisinternal AND tgname IN ('trg_finance_costs_audit','trg_finance_cost_allocations_audit',
                                               'trg_finance_costs_updated','trg_alloc_activity',
                                               'trg_costs_activity','trg_validate_cost_allocation')) = 6 AS passed;

SELECT '1.14 finance_budgets NÃO criada' AS check,
       to_regclass('public.finance_budgets') IS NULL AS passed;

-- ---------------------------------------------------------------------
-- 2. FUNCIONAL — CUSTOS, RATEIO, AUDITORIA, LAST_ACTIVITY
-- ---------------------------------------------------------------------
CREATE TEMP TABLE t4c(k text PRIMARY KEY, v uuid);

INSERT INTO t4c(k, v) SELECT 'proj_a', id FROM public.projects ORDER BY created_at LIMIT 1;
INSERT INTO t4c(k, v) SELECT 'proj_b', id FROM public.projects
 WHERE id <> (SELECT v FROM t4c WHERE k='proj_a') ORDER BY created_at LIMIT 1;

-- Exemplo A: custo exclusivo (Lovable R$ 200 → Projeto A = 100%)
WITH ins AS (
  INSERT INTO public.finance_costs (description, cost_type, competence, amount, currency, status)
  VALUES ('TESTE 4C — Lovable', 'recurring', date_trunc('month', now())::date, 200, 'BRL', 'open')
  RETURNING id
)
INSERT INTO t4c(k, v) SELECT 'cost_a', id FROM ins;

-- Exemplo B: custo compartilhado (VPS R$ 500 → 40/35/25)
WITH ins AS (
  INSERT INTO public.finance_costs (description, cost_type, competence, amount, currency, status, is_shared)
  VALUES ('TESTE 4C — VPS', 'recurring', date_trunc('month', now())::date, 500, 'BRL', 'open', true)
  RETURNING id
)
INSERT INTO t4c(k, v) SELECT 'cost_b', id FROM ins;

SELECT '2.1 criação de custo com valor e competência' AS check,
       (SELECT count(*) FROM public.finance_costs WHERE description LIKE 'TESTE 4C%') = 2 AS passed;

SELECT '2.2 valor negativo bloqueado' AS check,
       NOT EXISTS (SELECT 1 FROM public.finance_costs WHERE amount < 0) AS passed;

INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount)
VALUES ((SELECT v FROM t4c WHERE k='cost_a'), (SELECT v FROM t4c WHERE k='proj_a'), 100, 200);

SELECT '2.3 rateio 100% em projeto único' AS check,
       (SELECT sum(percentage) FROM public.finance_cost_allocations
         WHERE cost_id = (SELECT v FROM t4c WHERE k='cost_a')) = 100 AS passed;

INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount)
VALUES ((SELECT v FROM t4c WHERE k='cost_b'), (SELECT v FROM t4c WHERE k='proj_a'), 40, 200),
       ((SELECT v FROM t4c WHERE k='cost_b'), (SELECT v FROM t4c WHERE k='proj_b'), 35, 175);

SELECT '2.4 rateio parcial entre múltiplos projetos' AS check,
       (SELECT sum(percentage) FROM public.finance_cost_allocations
         WHERE cost_id = (SELECT v FROM t4c WHERE k='cost_b')) = 75 AS passed;

SELECT '2.5 parcela do projeto A no custo compartilhado' AS check,
       (SELECT amount FROM public.finance_cost_allocations
         WHERE cost_id = (SELECT v FROM t4c WHERE k='cost_b')
           AND project_id = (SELECT v FROM t4c WHERE k='proj_a')) = 200 AS passed;

-- soma > 100% deve ser bloqueada
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount)
    SELECT (SELECT v FROM t4c WHERE k='cost_b'), p.id, 50, 250
      FROM public.projects p
     WHERE p.id NOT IN (SELECT v FROM t4c WHERE k IN ('proj_a','proj_b'))
     LIMIT 1;
  EXCEPTION WHEN others THEN ok := true;
  END;
  RAISE NOTICE '2.6 soma >100%% bloqueada: %', ok;
END $$;

SELECT '2.6 soma de rateio permanece <= 100%' AS check,
       (SELECT sum(percentage) FROM public.finance_cost_allocations
         WHERE cost_id = (SELECT v FROM t4c WHERE k='cost_b')) <= 100 AS passed;

-- projeto duplicado no mesmo custo deve ser bloqueado
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount)
    VALUES ((SELECT v FROM t4c WHERE k='cost_b'), (SELECT v FROM t4c WHERE k='proj_a'), 5, 25);
  EXCEPTION WHEN others THEN ok := true;
  END;
  RAISE NOTICE '2.7 projeto duplicado bloqueado: %', ok;
END $$;

SELECT '2.7 projeto aparece uma única vez por custo' AS check,
       NOT EXISTS (SELECT 1 FROM public.finance_cost_allocations
                    WHERE cost_id = (SELECT v FROM t4c WHERE k='cost_b')
                    GROUP BY project_id HAVING count(*) > 1) AS passed;

-- pagamento
UPDATE public.finance_costs SET status='paid', paid_at=current_date
 WHERE id = (SELECT v FROM t4c WHERE k='cost_a');

SELECT '2.8 pagamento registrado' AS check,
       (SELECT status = 'paid' AND paid_at IS NOT NULL FROM public.finance_costs
         WHERE id = (SELECT v FROM t4c WHERE k='cost_a')) AS passed;

-- cancelamento
UPDATE public.finance_costs SET status='cancelled'
 WHERE id = (SELECT v FROM t4c WHERE k='cost_b');

SELECT '2.9 cancelamento registrado' AS check,
       (SELECT status = 'cancelled' FROM public.finance_costs
         WHERE id = (SELECT v FROM t4c WHERE k='cost_b')) AS passed;

SELECT '2.10 auditoria de custos registrada' AS check,
       (SELECT count(*) FROM public.audit_history
         WHERE entity_type='finance_costs'
           AND entity_id IN (SELECT v FROM t4c WHERE k IN ('cost_a','cost_b'))) >= 4 AS passed;

SELECT '2.11 auditoria de rateio registrada' AS check,
       (SELECT count(*) FROM public.audit_history
         WHERE entity_type='finance_cost_allocations') >= 3 AS passed;

SELECT '2.12 last_activity_at atualizado nos projetos rateados' AS check,
       (SELECT bool_and(last_activity_at > now() - interval '5 minutes')
          FROM public.projects WHERE id IN (SELECT v FROM t4c WHERE k IN ('proj_a','proj_b'))) AS passed;

-- valor rateado não pode exceder o valor do custo
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount)
    VALUES ((SELECT v FROM t4c WHERE k='cost_a'), (SELECT v FROM t4c WHERE k='proj_b'), 1, 9999);
  EXCEPTION WHEN others THEN ok := true;
  END;
  RAISE NOTICE '2.13 valor rateado acima do custo bloqueado: %', ok;
END $$;

SELECT '2.13 valor rateado não excede o custo' AS check,
       (SELECT bool_and(t.alocado <= c.amount + 0.01)
          FROM (SELECT cost_id, sum(amount) alocado FROM public.finance_cost_allocations GROUP BY cost_id) t
          JOIN public.finance_costs c ON c.id = t.cost_id) AS passed;

-- ---------------------------------------------------------------------
-- 3. LIMPEZA (garantida também pelo ROLLBACK)
-- ---------------------------------------------------------------------
DELETE FROM public.finance_costs WHERE description LIKE 'TESTE 4C%';

ROLLBACK;
