-- =====================================================================
-- FASE 2B — Consumo por conta e rateio automático
-- Roda em transação e faz ROLLBACK ao final. Valores do exemplo real lido
-- no Lovable em 07/11/2026 (27,82 créditos em 4 projetos).
-- PRÉ-REQUISITO: igual às demais suítes (usuários de teste em auth.users).
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, esperado text, obtido text, ok boolean) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated, anon;

DO $$
DECLARE
  u_owner uuid := gen_random_uuid();
  u_colab uuid := gen_random_uuid();   -- financial.view, sem financial.edit
  u_view  uuid := gen_random_uuid();   -- sem financial.view
  c_id uuid; p1 uuid; p2 uuid; p3 uuid; v_id uuid; s_a uuid; s_b uuid;
  k_fixo uuid; k_extra uuid; k_manual uuid; k_ocioso uuid; per uuid; per_b uuid;
  n int; x numeric; y numeric; t text;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'f2b+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  FROM (VALUES (u_owner),(u_colab),(u_view)) AS x(id);
  DELETE FROM public.user_roles WHERE user_id IN (u_owner,u_colab,u_view);
  INSERT INTO public.user_roles(user_id, role) VALUES (u_owner,'owner'),(u_colab,'collaborator'),(u_view,'viewer');

  INSERT INTO public.companies(name, created_by) VALUES ('F2B Empresa', u_owner) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status) VALUES ('F2B Etiquetas', c_id, u_owner, u_owner, 'in_progress') RETURNING id INTO p1;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status) VALUES ('F2B Gestão Projetos', c_id, u_owner, u_owner, 'in_progress') RETURNING id INTO p2;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status) VALUES ('F2B Produção', c_id, u_owner, u_owner, 'in_progress') RETURNING id INTO p3;
  INSERT INTO public.finance_vendors(name, created_by) VALUES ('F2B Lovable ' || gen_random_uuid(), u_owner) RETURNING id INTO v_id;

  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, is_shared, created_by)
  VALUES (v_id, 'Lovable — Workspace A', 'monthly', 125, 10, '2026-10-10', '2026-10-01', 'active', true, u_owner) RETURNING id INTO s_a;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, is_shared, created_by)
  VALUES (v_id, 'Lovable — Workspace B', 'monthly', 70, 10, '2026-10-10', '2026-10-01', 'active', true, u_owner) RETURNING id INTO s_b;

  PERFORM public.finance_generate_recurring_costs('2026-10-15');
  SELECT id INTO k_fixo FROM public.finance_costs WHERE service_id = s_a AND auto_generated;
  SELECT id INTO k_ocioso FROM public.finance_costs WHERE service_id = s_b AND auto_generated;
  SELECT allocation_source INTO t FROM public.finance_costs WHERE id = k_fixo;
  INSERT INTO _r VALUES ('lançamento automático é rateado pelo consumo', 'usage', t, t = 'usage');

  INSERT INTO public.finance_costs(service_id, vendor_id, description, cost_type, competence, amount, status, allocation_source, created_by)
  VALUES (s_a, v_id, 'Créditos extras out', 'one_off', '2026-10-01', 80, 'paid', 'usage', u_owner) RETURNING id INTO k_extra;
  INSERT INTO public.finance_costs(service_id, vendor_id, description, cost_type, competence, amount, status, created_by)
  VALUES (s_a, v_id, 'Créditos comprados só para Etiquetas', 'one_off', '2026-10-01', 50, 'paid', u_owner) RETURNING id INTO k_manual;
  INSERT INTO public.finance_cost_allocations(cost_id, project_id, percentage, amount, created_by) VALUES (k_manual, p1, 100, 50, u_owner);

  -- Consumo colado do Lovable (outubro)
  INSERT INTO public.finance_usage_periods(service_id, period, source, imported_by) VALUES (s_a, '2026-10-01', 'paste', u_owner) RETURNING id INTO per;
  INSERT INTO public.finance_usage_entries(period_id, external_name, project_id, quantity) VALUES
    (per, 'Gestao Etiquetas', p1, 15.2), (per, 'Iga Gestão de Projetos', p2, 6.41),
    (per, 'Gestao producao', p3, 6.20), (per, 'Gestao Vendas MD Led', NULL, 0.01);
  INSERT INTO public.finance_usage_periods(service_id, period, source, imported_by) VALUES (s_b, '2026-10-01', 'manual', u_owner) RETURNING id INTO per_b;

  -- Colaborador (sem financial.edit) não rateia; visualizador não vê consumo
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_colab,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.finance_usage_entries WHERE period_id = per;
  INSERT INTO _r VALUES ('colaborador com financial.view vê o consumo', '4', n::text, n = 4);
  BEGIN
    PERFORM public.finance_apply_usage_allocation(per);
    INSERT INTO _r VALUES ('colaborador sem financial.edit NÃO rateia', 'negado', 'permitido', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('colaborador sem financial.edit NÃO rateia', 'negado', 'negado', true);
  END;
  BEGIN
    INSERT INTO public.finance_usage_entries(period_id, external_name, quantity) VALUES (per, 'Invasor', 1);
    INSERT INTO _r VALUES ('colaborador sem financial.edit NÃO lança consumo', 'negado', 'permitido', false);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('colaborador sem financial.edit NÃO lança consumo', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_view,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.finance_usage_entries;
  INSERT INTO _r VALUES ('visualizador NÃO vê consumo', '0', n::text, n = 0);
  EXECUTE 'reset role';

  -- Administrador aplica o rateio
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  n := public.finance_apply_usage_allocation(per);
  INSERT INTO _r VALUES ('rateia os 2 custos "por consumo" da conta no mês', '2', n::text, n = 2);
  PERFORM public.finance_apply_usage_allocation(per_b);
  EXECUTE 'reset role';

  SELECT string_agg(a.amount::text, ',' ORDER BY a.amount DESC) INTO t FROM public.finance_cost_allocations a WHERE a.cost_id = k_fixo;
  INSERT INTO _r VALUES ('assinatura R$125: 68,30 / 28,80 / 27,86', '68.30,28.80,27.86', t, t = '68.30,28.80,27.86');
  SELECT string_agg(a.amount::text, ',' ORDER BY a.amount DESC) INTO t FROM public.finance_cost_allocations a WHERE a.cost_id = k_extra;
  INSERT INTO _r VALUES ('créditos extras R$80: 43,71 / 18,43 / 17,83', '43.71,18.43,17.83', t, t = '43.71,18.43,17.83');
  SELECT unallocated INTO x FROM public.v_finance_unallocated_costs WHERE cost_id = k_fixo;
  INSERT INTO _r VALUES ('consumo de projeto não vinculado fica não atribuído', '0.04', x::text, x = 0.04);
  SELECT count(*), sum(amount) INTO n, y FROM public.finance_cost_allocations WHERE cost_id = k_manual;
  INSERT INTO _r VALUES ('custo com rateio manual não é alterado', '1 / 50.00', n || ' / ' || y, n = 1 AND y = 50);
  SELECT unallocated INTO x FROM public.v_finance_unallocated_costs WHERE cost_id = k_ocioso;
  INSERT INTO _r VALUES ('conta sem consumo: valor inteiro como custo ocioso', '70.00', x::text, x = 70);

  -- Vincular o projeto que faltava e refazer: fecha exatamente o total
  UPDATE public.finance_usage_entries SET project_id = p3 WHERE period_id = per AND external_name = 'Gestao Vendas MD Led';
  PERFORM public.finance_apply_usage_allocation(per);
  SELECT sum(amount), sum(percentage) INTO x, y FROM public.finance_cost_allocations WHERE cost_id = k_fixo;
  INSERT INTO _r VALUES ('tudo vinculado: parcelas somam R$125,00 e 100%', '125.00 / 100', x || ' / ' || round(y), x = 125 AND round(y) = 100);
  SELECT count(*) INTO n FROM public.v_finance_unallocated_costs WHERE cost_id IN (k_fixo, k_extra);
  INSERT INTO _r VALUES ('tudo vinculado: nada não atribuído', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.finance_cost_allocations WHERE cost_id = k_fixo AND project_id = p3;
  INSERT INTO _r VALUES ('mesmo projeto em 2 linhas vira 1 parcela', '1', n::text, n = 1);

  -- Vínculo lembrado é único por conta
  INSERT INTO public.finance_usage_aliases(service_id, external_name, project_id) VALUES (s_a, 'Gestao Etiquetas', p1);
  BEGIN
    INSERT INTO public.finance_usage_aliases(service_id, external_name, project_id) VALUES (s_a, ' gestao etiquetas ', p2);
    INSERT INTO _r VALUES ('vínculo duplicado (maiúsc./espaços) recusado', 'negado', 'permitido', false);
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO _r VALUES ('vínculo duplicado (maiúsc./espaços) recusado', 'negado', 'negado', true);
  END;

  -- Fechar o mês congela
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  PERFORM public.finance_close_usage_period(per);
  SELECT status INTO t FROM public.finance_usage_periods WHERE id = per;
  INSERT INTO _r VALUES ('mês fechado', 'closed', t, t = 'closed');
  BEGIN
    UPDATE public.finance_usage_entries SET quantity = 99 WHERE period_id = per AND external_name = 'Gestao Etiquetas';
    INSERT INTO _r VALUES ('mês fechado: consumo NÃO muda', 'negado', 'permitido', false);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('mês fechado: consumo NÃO muda', 'negado', 'negado', true);
  END;
  BEGIN
    PERFORM public.finance_apply_usage_allocation(per);
    INSERT INTO _r VALUES ('mês fechado: rateio NÃO é refeito', 'negado', 'permitido', false);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('mês fechado: rateio NÃO é refeito', 'negado', 'negado', true);
  END;
  BEGIN
    DELETE FROM public.finance_usage_periods WHERE id = per;
    INSERT INTO _r VALUES ('mês fechado: NÃO pode ser excluído', 'negado', 'permitido', false);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('mês fechado: NÃO pode ser excluído', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';

  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type = 'finance_usage_periods' AND entity_id = per;
  INSERT INTO _r VALUES ('consumo e fechamento registrados na auditoria', '>=2', n::text, n >= 2);

  EXECUTE 'set local role anon';
  BEGIN
    PERFORM public.finance_apply_usage_allocation(per_b);
    INSERT INTO _r VALUES ('anônimo NÃO executa o rateio', 'negado', 'permitido', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('anônimo NÃO executa o rateio', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';
END $$;

SELECT cenario, esperado, obtido, CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado FROM _r;
ROLLBACK;
