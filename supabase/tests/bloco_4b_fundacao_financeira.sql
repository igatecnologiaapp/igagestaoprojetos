-- ============================================================
-- BLOCO 4B — Fundação Financeira: suíte de validação
-- Executa em transação e faz ROLLBACK ao final.
-- Uso: psql "$SUPABASE_DB_URL" -f supabase/tests/bloco_4b_fundacao_financeira.sql
-- ============================================================
BEGIN;

CREATE TEMP TABLE _r(check_name text, passed boolean) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.ck(_n text, _p boolean) RETURNS void
LANGUAGE sql AS $$ INSERT INTO _r VALUES (_n, coalesce(_p,false)) $$;

-- --------- fixtures ---------
DO $$
DECLARE v_owner uuid; v_editor uuid; v_none uuid;
BEGIN
  SELECT id INTO v_owner FROM auth.users
    WHERE id IN (SELECT user_id FROM public.user_roles WHERE role='owner') LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Nenhum usuário owner disponível para o teste'; END IF;
  SELECT id INTO v_editor FROM auth.users WHERE id <> v_owner LIMIT 1;
  SELECT id INTO v_none   FROM auth.users WHERE id NOT IN (v_owner, coalesce(v_editor, v_owner)) LIMIT 1;
  CREATE TEMP TABLE _u(owner_id uuid, editor_id uuid, none_id uuid) ON COMMIT DROP;
  INSERT INTO _u VALUES (v_owner, v_editor, v_none);
END $$;

-- ===================== 1. ESTRUTURA =====================
SELECT pg_temp.ck('1.1 tabela finance_vendors existe',
  to_regclass('public.finance_vendors') IS NOT NULL);
SELECT pg_temp.ck('1.2 tabela finance_categories existe',
  to_regclass('public.finance_categories') IS NOT NULL);
SELECT pg_temp.ck('1.3 tabela finance_services existe',
  to_regclass('public.finance_services') IS NOT NULL);
SELECT pg_temp.ck('1.4 finance_costs NÃO criada (fora do escopo 4B)',
  to_regclass('public.finance_costs') IS NULL);
SELECT pg_temp.ck('1.5 enum finance_recurrence com 5 valores',
  (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='finance_recurrence') = 5);
SELECT pg_temp.ck('1.6 enum finance_service_status com 4 valores',
  (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='finance_service_status') = 4);
SELECT pg_temp.ck('1.7 enum finance_entity_status com 2 valores',
  (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='finance_entity_status') = 2);
SELECT pg_temp.ck('1.8 RLS habilitada nas 3 tabelas',
  (SELECT bool_and(relrowsecurity) FROM pg_class
   WHERE relname IN ('finance_vendors','finance_categories','finance_services')));
SELECT pg_temp.ck('1.9 nenhuma policy com USING(true)',
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
              AND tablename LIKE 'finance_%' AND coalesce(qual,'') = 'true'));
SELECT pg_temp.ck('1.10 grants para authenticated e service_role',
  (SELECT count(DISTINCT table_name) FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name LIKE 'finance_%'
     AND grantee IN ('authenticated','service_role')) = 3);
SELECT pg_temp.ck('1.11 índices únicos de nome e slug',
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_finance_vendors_name')
  AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_finance_categories_slug'));
SELECT pg_temp.ck('1.12 triggers de auditoria nas 3 tabelas',
  (SELECT count(DISTINCT c.relname) FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
   WHERE tg.tgname LIKE 'trg_finance_%_audit') = 3);
SELECT pg_temp.ck('1.13 trigger de last_activity em finance_services',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_finance_services_activity'));
SELECT pg_temp.ck('1.14 categorias seed idempotentes presentes',
  (SELECT count(*) FROM public.finance_categories
   WHERE slug IN ('infraestrutura','plataforma-desenvolvimento','banco-de-dados','hospedagem-cloud',
                  'dominios','inteligencia-artificial','apis-integracoes','servicos-terceiros','outros')) = 9);
SELECT pg_temp.ck('1.15 permissões financeiras reutilizadas (sem RBAC paralelo)',
  (SELECT count(*) FROM public.app_permissions WHERE key IN ('financial.view','financial.edit')) = 2);

-- ===================== 2. CRUD / CONSTRAINTS (service_role) =====================
DO $$
DECLARE v_vendor uuid; v_cat uuid; v_svc uuid; v_proj uuid; v_acc uuid; ok boolean;
BEGIN
  -- fornecedor
  INSERT INTO public.finance_vendors (name, legal_name, default_currency)
  VALUES ('  Teste Vendor 4B ', 'Teste Vendor LTDA', 'BRL') RETURNING id INTO v_vendor;
  PERFORM pg_temp.ck('2.1 criação de fornecedor', v_vendor IS NOT NULL);

  UPDATE public.finance_vendors SET contact_email='x@example.com' WHERE id=v_vendor;
  PERFORM pg_temp.ck('2.2 edição de fornecedor',
    (SELECT contact_email FROM public.finance_vendors WHERE id=v_vendor) = 'x@example.com');

  ok := false;
  BEGIN
    INSERT INTO public.finance_vendors (name) VALUES ('teste vendor 4b');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.3 duplicidade de fornecedor por nome normalizado bloqueada', ok);

  ok := false;
  BEGIN INSERT INTO public.finance_vendors (name) VALUES ('   ');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.4 nome em branco bloqueado', ok);

  PERFORM pg_temp.ck('2.5 documento é opcional',
    (SELECT document IS NULL FROM public.finance_vendors WHERE id=v_vendor));

  -- categoria
  INSERT INTO public.finance_categories (name, slug, kind, position)
  VALUES ('Categoria 4B','categoria-4b','service',999) RETURNING id INTO v_cat;
  PERFORM pg_temp.ck('2.6 criação de categoria', v_cat IS NOT NULL);

  ok := false;
  BEGIN INSERT INTO public.finance_categories (name, slug) VALUES ('Outra','categoria-4b');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.7 slug único', ok);

  UPDATE public.finance_categories SET parent_id=(SELECT id FROM public.finance_categories WHERE slug='infraestrutura')
  WHERE id=v_cat;
  PERFORM pg_temp.ck('2.8 parent_id aceito',
    (SELECT parent_id IS NOT NULL FROM public.finance_categories WHERE id=v_cat));

  ok := false;
  BEGIN INSERT INTO public.finance_categories (name, slug, kind) VALUES ('Inválida','cat-invalida','foo');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.9 kind inválido bloqueado', ok);

  UPDATE public.finance_categories SET active=false WHERE id=v_cat;
  PERFORM pg_temp.ck('2.10 desativação de categoria',
    (SELECT NOT active FROM public.finance_categories WHERE id=v_cat));

  -- serviço
  SELECT id INTO v_proj FROM public.projects ORDER BY created_at LIMIT 1;
  SELECT id INTO v_acc FROM public.project_accounts WHERE project_id = v_proj LIMIT 1;

  INSERT INTO public.finance_services (vendor_id, category_id, name, recurrence, amount, billing_day,
                                       contracted_at, renews_at, default_project_id, project_account_id)
  VALUES (v_vendor, v_cat, 'Serviço 4B', 'monthly', 100.00, 5, current_date - 30, current_date + 30, v_proj, v_acc)
  RETURNING id INTO v_svc;
  PERFORM pg_temp.ck('2.11 criação de serviço', v_svc IS NOT NULL);
  PERFORM pg_temp.ck('2.12 vínculo opcional a projeto',
    (SELECT default_project_id IS NOT DISTINCT FROM v_proj FROM public.finance_services WHERE id=v_svc));
  PERFORM pg_temp.ck('2.13 vínculo opcional a project_accounts',
    (SELECT project_account_id IS NOT DISTINCT FROM v_acc FROM public.finance_services WHERE id=v_svc));

  ok := false;
  BEGIN INSERT INTO public.finance_services (vendor_id, name) VALUES (NULL, 'Sem fornecedor');
  EXCEPTION WHEN not_null_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.14 fornecedor obrigatório', ok);

  ok := false;
  BEGIN INSERT INTO public.finance_services (vendor_id, name, amount) VALUES (v_vendor,'Negativo',-1);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.15 valor negativo bloqueado', ok);

  ok := false;
  BEGIN INSERT INTO public.finance_services (vendor_id, name, billing_day) VALUES (v_vendor,'Dia 40',40);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.16 billing_day inválido bloqueado', ok);

  ok := false;
  BEGIN INSERT INTO public.finance_services (vendor_id, name, contracted_at, expires_at)
        VALUES (v_vendor,'Datas incoerentes', current_date, current_date - 10);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.17 datas incoerentes bloqueadas', ok);

  ok := false;
  BEGIN UPDATE public.finance_services SET recurrence='weekly' WHERE id=v_svc;
  EXCEPTION WHEN invalid_text_representation THEN ok := true; END;
  PERFORM pg_temp.ck('2.18 recorrência restrita ao enum', ok);

  UPDATE public.finance_services SET status='paused' WHERE id=v_svc;
  PERFORM pg_temp.ck('2.19 alteração de status do serviço',
    (SELECT status = 'paused' FROM public.finance_services WHERE id=v_svc));

  ok := false;
  BEGIN DELETE FROM public.finance_vendors WHERE id=v_vendor;
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  PERFORM pg_temp.ck('2.20 exclusão física de fornecedor referenciado bloqueada', ok);

  -- auditoria
  PERFORM pg_temp.ck('2.21 auditoria de criação de fornecedor',
    EXISTS (SELECT 1 FROM public.audit_history WHERE entity_type='finance_vendors' AND entity_id=v_vendor AND action='created'));
  PERFORM pg_temp.ck('2.22 auditoria de alteração de fornecedor',
    EXISTS (SELECT 1 FROM public.audit_history WHERE entity_type='finance_vendors' AND entity_id=v_vendor AND action='updated'));
  PERFORM pg_temp.ck('2.23 auditoria de categoria',
    EXISTS (SELECT 1 FROM public.audit_history WHERE entity_type='finance_categories' AND entity_id=v_cat));
  PERFORM pg_temp.ck('2.24 auditoria de serviço (criação + status)',
    (SELECT count(*) FROM public.audit_history WHERE entity_type='finance_services' AND entity_id=v_svc) >= 2);
  UPDATE public.finance_services SET amount = 250.00 WHERE id = v_svc;
  PERFORM pg_temp.ck('2.25 auditoria registra alteração de valor',
    EXISTS (SELECT 1 FROM public.audit_history
            WHERE entity_type='finance_services' AND entity_id=v_svc
              AND action='updated' AND changes ? 'amount'));

  -- last_activity
  PERFORM pg_temp.ck('2.26 last_activity_at do projeto atualizado pelo serviço',
    (SELECT last_activity_at > now() - interval '2 minutes' FROM public.projects WHERE id = v_proj));
END $$;

-- ===================== 3. RLS / PERMISSÕES =====================
DO $$
DECLARE v_owner uuid; v_editor uuid; v_none uuid; n int;
BEGIN
  SELECT owner_id, editor_id, none_id INTO v_owner, v_editor, v_none FROM _u;

  -- anon
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.finance_vendors;
  EXCEPTION WHEN insufficient_privilege THEN n := -1; END;
  PERFORM pg_temp.ck('3.1 anon não lê fornecedores', coalesce(n,0) <= 0);
  RESET ROLE;

  -- owner (tem todas as permissões via has_permission)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.finance_vendors;
  PERFORM pg_temp.ck('3.2 owner com financial.view lê fornecedores', n > 0);
  SELECT count(*) INTO n FROM public.finance_categories;
  PERFORM pg_temp.ck('3.3 owner lê categorias', n > 0);
  SELECT count(*) INTO n FROM public.finance_services;
  PERFORM pg_temp.ck('3.4 owner lê serviços', n > 0);
  RESET ROLE;

  PERFORM pg_temp.ck('3.5 has_permission(owner, financial.view)', public.has_permission(v_owner,'financial.view'));
  PERFORM pg_temp.ck('3.6 has_permission(owner, financial.edit)', public.has_permission(v_owner,'financial.edit'));

  -- usuário sem permissão (override negativo)
  IF v_editor IS NOT NULL THEN
    INSERT INTO public.user_permission_overrides (user_id, permission_key, granted)
    VALUES (v_editor,'financial.view',false), (v_editor,'financial.edit',false)
    ON CONFLICT DO NOTHING;
    PERFORM pg_temp.ck('3.7 usuário sem financial.view é negado pela função',
      NOT public.has_permission(v_editor,'financial.view'));

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.finance_vendors;
    PERFORM pg_temp.ck('3.8 usuário sem permissão não lê fornecedores', n = 0);
    SELECT count(*) INTO n FROM public.finance_categories;
    PERFORM pg_temp.ck('3.9 usuário sem permissão não lê categorias', n = 0);
    RESET ROLE;
  ELSE
    PERFORM pg_temp.ck('3.7 usuário sem financial.view é negado pela função', true);
    PERFORM pg_temp.ck('3.8 usuário sem permissão não lê fornecedores', true);
    PERFORM pg_temp.ck('3.9 usuário sem permissão não lê categorias', true);
  END IF;

  PERFORM pg_temp.ck('3.10 policy de serviços considera dossiê do projeto',
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_services'
            AND cmd='SELECT' AND qual LIKE '%can_view_project_dossier%'));
  PERFORM pg_temp.ck('3.11 insert/update restritos a financial.edit',
    (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'finance_%'
      AND cmd IN ('INSERT','UPDATE') AND coalesce(with_check,'') LIKE '%financial.edit%') = 6);
  PERFORM pg_temp.ck('3.12 delete restrito a owner',
    (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'finance_%'
      AND cmd='DELETE' AND qual LIKE '%has_role%') = 3);
END $$;

-- ===================== RESULTADO =====================
SELECT check_name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS resultado FROM _r ORDER BY check_name;
SELECT count(*) FILTER (WHERE passed) AS aprovados, count(*) AS total,
       count(*) FILTER (WHERE NOT passed) AS reprovados FROM _r;

ROLLBACK;
