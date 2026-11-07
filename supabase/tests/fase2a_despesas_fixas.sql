-- =====================================================================
-- FASE 2A — Despesas fixas automáticas
-- Roda em transação e faz ROLLBACK ao final (nenhum dado persiste).
-- Datas fixas (2025/2026) para o resultado não depender do dia da execução.
--
-- PRÉ-REQUISITO: igual às demais suítes (usuários de teste em auth.users).
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, esperado text, obtido text, ok boolean) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated, anon;

DO $$
DECLARE
  u_owner uuid := gen_random_uuid();
  u_colab uuid := gen_random_uuid();   -- collaborator: tem financial.view
  u_view  uuid := gen_random_uuid();   -- viewer: sem financial.view
  c_id uuid; p1 uuid; p2 uuid; v_id uuid;
  s_mensal uuid; s_trim uuid; s_anual uuid; s_pausado uuid; s_cancel uuid; s_unico uuid;
  s_semvalor uuid; s_manual uuid; s_rateado uuid; s_expirado uuid;
  k_dez uuid; n int; tot numeric; x text; g date;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'f2a+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  FROM (VALUES (u_owner),(u_colab),(u_view)) AS x(id);
  DELETE FROM public.user_roles WHERE user_id IN (u_owner,u_colab,u_view);
  INSERT INTO public.user_roles(user_id, role) VALUES (u_owner,'owner'),(u_colab,'collaborator'),(u_view,'viewer');

  INSERT INTO public.companies(name, created_by) VALUES ('F2A Empresa', u_owner) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('F2A P1', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p1;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('F2A P2', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p2;
  INSERT INTO public.finance_vendors(name, created_by) VALUES ('F2A Fornecedor ' || gen_random_uuid(), u_owner) RETURNING id INTO v_id;

  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, default_project_id, created_by)
  VALUES (v_id,'Mensal',     'monthly',   125,  10, '2026-01-10','2026-01-01','active', p1, u_owner) RETURNING id INTO s_mensal;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, created_by)
  VALUES (v_id,'Trimestral', 'quarterly', 300,   5, '2026-01-05','2026-01-01','active', u_owner) RETURNING id INTO s_trim;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, created_by)
  VALUES (v_id,'Anual',      'annual',    1200,  1, '2025-06-01','2026-01-01','active', u_owner) RETURNING id INTO s_anual;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, status_effective_at, created_by)
  VALUES (v_id,'Pausado',    'monthly',   50,   10, '2026-01-10','2026-01-01','paused', '2026-02-20', u_owner) RETURNING id INTO s_pausado;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, status_effective_at, created_by)
  VALUES (v_id,'Cancelado',  'monthly',   70,   10, '2026-01-10','2026-01-01','cancelled', '2026-01-05', u_owner) RETURNING id INTO s_cancel;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, created_by)
  VALUES (v_id,'Unico',      'one_off',   999,  10, '2026-01-10','2026-01-01','active', u_owner) RETURNING id INTO s_unico;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, created_by)
  VALUES (v_id,'Sem valor',  'monthly',   NULL, 10, '2026-01-10','2026-01-01','active', u_owner) RETURNING id INTO s_semvalor;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, auto_generate, created_by)
  VALUES (v_id,'Manual',     'monthly',   80,   10, '2026-01-10','2026-01-01','active', false, u_owner) RETURNING id INTO s_manual;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, is_shared, created_by)
  VALUES (v_id,'Rateado',    'monthly',   100.01, 15, '2025-12-15','2026-01-01','active', true, u_owner) RETURNING id INTO s_rateado;
  INSERT INTO public.finance_services(vendor_id, name, recurrence, amount, billing_day, contracted_at, generation_start, status, status_effective_at, created_by)
  VALUES (v_id,'Expirado',   'monthly',   40,   10, '2026-01-10','2026-01-01','expired', '2026-02-01', u_owner) RETURNING id INTO s_expirado;

  -- Histórico: dez/2025 do serviço rateado, 60% P1 / 40% P2 (lançamento manual)
  INSERT INTO public.finance_costs(service_id, vendor_id, description, cost_type, competence, amount, status, created_by)
    VALUES (s_rateado, v_id, 'Rateado dez', 'recurring', '2025-12-01', 100.01, 'paid', u_owner) RETURNING id INTO k_dez;
  INSERT INTO public.finance_cost_allocations(cost_id, project_id, percentage, amount, created_by) VALUES
    (k_dez, p1, 60, 60.01, u_owner), (k_dez, p2, 40, 40.00, u_owner);
  -- Lançamento manual de fev/2026 do serviço mensal já existe
  INSERT INTO public.finance_costs(service_id, vendor_id, description, cost_type, competence, amount, status, created_by)
    VALUES (s_mensal, v_id, 'Mensal fev manual', 'recurring', '2026-02-01', 125, 'paid', u_owner);

  -- Visualizador (sem financial.view) não gera nada
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_view,'role','authenticated')::text, true);
  n := public.finance_generate_recurring_costs('2026-03-15');
  INSERT INTO _r VALUES ('visualizador sem permissão financeira não gera', '0', n::text, n = 0);
  EXECUTE 'reset role';

  -- Colaborador (financial.view) dispara a geração até 15/03/2026
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_colab,'role','authenticated')::text, true);
  n := public.finance_generate_recurring_costs('2026-03-15');
  EXECUTE 'reset role';
  -- esperado: mensal jan+mar (fev já existia)=2, trimestral jan=1, anual 0, pausado jan+fev=2,
  -- cancelado 0, único 0, sem valor 0, manual 0, rateado jan+fev+mar=3, expirado jan=1 → 9
  INSERT INTO _r VALUES ('total gerado até 15/03/2026', '9', n::text, n = 9);

  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id = s_mensal;
  INSERT INTO _r VALUES ('mensal: não duplica mês com lançamento manual (jan, fev manual, mar)', '3', n::text, n = 3);
  SELECT string_agg(to_char(due_date,'DD/MM'), ',' ORDER BY due_date) INTO x
    FROM public.finance_costs WHERE service_id = s_mensal AND auto_generated;
  INSERT INTO _r VALUES ('mensal: vencimentos no dia de cobrança', '10/01,10/03', x, x = '10/01,10/03');
  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id = s_mensal AND auto_generated AND status = 'forecast' AND cost_type = 'recurring';
  INSERT INTO _r VALUES ('lançamento automático nasce "previsto"', '2', n::text, n = 2);
  SELECT count(*) INTO n FROM public.finance_cost_allocations a JOIN public.finance_costs c ON c.id = a.cost_id
   WHERE c.service_id = s_mensal AND c.auto_generated AND a.project_id = p1 AND a.percentage = 100 AND a.amount = 125;
  INSERT INTO _r VALUES ('sem histórico: 100% no projeto padrão', '2', n::text, n = 2);

  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id = s_trim;
  INSERT INTO _r VALUES ('trimestral: só janeiro até março', '1', n::text, n = 1);
  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id = s_anual;
  INSERT INTO _r VALUES ('anual (contrato em junho): nada até março', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id = s_pausado;
  INSERT INTO _r VALUES ('pausado em 20/02: soma jan e fev, para em mar', '2', n::text, n = 2);
  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id = s_cancel;
  INSERT INTO _r VALUES ('cancelado em 05/01: não soma', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id IN (s_unico, s_semvalor, s_manual);
  INSERT INTO _r VALUES ('pagamento único, sem valor ou automático desligado: não gera', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id = s_expirado;
  INSERT INTO _r VALUES ('expirado em 01/02: só janeiro', '1', n::text, n = 1);

  -- Rateio copiado do histórico, com arredondamento fechando no total
  SELECT count(*) INTO n FROM public.finance_costs WHERE service_id = s_rateado AND auto_generated;
  INSERT INTO _r VALUES ('rateado: 3 meses gerados', '3', n::text, n = 3);
  SELECT count(*) INTO n FROM public.finance_cost_allocations a JOIN public.finance_costs c ON c.id = a.cost_id
   WHERE c.service_id = s_rateado AND c.auto_generated;
  INSERT INTO _r VALUES ('rateado: copia 2 parcelas por mês', '6', n::text, n = 6);
  SELECT max(abs(c.amount - (SELECT sum(a.amount) FROM public.finance_cost_allocations a WHERE a.cost_id = c.id))) INTO tot
    FROM public.finance_costs c WHERE c.service_id = s_rateado AND c.auto_generated;
  INSERT INTO _r VALUES ('rateado: parcelas somam exatamente o total', '0', tot::text, tot = 0);

  -- Idempotência
  n := public.finance_generate_recurring_costs('2026-03-15');
  INSERT INTO _r VALUES ('segunda execução não duplica', '0', n::text, n = 0);

  -- Reativação: volta a somar a partir da data informada, sem o período parado
  UPDATE public.finance_services SET status = 'active', status_effective_at = '2026-06-01' WHERE id = s_pausado;
  SELECT generation_start INTO g FROM public.finance_services WHERE id = s_pausado;
  INSERT INTO _r VALUES ('reativação ajusta início da geração', '2026-06-01', g::text, g = '2026-06-01');
  n := (SELECT count(*) FROM public.finance_costs WHERE service_id = s_pausado);
  PERFORM public.finance_generate_recurring_costs('2026-08-15');
  SELECT string_agg(to_char(competence,'MM'), ',' ORDER BY competence) INTO x FROM public.finance_costs WHERE service_id = s_pausado;
  INSERT INTO _r VALUES ('reativado: jan, fev e depois jun-ago (mar-mai não)', '01,02,06,07,08', x, x = '01,02,06,07,08');

  -- Pausa sem data informada passa a valer hoje
  UPDATE public.finance_services SET status = 'paused' WHERE id = s_trim;
  SELECT status_effective_at INTO g FROM public.finance_services WHERE id = s_trim;
  INSERT INTO _r VALUES ('pausa sem data: vale a partir de hoje', current_date::text, g::text, g = current_date);

  -- Anônimo não executa a geração
  EXECUTE 'set local role anon';
  BEGIN
    PERFORM public.finance_generate_recurring_costs('2026-03-15');
    INSERT INTO _r VALUES ('anônimo NÃO executa a geração', 'negado', 'permitido', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('anônimo NÃO executa a geração', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';
END $$;

SELECT cenario, esperado, obtido, CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado FROM _r;
ROLLBACK;
