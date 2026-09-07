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

SELECT '1.6 RLS habilitada' AS check,
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

SELECT '1.12 triggers de auditoria e atividade' AS check,
       (SELECT count(*) FROM pg_trigger
         WHERE NOT tgisinternal AND tgname IN ('trg_finance_costs_audit','trg_finance_cost_allocations_audit',
                                               'trg_finance_costs_updated','trg_alloc_activity',
                                               'trg_costs_activity','trg_validate_cost_allocation')) = 6 AS passed;

SELECT '1.13 finance_budgets NÃO criada' AS check,
       to_regclass('public.finance_budgets') IS NULL AS passed;

-- ---------------------------------------------------------------------
-- 2. FUNCIONAL — CUSTOS, RATEIO, AUDITORIA, LAST_ACTIVITY
-- ---------------------------------------------------------------------
CREATE TEMP TABLE t4c(k text primary key, v uuid);

INSERT INTO t4c
SELECT 'proj_a', id FROM public.projects ORDER BY created_at LIMIT 1;
INSERT INTO t4c
SELECT 'proj_b', id FROM public.projects WHERE id <> (SELECT v FROM t4c WHERE k='proj_a')
ORDER BY created_at LIMIT 1;

INSERT INTO public.finance_costs (description, cost_type, competence, amount, currency, status)
VALUES ('TESTE 4C — VPS compartilhada', 'recurring', date_trunc('month', now())::date, 500, 'BRL', 'open')
RETURNING id INTO STRICT (SELECT 1);
