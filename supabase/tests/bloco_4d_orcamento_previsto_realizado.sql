-- =====================================================================
-- BLOCO 4D — ORÇAMENTO E PREVISTO × REALIZADO
-- Suíte de verificação estrutural e funcional de finance_budgets.
-- Executar dentro de transação e finalizar com ROLLBACK.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. ESTRUTURA
-- ---------------------------------------------------------------------
SELECT '1.1 tabela finance_budgets existe' AS check,
       to_regclass('public.finance_budgets') IS NOT NULL AS passed;

SELECT '1.2 colunas mínimas' AS check,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='finance_budgets'
           AND column_name IN ('id','project_id','category_id','period_start','period_end',
                               'amount','notes','created_by','created_at','updated_at')) = 10 AS passed;

SELECT '1.3 RLS habilitada' AS check,
       (SELECT relrowsecurity FROM pg_class WHERE relname='finance_budgets') AS passed;

-- Obs.: information_schema.role_table_grants é filtrado pelo papel conectado;
-- usar pg_class.relacl garante leitura fiel dos privilégios.
SELECT '1.4 anon sem privilégios' AS check,
       (SELECT relacl::text NOT LIKE '%anon=%' FROM pg_class WHERE relname='finance_budgets') AS passed;

SELECT '1.5 authenticated com CRUD e service_role total' AS check,
       (SELECT relacl::text LIKE '%authenticated=arwd%' AND relacl::text LIKE '%service_role=arwd%'
          FROM pg_class WHERE relname='finance_budgets') AS passed;

SELECT '1.6 índices criados' AS check,
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
         AND indexname IN ('uq_finance_budgets_scope','idx_finance_budgets_project',
                           'idx_finance_budgets_category','idx_finance_budgets_period')) = 4 AS passed;

SELECT '1.7 constraints de valor e período' AS check,
       (SELECT count(*) FROM pg_constraint
         WHERE conrelid='public.finance_budgets'::regclass
           AND conname IN ('chk_finance_budgets_amount','chk_finance_budgets_period')) = 2 AS passed;

SELECT '1.8 nenhuma policy USING (true)' AS check,
       NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public' AND tablename='finance_budgets'
                      AND (qual = 'true' OR with_check = 'true')) AS passed;

SELECT '1.9 policies reutilizam RBAC financeiro' AS check,
       (SELECT bool_and(coalesce(qual,'') || coalesce(with_check,'') LIKE '%has_permission%')
          FROM pg_policies WHERE schemaname='public' AND tablename='finance_budgets') AS passed;

SELECT '1.10 policy de leitura considera can_view_project' AS check,
       EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname='public' AND tablename='finance_budgets'
                  AND cmd='SELECT' AND qual LIKE '%can_view_project%') AS passed;

SELECT '1.11 triggers de auditoria, updated_at e last_activity' AS check,
       (SELECT count(*) FROM pg_trigger
         WHERE tgrelid='public.finance_budgets'::regclass AND NOT tgisinternal
           AND tgname IN ('trg_finance_budgets_audit','trg_finance_budgets_updated',
                          'trg_finance_budgets_activity')) = 3 AS passed;

-- ---------------------------------------------------------------------
-- 2. MASSA DE TESTE
-- ---------------------------------------------------------------------
CREATE TEMP TABLE t4d(k text primary key, v uuid);

INSERT INTO t4d(k, v)
SELECT 'project', id FROM public.projects ORDER BY created_at LIMIT 1;

INSERT INTO t4d(k, v)
SELECT 'category', id FROM public.finance_categories ORDER BY position, name LIMIT 1;

INSERT INTO public.finance_budgets (project_id, category_id, period_start, period_end, amount, notes)
SELECT (SELECT v FROM t4d WHERE k='project'), NULL, '2099-01-01', '2099-01-31', 1000, 'TESTE 4D — orçamento projeto'
RETURNING id;

INSERT INTO t4d(k, v)
SELECT 'budget', id FROM public.finance_budgets WHERE notes = 'TESTE 4D — orçamento projeto';

SELECT '2.1 orçamento criado' AS check, (SELECT v FROM t4d WHERE k='budget') IS NOT NULL AS passed;

-- valor negativo bloqueado
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance_budgets (project_id, period_start, period_end, amount)
    VALUES ((SELECT v FROM t4d WHERE k='project'), '2099-02-01', '2099-02-28', -1);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  CREATE TEMP TABLE r_neg AS SELECT ok AS passed;
END $$;
SELECT '2.2 valor negativo bloqueado' AS check, passed FROM r_neg;

-- período inválido bloqueado
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance_budgets (project_id, period_start, period_end, amount)
    VALUES ((SELECT v FROM t4d WHERE k='project'), '2099-03-31', '2099-03-01', 10);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  CREATE TEMP TABLE r_per AS SELECT ok AS passed;
END $$;
SELECT '2.3 período inválido bloqueado' AS check, passed FROM r_per;

-- duplicidade projeto/categoria/período bloqueada
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance_budgets (project_id, category_id, period_start, period_end, amount)
    VALUES ((SELECT v FROM t4d WHERE k='project'), NULL, '2099-01-01', '2099-01-31', 500);
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  CREATE TEMP TABLE r_dup AS SELECT ok AS passed;
END $$;
SELECT '2.4 duplicidade bloqueada' AS check, passed FROM r_dup;

-- orçamento por categoria no mesmo período é permitido
INSERT INTO public.finance_budgets (project_id, category_id, period_start, period_end, amount, notes)
VALUES ((SELECT v FROM t4d WHERE k='project'), (SELECT v FROM t4d WHERE k='category'),
        '2099-01-01', '2099-01-31', 400, 'TESTE 4D — orçamento categoria');

SELECT '2.5 orçamento por categoria permitido' AS check,
       EXISTS (SELECT 1 FROM public.finance_budgets WHERE notes='TESTE 4D — orçamento categoria') AS passed;

-- ---------------------------------------------------------------------
-- 3. REALIZADO, SALDO E CONSUMO
-- ---------------------------------------------------------------------
INSERT INTO public.finance_costs (description, amount, currency, competence, cost_type, status, is_shared)
VALUES ('TESTE 4D — custo pago', 600, 'BRL', '2099-01-10', 'one_off', 'paid', false),
       ('TESTE 4D — custo aberto', 300, 'BRL', '2099-01-20', 'one_off', 'open', false),
       ('TESTE 4D — custo cancelado', 900, 'BRL', '2099-01-25', 'one_off', 'cancelled', false);

INSERT INTO public.finance_cost_allocations (cost_id, project_id, percentage, amount)
SELECT c.id, (SELECT v FROM t4d WHERE k='project'), 100, c.amount
  FROM public.finance_costs c WHERE c.description LIKE 'TESTE 4D — custo%';

CREATE TEMP TABLE calc AS
SELECT
  (SELECT amount FROM public.finance_budgets WHERE notes='TESTE 4D — orçamento projeto') AS previsto,
  (SELECT COALESCE(sum(a.amount),0) FROM public.finance_cost_allocations a
     JOIN public.finance_costs c ON c.id = a.cost_id
    WHERE a.project_id = (SELECT v FROM t4d WHERE k='project')
      AND c.status <> 'cancelled'
      AND c.competence BETWEEN '2099-01-01' AND '2099-01-31') AS realizado,
  (SELECT COALESCE(sum(a.amount),0) FROM public.finance_cost_allocations a
     JOIN public.finance_costs c ON c.id = a.cost_id
    WHERE a.project_id = (SELECT v FROM t4d WHERE k='project')
      AND c.status = 'paid'
      AND c.competence BETWEEN '2099-01-01' AND '2099-01-31') AS pago,
  (SELECT COALESCE(sum(a.amount),0) FROM public.finance_cost_allocations a
     JOIN public.finance_costs c ON c.id = a.cost_id
    WHERE a.project_id = (SELECT v FROM t4d WHERE k='project')
      AND c.status IN ('open','forecast')
      AND c.competence BETWEEN '2099-01-01' AND '2099-01-31') AS em_aberto;

SELECT '3.1 realizado ignora cancelados (600+300)' AS check, realizado = 900 AS passed FROM calc;
SELECT '3.2 pago = 600' AS check, pago = 600 AS passed FROM calc;
SELECT '3.3 em aberto = 300' AS check, em_aberto = 300 AS passed FROM calc;
SELECT '3.4 saldo orçamentário = previsto - realizado' AS check, (previsto - realizado) = 100 AS passed FROM calc;
SELECT '3.5 consumo percentual = 90%' AS check,
       round((realizado / previsto) * 100, 2) = 90.00 AS passed FROM calc;

-- orçamento excedido
UPDATE public.finance_budgets SET amount = 500 WHERE notes='TESTE 4D — orçamento projeto';
SELECT '3.6 orçamento excedido detectado (>100%)' AS check,
       (SELECT round((c.realizado / b.amount) * 100, 2) > 100
          FROM calc c, public.finance_budgets b WHERE b.notes='TESTE 4D — orçamento projeto') AS passed;

-- ---------------------------------------------------------------------
-- 4. AUDITORIA E LAST ACTIVITY
-- ---------------------------------------------------------------------
SELECT '4.1 auditoria de criação registrada' AS check,
       EXISTS (SELECT 1 FROM public.audit_history
                WHERE entity_type='finance_budgets' AND action='created'
                  AND entity_id = (SELECT v FROM t4d WHERE k='budget')) AS passed;

SELECT '4.2 auditoria de alteração de valor registrada' AS check,
       EXISTS (SELECT 1 FROM public.audit_history
                WHERE entity_type='finance_budgets' AND action='updated'
                  AND entity_id = (SELECT v FROM t4d WHERE k='budget')
                  AND changes ? 'amount') AS passed;

UPDATE public.finance_budgets SET period_end = '2099-02-28' WHERE notes='TESTE 4D — orçamento projeto';
SELECT '4.3 auditoria de alteração de período registrada' AS check,
       EXISTS (SELECT 1 FROM public.audit_history
                WHERE entity_type='finance_budgets' AND action='updated'
                  AND entity_id = (SELECT v FROM t4d WHERE k='budget')
                  AND changes ? 'period_end') AS passed;

UPDATE public.finance_budgets SET category_id = (SELECT v FROM t4d WHERE k='category')
 WHERE notes='TESTE 4D — orçamento projeto';
SELECT '4.4 auditoria de alteração de categoria registrada' AS check,
       EXISTS (SELECT 1 FROM public.audit_history
                WHERE entity_type='finance_budgets' AND action='updated'
                  AND entity_id = (SELECT v FROM t4d WHERE k='budget')
                  AND changes ? 'category_id') AS passed;

SELECT '4.5 last_activity_at do projeto atualizado' AS check,
       (SELECT last_activity_at > now() - interval '2 minutes'
          FROM public.projects WHERE id = (SELECT v FROM t4d WHERE k='project')) AS passed;

DELETE FROM public.finance_budgets WHERE notes='TESTE 4D — orçamento categoria';
SELECT '4.6 auditoria de exclusão registrada' AS check,
       EXISTS (SELECT 1 FROM public.audit_history
                WHERE entity_type='finance_budgets' AND action='deleted') AS passed;

ROLLBACK;
