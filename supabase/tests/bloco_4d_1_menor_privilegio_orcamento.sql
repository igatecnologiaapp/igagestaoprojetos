-- =====================================================================
-- BLOCO 4D.1 — MENOR PRIVILÉGIO EM finance_budgets
-- Verifica que UPDATE e DELETE exigem financial.edit E can_view_project.
-- Executar dentro de transação e finalizar com ROLLBACK.
-- =====================================================================
BEGIN;

-- 1. UPDATE exige permissão financeira E acesso ao projeto (USING e WITH CHECK)
SELECT '1.1 update USING exige financial.edit e can_view_project' AS check,
       (SELECT qual LIKE '%financial.edit%' AND qual LIKE '%can_view_project%'
          FROM pg_policies
         WHERE schemaname='public' AND tablename='finance_budgets'
           AND policyname='finance_budgets_update') AS passed;

SELECT '1.2 update WITH CHECK exige financial.edit e can_view_project' AS check,
       (SELECT with_check LIKE '%financial.edit%' AND with_check LIKE '%can_view_project%'
          FROM pg_policies
         WHERE schemaname='public' AND tablename='finance_budgets'
           AND policyname='finance_budgets_update') AS passed;

-- 2. DELETE exige permissão financeira E acesso ao projeto
SELECT '2.1 delete exige financial.edit e can_view_project' AS check,
       (SELECT qual LIKE '%financial.edit%' AND qual LIKE '%can_view_project%'
          FROM pg_policies
         WHERE schemaname='public' AND tablename='finance_budgets'
           AND policyname='finance_budgets_delete') AS passed;

-- 3. INSERT permanece com a regra vigente
SELECT '3.1 insert mantém financial.edit e can_view_project' AS check,
       (SELECT with_check LIKE '%financial.edit%' AND with_check LIKE '%can_view_project%'
          FROM pg_policies
         WHERE schemaname='public' AND tablename='finance_budgets'
           AND policyname='finance_budgets_insert') AS passed;

-- 4. SELECT inalterado: financial.view OU acesso ao projeto, sempre autenticado
SELECT '4.1 select exige autenticação e financial.view ou can_view_project' AS check,
       (SELECT qual LIKE '%auth.uid() IS NOT NULL%'
               AND qual LIKE '%financial.view%'
               AND qual LIKE '%can_view_project%'
          FROM pg_policies
         WHERE schemaname='public' AND tablename='finance_budgets'
           AND policyname='finance_budgets_select') AS passed;

-- 5. financial.view isolado não concede escrita
SELECT '5.1 nenhuma policy de escrita aceita apenas financial.view' AS check,
       NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public' AND tablename='finance_budgets'
                      AND cmd IN ('INSERT','UPDATE','DELETE')
                      AND coalesce(qual,'') || coalesce(with_check,'') NOT LIKE '%financial.edit%') AS passed;

-- 6. Nenhuma policy permissiva
SELECT '6.1 nenhuma policy USING/WITH CHECK true' AS check,
       NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public' AND tablename='finance_budgets'
                      AND (qual='true' OR with_check='true')) AS passed;

-- 7. Todas as policies restritas a authenticated; anon sem privilégio
SELECT '7.1 policies apenas para authenticated' AS check,
       (SELECT bool_and(roles::text = '{authenticated}')
          FROM pg_policies WHERE schemaname='public' AND tablename='finance_budgets') AS passed;

SELECT '7.2 anon sem privilégios na tabela' AS check,
       (SELECT relacl::text NOT LIKE '%anon=%' FROM pg_class WHERE relname='finance_budgets') AS passed;

-- 8. RLS continua habilitada e estrutura intacta
SELECT '8.1 RLS habilitada' AS check,
       (SELECT relrowsecurity FROM pg_class WHERE relname='finance_budgets') AS passed;

SELECT '8.2 constraints preservadas' AS check,
       (SELECT count(*) FROM pg_constraint
         WHERE conrelid='public.finance_budgets'::regclass
           AND conname IN ('chk_finance_budgets_amount','chk_finance_budgets_period')) = 2 AS passed;

SELECT '8.3 índices preservados' AS check,
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
         AND indexname IN ('uq_finance_budgets_scope','idx_finance_budgets_project',
                           'idx_finance_budgets_category','idx_finance_budgets_period')) = 4 AS passed;

SELECT '8.4 triggers preservados' AS check,
       (SELECT count(*) FROM pg_trigger
         WHERE tgrelid='public.finance_budgets'::regclass AND NOT tgisinternal
           AND tgname IN ('trg_finance_budgets_audit','trg_finance_budgets_updated',
                          'trg_finance_budgets_activity')) = 3 AS passed;

ROLLBACK;
