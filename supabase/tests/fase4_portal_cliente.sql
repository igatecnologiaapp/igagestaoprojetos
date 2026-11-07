-- =====================================================================
-- FASE 4 — Participantes com acesso limitado e Portal do Cliente
-- Roda em transação e faz ROLLBACK ao final.
-- PRÉ-REQUISITO: igual às demais suítes (usuários de teste em auth.users).
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, esperado text, obtido text, ok boolean) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated, anon;

DO $$
DECLARE
  u_owner uuid := gen_random_uuid();
  u_colab uuid := gen_random_uuid();   -- participante COM financial.view
  u_view  uuid := gen_random_uuid();   -- participante SEM financial.view
  u_cli_a uuid := gen_random_uuid();   -- cliente da empresa A
  u_cli_b uuid := gen_random_uuid();   -- cliente da empresa B
  c_a uuid; c_b uuid; p1 uuid; p2 uuid; p3 uuid; t1 uuid; k uuid; r_id uuid;
  f_vis uuid; f_hid uuid; path_vis text; path_hid text;
  n int; t text; j jsonb;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'f4+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb, x.meta
  FROM (VALUES (u_owner, '{}'::jsonb), (u_colab, '{}'::jsonb), (u_view, '{}'::jsonb),
               (u_cli_a, '{"account_type":"client","full_name":"Cliente A"}'::jsonb),
               (u_cli_b, '{"account_type":"client","full_name":"Cliente B"}'::jsonb)) AS x(id, meta);
  DELETE FROM public.user_roles WHERE user_id IN (u_owner,u_colab,u_view);
  INSERT INTO public.user_roles(user_id, role) VALUES (u_owner,'owner'),(u_colab,'collaborator'),(u_view,'viewer');

  SELECT count(*) INTO n FROM public.user_roles WHERE user_id IN (u_cli_a, u_cli_b);
  INSERT INTO _r VALUES ('usuário criado como Cliente não recebe perfil interno', '0', n::text, n = 0);

  INSERT INTO public.companies(name, created_by) VALUES ('F4 Empresa A', u_owner) RETURNING id INTO c_a;
  INSERT INTO public.companies(name, created_by) VALUES ('F4 Empresa B', u_owner) RETURNING id INTO c_b;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status) VALUES ('F4 Portal A', c_a, u_owner, u_owner, 'in_progress') RETURNING id INTO p1;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status) VALUES ('F4 Interno A', c_a, u_owner, u_owner, 'in_progress') RETURNING id INTO p2;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status, client_portal) VALUES ('F4 Portal B', c_b, u_owner, u_owner, 'in_progress', true) RETURNING id INTO p3;
  INSERT INTO public.project_shares(project_id, user_id, permission, created_by) VALUES (p1, u_colab, 'view', u_owner), (p1, u_view, 'view', u_owner);

  INSERT INTO public.client_users(user_id, company_id, created_by) VALUES (u_cli_a, c_a, u_owner), (u_cli_b, c_b, u_owner);

  -- Proteções
  BEGIN
    INSERT INTO public.client_users(user_id, company_id) VALUES (u_colab, c_a);
    INSERT INTO _r VALUES ('usuário interno não vira Cliente', 'negado', 'permitido', false);
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO _r VALUES ('usuário interno não vira Cliente', 'negado', 'negado', true);
  END;
  BEGIN
    INSERT INTO public.user_roles(user_id, role) VALUES (u_cli_a, 'viewer');
    INSERT INTO _r VALUES ('Cliente não recebe perfil interno depois', 'negado', 'permitido', false);
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO _r VALUES ('Cliente não recebe perfil interno depois', 'negado', 'negado', true);
  END;
  BEGIN
    INSERT INTO public.project_shares(project_id, user_id, permission, created_by) VALUES (p1, u_cli_a, 'view', u_owner);
    INSERT INTO _r VALUES ('Cliente não entra como participante interno', 'negado', 'permitido', false);
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO _r VALUES ('Cliente não entra como participante interno', 'negado', 'negado', true);
  END;
  BEGIN
    INSERT INTO public.tasks(project_id, name, created_by, assignee_id, priority, status, position)
      VALUES (p1, 'x', u_owner, u_cli_a, 'low', 'pending', 0);
    INSERT INTO _r VALUES ('Cliente não é responsável por tarefa', 'negado', 'permitido', false);
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO _r VALUES ('Cliente não é responsável por tarefa', 'negado', 'negado', true);
  END;

  -- Conteúdo do projeto A: 3 tarefas (1 visível ao cliente, 1 concluída), 2 documentos (1 compartilhado)
  INSERT INTO public.tasks(project_id, name, created_by, priority, status, position, due_date, client_visible)
    VALUES (p1, 'Entrega do módulo de vendas', u_owner, 'high', 'in_progress', 0, current_date + 10, true) RETURNING id INTO t1;
  INSERT INTO public.tasks(project_id, name, created_by, priority, status, position) VALUES (p1, 'Ajuste interno de prompt', u_owner, 'low', 'completed', 1);
  INSERT INTO public.tasks(project_id, name, created_by, priority, status, position) VALUES (p1, 'Revisar custos Lovable', u_owner, 'low', 'pending', 2);
  path_vis := p1::text || '/manual.pdf'; path_hid := p1::text || '/interno.pdf';
  INSERT INTO public.project_files(project_id, folder, file_name, storage_path, created_by, client_visible)
    VALUES (p1, 'Entregas', 'manual.pdf', path_vis, u_owner, true) RETURNING id INTO f_vis;
  INSERT INTO public.project_files(project_id, folder, file_name, storage_path, created_by)
    VALUES (p1, 'Interno', 'interno.pdf', path_hid, u_owner) RETURNING id INTO f_hid;
  INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('project-files', path_vis, u_owner), ('project-files', path_hid, u_owner);

  -- Financeiro do projeto A: receita com 2 parcelas (1 recebida) e um custo rateado
  INSERT INTO public.project_revenues(project_id, kind, description, amount, installments, start_date, created_by)
    VALUES (p1, 'implementation', 'Implantação', 8000, 2, '2026-09-10', u_owner) RETURNING id INTO r_id;
  INSERT INTO public.project_revenue_installments(revenue_id, project_id, number, due_date, amount, received_at, received_amount, invoice_ref)
    VALUES (r_id, p1, 1, '2026-09-10', 4000, '2026-09-12', 4000, 'NF 77'), (r_id, p1, 2, '2026-10-10', 4000, NULL, NULL, NULL);
  INSERT INTO public.finance_costs(description, cost_type, competence, amount, status, created_by)
    VALUES ('F4 Custo Lovable', 'one_off', '2026-09-01', 1234.56, 'paid', u_owner) RETURNING id INTO k;
  INSERT INTO public.finance_cost_allocations(cost_id, project_id, percentage, amount, created_by) VALUES (k, p1, 100, 1234.56, u_owner);

  -- ---------- Participantes internos ----------
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_view,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects WHERE id = p1;
  INSERT INTO _r VALUES ('participante sem financeiro vê o projeto', '1', n::text, n = 1);
  SELECT (SELECT count(*) FROM public.finance_cost_allocations WHERE project_id = p1)
       + (SELECT count(*) FROM public.finance_costs WHERE id = k) INTO n;
  INSERT INTO _r VALUES ('participante sem financeiro NÃO vê custos nem rateio', '0', n::text, n = 0);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_colab,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.finance_cost_allocations WHERE project_id = p1;
  INSERT INTO _r VALUES ('participante com financeiro vê o rateio', '1', n::text, n = 1);
  SELECT count(*) INTO n FROM public.projects WHERE id = p2;
  INSERT INTO _r VALUES ('participante não vê projeto em que não está', '0', n::text, n = 0);

  -- ---------- Cliente A antes da liberação ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_cli_a,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.client_portal_projects();
  INSERT INTO _r VALUES ('portal fechado: cliente não vê projeto', '0', n::text, n = 0);
  EXECUTE 'reset role';
  UPDATE public.projects SET client_portal = true WHERE id = p1;
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_cli_a,'role','authenticated')::text, true);

  -- ---------- Cliente A com o portal liberado ----------
  SELECT string_agg(name, ',') INTO t FROM public.client_portal_projects();
  INSERT INTO _r VALUES ('cliente vê só o projeto liberado da própria empresa', 'F4 Portal A', t, t = 'F4 Portal A');
  SELECT tasks_total || '/' || tasks_done || '/' || paid_total || '/' || documents INTO t FROM public.client_portal_projects();
  INSERT INTO _r VALUES ('resumo: tarefas/concluídas/pago/documentos', '3/1/4000.00/1', t, t = '3/1/4000.00/1');
  j := public.client_portal_project(p1);
  t := (SELECT string_agg(x->>'name', ',') FROM jsonb_array_elements(j->'tasks') x);
  INSERT INTO _r VALUES ('cliente vê só as tarefas marcadas como visíveis', 'Entrega do módulo de vendas', t, t = 'Entrega do módulo de vendas');
  t := (SELECT string_agg(x->>'file_name', ',') FROM jsonb_array_elements(j->'documents') x);
  INSERT INTO _r VALUES ('cliente vê só os documentos compartilhados', 'manual.pdf', t, t = 'manual.pdf');
  t := (SELECT string_agg((x->>'received_amount') || ' ' || (x->>'invoice_ref'), ',') FROM jsonb_array_elements(j->'payments') x);
  INSERT INTO _r VALUES ('cliente vê só os valores já pagos', '4000.00 NF 77', t, t = '4000.00 NF 77');
  t := CASE WHEN j::text ~* '(cost|custo|1234|allocation|margin|surplus|deficit)' THEN 'vazou' ELSE 'limpo' END;
  INSERT INTO _r VALUES ('portal não traz custos, rateio nem resultado', 'limpo', t, t = 'limpo');
  t := coalesce(public.client_portal_document_path(f_vis), 'null') || ' | ' || coalesce(public.client_portal_document_path(f_hid), 'null');
  INSERT INTO _r VALUES ('caminho de download só do compartilhado', path_vis || ' | null', t, t = path_vis || ' | null');
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-files' AND name IN (path_vis, path_hid);
  INSERT INTO _r VALUES ('Storage: cliente baixa só o compartilhado', '1', n::text, n = 1);

  SELECT (SELECT count(*) FROM public.projects) + (SELECT count(*) FROM public.tasks)
       + (SELECT count(*) FROM public.project_files) + (SELECT count(*) FROM public.companies) INTO n;
  INSERT INTO _r VALUES ('cliente não lê tabelas internas (projetos, tarefas, arquivos, empresas)', '0', n::text, n = 0);
  SELECT (SELECT count(*) FROM public.finance_costs) + (SELECT count(*) FROM public.finance_cost_allocations)
       + (SELECT count(*) FROM public.project_revenues) + (SELECT count(*) FROM public.project_revenue_installments)
       + (SELECT count(*) FROM public.finance_services) + (SELECT count(*) FROM public.finance_budgets) INTO n;
  INSERT INTO _r VALUES ('cliente não lê nenhuma tabela financeira', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.v_project_financial_result;
  INSERT INTO _r VALUES ('cliente não lê o resultado (Superávit/Déficit)', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.profiles WHERE id <> u_cli_a;
  INSERT INTO _r VALUES ('cliente não vê perfis da equipe', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM public.client_portal_contacts(p1);
  INSERT INTO _r VALUES ('cliente não lista contatos do portal', '0', n::text, n = 0);
  t := coalesce(public.client_portal_project(p2)::text, 'null');
  INSERT INTO _r VALUES ('projeto não liberado da mesma empresa: nada', 'null', t, t = 'null');
  BEGIN
    UPDATE public.tasks SET client_visible = true WHERE project_id = p1;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO _r VALUES ('cliente não altera tarefas', '0', n::text, n = 0);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('cliente não altera tarefas', '0', '0', true);
  END;

  -- ---------- Cliente B ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_cli_b,'role','authenticated')::text, true);
  SELECT string_agg(name, ',') INTO t FROM public.client_portal_projects();
  INSERT INTO _r VALUES ('cliente de outra empresa vê só o dele', 'F4 Portal B', t, t = 'F4 Portal B');
  t := coalesce(public.client_portal_project(p1)::text, 'null') || ' | ' || coalesce(public.client_portal_document_path(f_vis), 'null');
  INSERT INTO _r VALUES ('cliente de outra empresa não abre projeto nem arquivo alheio', 'null | null', t, t = 'null | null');

  -- ---------- Gestor ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  SELECT string_agg(full_name, ',') INTO t FROM public.client_portal_contacts(p1);
  INSERT INTO _r VALUES ('gestor vê quem da empresa acessa o portal', 'Cliente A', t, t = 'Cliente A');
  EXECUTE 'reset role';

  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type = 'client_users';
  INSERT INTO _r VALUES ('vínculo de cliente registrado na auditoria', '>=2', n::text, n >= 2);

  EXECUTE 'set local role anon';
  BEGIN
    PERFORM * FROM public.client_portal_projects();
    INSERT INTO _r VALUES ('anônimo NÃO usa o portal', 'negado', 'permitido', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('anônimo NÃO usa o portal', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';
END $$;

SELECT cenario, esperado, obtido, CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado FROM _r;
ROLLBACK;
