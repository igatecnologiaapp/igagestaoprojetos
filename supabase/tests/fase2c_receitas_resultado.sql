-- =====================================================================
-- FASE 2C — Receitas e resultado bruto (Superávit / Déficit)
-- Roda em transação e faz ROLLBACK ao final. Datas fixas em 2026.
-- PRÉ-REQUISITO: igual às demais suítes (usuários de teste em auth.users).
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, esperado text, obtido text, ok boolean) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated, anon;

DO $$
DECLARE
  u_owner uuid := gen_random_uuid();
  u_colab uuid := gen_random_uuid();   -- financial.view, sem financial.edit
  u_view  uuid := gen_random_uuid();   -- sem financial.view (mas com acesso ao projeto)
  c_id uuid; p_venda uuid; p_interno uuid; p_zero uuid; v_id uuid;
  r_impl uuid; r_rec uuid; k uuid; n int; x numeric; t text;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'f2c+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  FROM (VALUES (u_owner),(u_colab),(u_view)) AS x(id);
  DELETE FROM public.user_roles WHERE user_id IN (u_owner,u_colab,u_view);
  INSERT INTO public.user_roles(user_id, role) VALUES (u_owner,'owner'),(u_colab,'collaborator'),(u_view,'viewer');

  INSERT INTO public.companies(name, created_by) VALUES ('F2C Cliente', u_owner) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status) VALUES ('F2C Portal vendido', c_id, u_owner, u_owner, 'in_progress') RETURNING id INTO p_venda;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status) VALUES ('F2C Projeto interno', c_id, u_owner, u_owner, 'in_progress') RETURNING id INTO p_interno;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status) VALUES ('F2C Sem movimento', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p_zero;
  INSERT INTO public.project_shares(project_id, user_id, permission, created_by) VALUES (p_venda, u_colab, 'view', u_owner), (p_venda, u_view, 'view', u_owner);
  INSERT INTO public.finance_vendors(name, created_by) VALUES ('F2C Fornecedor ' || gen_random_uuid(), u_owner) RETURNING id INTO v_id;

  -- Receitas: implantação R$ 10.000 em 3 parcelas a partir de 15/08/2026; recorrente R$ 500/mês de set a dez/2026
  INSERT INTO public.project_revenues(project_id, kind, description, amount, installments, start_date, billing_day, created_by)
  VALUES (p_venda, 'implementation', 'Implantação', 10000, 3, '2026-08-15', 15, u_owner) RETURNING id INTO r_impl;
  INSERT INTO public.project_revenues(project_id, kind, description, amount, start_date, end_date, billing_day, created_by)
  VALUES (p_venda, 'recurring', 'Mensalidade', 500, '2026-09-10', '2026-12-31', 10, u_owner) RETURNING id INTO r_rec;

  -- Visualizador sem permissão financeira não gera nada
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_view,'role','authenticated')::text, true);
  n := public.project_revenue_generate_installments('2026-10-20');
  INSERT INTO _r VALUES ('sem permissão financeira não gera parcelas', '0', n::text, n = 0);
  EXECUTE 'reset role';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);

  n := public.project_revenue_generate_installments('2026-10-20');
  INSERT INTO _r VALUES ('gera 3 parcelas de implantação + set/out da mensalidade', '5', n::text, n = 5);
  SELECT string_agg(amount::text, ',' ORDER BY number) INTO t FROM public.project_revenue_installments WHERE revenue_id = r_impl;
  INSERT INTO _r VALUES ('implantação dividida com arredondamento na última', '3333.33,3333.33,3333.34', t, t = '3333.33,3333.33,3333.34');
  SELECT string_agg(to_char(due_date,'DD/MM'), ',' ORDER BY number) INTO t FROM public.project_revenue_installments WHERE revenue_id = r_impl;
  INSERT INTO _r VALUES ('vencimentos mensais no dia 15', '15/08,15/09,15/10', t, t = '15/08,15/09,15/10');
  n := public.project_revenue_generate_installments('2026-10-20');
  INSERT INTO _r VALUES ('segunda execução não duplica', '0', n::text, n = 0);
  n := public.project_revenue_generate_installments('2027-03-01');
  INSERT INTO _r VALUES ('mensalidade para no fim do contrato (nov e dez)', '2', n::text, n = 2);

  -- Faturado e recebido
  UPDATE public.project_revenue_installments SET invoiced_at = '2026-08-15', invoice_ref = 'NF 101', received_at = '2026-08-20', received_amount = 3333.33
   WHERE revenue_id = r_impl AND number = 1;
  UPDATE public.project_revenue_installments SET invoiced_at = '2026-09-15' WHERE revenue_id = r_impl AND number = 2;
  UPDATE public.project_revenue_installments SET invoiced_at = '2026-09-10', received_at = '2026-09-12', received_amount = 500
   WHERE revenue_id = r_rec AND number = 1;
  BEGIN
    UPDATE public.project_revenue_installments SET received_at = '2026-10-01' WHERE revenue_id = r_rec AND number = 2;
    INSERT INTO _r VALUES ('recebido exige valor recebido', 'negado', 'permitido', false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _r VALUES ('recebido exige valor recebido', 'negado', 'negado', true);
  END;

  -- Custos rateados: projeto vendido R$ 1.900; projeto interno R$ 1.493; um custo cancelado e um futuro não contam
  INSERT INTO public.finance_costs(vendor_id, description, cost_type, competence, amount, status, created_by)
    VALUES (v_id, 'Dev terceirizado', 'one_off', '2026-09-01', 1900, 'paid', u_owner) RETURNING id INTO k;
  INSERT INTO public.finance_cost_allocations(cost_id, project_id, percentage, amount, created_by) VALUES (k, p_venda, 100, 1900, u_owner);
  INSERT INTO public.finance_costs(vendor_id, description, cost_type, competence, amount, status, created_by)
    VALUES (v_id, 'Ferramentas interno', 'one_off', '2026-10-01', 1493, 'open', u_owner) RETURNING id INTO k;
  INSERT INTO public.finance_cost_allocations(cost_id, project_id, percentage, amount, created_by) VALUES (k, p_interno, 100, 1493, u_owner);
  INSERT INTO public.finance_costs(vendor_id, description, cost_type, competence, amount, status, created_by)
    VALUES (v_id, 'Cancelado', 'one_off', '2026-10-01', 999, 'cancelled', u_owner) RETURNING id INTO k;
  INSERT INTO public.finance_cost_allocations(cost_id, project_id, percentage, amount, created_by) VALUES (k, p_venda, 100, 999, u_owner);
  INSERT INTO public.finance_costs(vendor_id, description, cost_type, competence, amount, status, created_by)
    VALUES (v_id, 'Futuro', 'one_off', '2099-01-01', 777, 'forecast', u_owner) RETURNING id INTO k;
  INSERT INTO public.finance_cost_allocations(cost_id, project_id, percentage, amount, created_by) VALUES (k, p_venda, 100, 777, u_owner);

  -- Resultado (visto pelo colaborador com financial.view)
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_colab,'role','authenticated')::text, true);
  SELECT revenue_contracted || '/' || revenue_invoiced || '/' || revenue_received INTO t FROM public.v_project_financial_result WHERE project_id = p_venda;
  INSERT INTO _r VALUES ('vendido: contratado/faturado/recebido', '12000.00/7166.66/3833.33', t, t = '12000.00/7166.66/3833.33');
  SELECT cost_total INTO x FROM public.v_project_financial_result WHERE project_id = p_venda;
  INSERT INTO _r VALUES ('custo ignora cancelado e competência futura', '1900.00', x::text, x = 1900);
  SELECT result_received || ' ' || label_received INTO t FROM public.v_project_financial_result WHERE project_id = p_venda;
  INSERT INTO _r VALUES ('vendido: resultado sobre o recebido = Superávit', '1933.33 surplus', t, t = '1933.33 surplus');
  SELECT result_contracted || ' ' || label_contracted INTO t FROM public.v_project_financial_result WHERE project_id = p_venda;
  INSERT INTO _r VALUES ('vendido: resultado sobre o contratado', '10100.00 surplus', t, t = '10100.00 surplus');
  SELECT count(*) INTO n FROM public.v_project_financial_result WHERE project_id = p_interno;
  INSERT INTO _r VALUES ('colaborador NÃO vê resultado de projeto não compartilhado', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.project_revenue_installments WHERE project_id = p_venda;
  INSERT INTO _r VALUES ('colaborador com financial.view vê as parcelas', '7', n::text, n = 7);
  BEGIN
    UPDATE public.project_revenue_installments SET received_at = '2026-10-15', received_amount = 1 WHERE revenue_id = r_impl AND number = 3;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO _r VALUES ('colaborador sem financial.edit NÃO altera receita', '0', n::text, n = 0);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('colaborador sem financial.edit NÃO altera receita', '0', 'negado', true);
  END;
  EXECUTE 'reset role';

  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_view,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.project_revenue_installments;
  INSERT INTO _r VALUES ('visualizador do projeto NÃO vê receitas', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.v_project_financial_result;
  INSERT INTO _r VALUES ('visualizador NÃO vê resultado', '0', n::text, n = 0);
  EXECUTE 'reset role';

  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  SELECT result_received || ' ' || label_received INTO t FROM public.v_project_financial_result WHERE project_id = p_interno;
  INSERT INTO _r VALUES ('sem venda: todo o custo como Déficit', '-1493.00 deficit', t, t = '-1493.00 deficit');
  SELECT label_received INTO t FROM public.v_project_financial_result WHERE project_id = p_zero;
  INSERT INTO _r VALUES ('sem receita nem custo: sem movimento', 'none', t, t = 'none');
  EXECUTE 'reset role';

  -- Cancelar a mensalidade em 01/11: remove só parcelas futuras ainda não faturadas/recebidas
  UPDATE public.project_revenues SET status = 'cancelled', cancelled_at = '2026-11-01' WHERE id = r_rec;
  SELECT string_agg(to_char(due_date,'MM'), ',' ORDER BY number) INTO t FROM public.project_revenue_installments WHERE revenue_id = r_rec;
  INSERT INTO _r VALUES ('cancelamento remove nov/dez, mantém set/out', '09,10', t, t = '09,10');
  n := public.project_revenue_generate_installments('2027-03-01');
  INSERT INTO _r VALUES ('contrato cancelado não volta a gerar', '0', n::text, n = 0);

  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type = 'project_revenues' AND entity_id = r_rec;
  INSERT INTO _r VALUES ('receitas registradas na auditoria', '>=2', n::text, n >= 2);

  EXECUTE 'set local role anon';
  BEGIN
    PERFORM public.project_revenue_generate_installments('2026-10-20');
    INSERT INTO _r VALUES ('anônimo NÃO executa a geração', 'negado', 'permitido', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('anônimo NÃO executa a geração', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';
END $$;

SELECT cenario, esperado, obtido, CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado FROM _r;
ROLLBACK;
