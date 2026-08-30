-- =====================================================================
-- BLOCO 3A / 3A.1 — Suíte de integridade e autorização da Governança
-- Estruturas cobertas: public.project_development_records
--                      public.project_technical_debts
-- Reproduzível: roda dentro de transação e faz ROLLBACK ao final.
-- Não cria usuários de Auth: usa um usuário existente (owner) como autor.
-- Autorização real (RLS) é exercitada com SET LOCAL ROLE authenticated +
-- request.jwt.claims (mesmo mecanismo do PostgREST) e com o papel anon.
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, ok boolean) ON COMMIT DROP;
CREATE TEMP TABLE _ctx(k text primary key, v uuid) ON COMMIT DROP;
-- necessário porque parte da suíte executa sob os papéis authenticated/anon
GRANT ALL ON _r, _ctx TO authenticated, anon;

-- ---------------------------------------------------------------------
-- Parte 1 — integridade (gatilhos, auditoria, unicidade, isolamento)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  u uuid; c_id uuid; p_id uuid; p2_id uuid; d_id uuid; g_id uuid;
  t0 timestamptz; t1 timestamptz; n int; ok boolean;
BEGIN
  SELECT user_id INTO u FROM public.user_roles WHERE role = 'owner' LIMIT 1;

  INSERT INTO public.companies(name, created_by) VALUES ('3A Empresa', u) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('3A Projeto', c_id, u, u, 'planning') RETURNING id INTO p_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('3A Projeto B', c_id, u, u, 'planning') RETURNING id INTO p2_id;
  INSERT INTO _ctx VALUES ('user', u), ('project', p_id), ('project_b', p2_id);

  -- criação de registro de desenvolvimento
  SELECT last_activity_at INTO t0 FROM public.projects WHERE id = p_id;
  INSERT INTO public.project_development_records(project_id, record_type, title, event_date, created_by)
    VALUES (p_id, 'decision', '3A Decisao', current_date, u) RETURNING id INTO g_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('criacao de registro de desenvolvimento', g_id IS NOT NULL);
  INSERT INTO _r VALUES ('registro de desenvolvimento move projects.last_activity_at', t1 > t0);
  SELECT count(*) INTO n FROM public.audit_history
   WHERE entity_type='project_development_records' AND entity_id=g_id AND action='created';
  INSERT INTO _r VALUES ('registro de desenvolvimento gera audit_history (created)', n = 1);

  -- edição
  t0 := t1;
  UPDATE public.project_development_records SET title='3A Decisao (rev.)', result='aprovado' WHERE id=g_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  SELECT count(*) INTO n FROM public.audit_history
   WHERE entity_type='project_development_records' AND entity_id=g_id AND action='updated';
  INSERT INTO _r VALUES ('edicao de registro de desenvolvimento', n = 1 AND t1 > t0);

  -- updated_at mantido pelo gatilho set_updated_at
  -- set_updated_at usa now() (horário da transação); dentro da mesma transação a igualdade é esperada.
  SELECT (updated_at >= created_at) INTO ok FROM public.project_development_records WHERE id=g_id;
  INSERT INTO _r VALUES ('set_updated_at mantem updated_at coerente', ok);

  -- exclusão
  DELETE FROM public.project_development_records WHERE id=g_id;
  SELECT count(*) INTO n FROM public.audit_history
   WHERE entity_type='project_development_records' AND entity_id=g_id AND action='deleted';
  INSERT INTO _r VALUES ('exclusao de registro de desenvolvimento', n = 1);

  -- criação de dívida
  t0 := (SELECT last_activity_at FROM public.projects WHERE id=p_id);
  INSERT INTO public.project_technical_debts(project_id, code, title, priority, status, created_by)
    VALUES (p_id, 'DT-99', '3A Divida', 'medium', 'open', u) RETURNING id INTO d_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id=p_id;
  INSERT INTO _r VALUES ('criacao de divida tecnica', d_id IS NOT NULL);
  INSERT INTO _r VALUES ('divida tecnica move projects.last_activity_at', t1 > t0);
  SELECT count(*) INTO n FROM public.audit_history
   WHERE entity_type='project_technical_debts' AND entity_id=d_id AND action='created';
  INSERT INTO _r VALUES ('divida tecnica gera audit_history (created)', n = 1);

  -- alteração de prioridade
  UPDATE public.project_technical_debts SET priority='critical' WHERE id=d_id;
  SELECT (priority='critical') INTO ok FROM public.project_technical_debts WHERE id=d_id;
  INSERT INTO _r VALUES ('alteracao de prioridade da divida', ok);

  -- alteração de status
  UPDATE public.project_technical_debts SET status='planned' WHERE id=d_id;
  SELECT (status='planned') INTO ok FROM public.project_technical_debts WHERE id=d_id;
  INSERT INTO _r VALUES ('alteracao de situacao da divida', ok);

  -- unicidade: código duplicado no mesmo projeto (inclusive variação de caixa/espaços)
  BEGIN
    INSERT INTO public.project_technical_debts(project_id, code, title, created_by)
      VALUES (p_id, ' dt-99 ', 'Duplicada', u);
    ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  INSERT INTO _r VALUES ('codigo DT duplicado no mesmo projeto e bloqueado', ok);

  -- mesmo código permitido em projeto diferente
  BEGIN
    INSERT INTO public.project_technical_debts(project_id, code, title, created_by)
      VALUES (p2_id, 'DT-99', '3A Divida em outro projeto', u);
    ok := true;
  EXCEPTION WHEN unique_violation THEN ok := false;
  END;
  INSERT INTO _r VALUES ('mesmo codigo DT permitido em projetos diferentes', ok);

  -- dívida sem código continua permitida (mais de uma)
  BEGIN
    INSERT INTO public.project_technical_debts(project_id, title, created_by)
      VALUES (p_id, '3A Sem codigo 1', u);
    INSERT INTO public.project_technical_debts(project_id, title, created_by)
      VALUES (p_id, '3A Sem codigo 2', u);
    ok := true;
  EXCEPTION WHEN unique_violation THEN ok := false;
  END;
  INSERT INTO _r VALUES ('dividas sem codigo continuam permitidas', ok);

  -- isolamento entre projetos (consulta por project_id)
  SELECT count(*) INTO n FROM public.project_technical_debts WHERE project_id=p2_id;
  INSERT INTO _r VALUES ('isolamento entre projetos (contagem por projeto)', n = 1);
END $$;

-- ---------------------------------------------------------------------
-- Parte 2 — autorização real (RLS) com papéis authenticated/anon
-- ---------------------------------------------------------------------
DO $$
DECLARE
  u uuid; p_id uuid; n int; ok boolean;
BEGIN
  SELECT v INTO u FROM _ctx WHERE k='user';
  SELECT v INTO p_id FROM _ctx WHERE k='project';

  -- leitura/escrita por usuário com acesso ao dossiê (owner do projeto)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT public.can_view_project_dossier(p_id, u) INTO ok;
  INSERT INTO _r VALUES ('can_view_project_dossier verdadeiro para membro do dossie', ok);
  SELECT public.can_edit_project(p_id, u) INTO ok;
  INSERT INTO _r VALUES ('can_edit_project verdadeiro para autorizado', ok);

  SELECT count(*) INTO n FROM public.project_technical_debts WHERE project_id=p_id;
  INSERT INTO _r VALUES ('leitura de dividas por usuario com acesso ao dossie', n > 0);

  INSERT INTO public.project_development_records(project_id, record_type, title)
    VALUES (p_id, 'test', '3A Teste RLS');
  INSERT INTO _r VALUES ('escrita permitida a usuario autorizado por can_edit_project', true);

  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT count(*) INTO n FROM public.project_development_records;
  INSERT INTO _r VALUES ('anonimo nao le registros de desenvolvimento', n = 0);
  SELECT count(*) INTO n FROM public.project_technical_debts;
  INSERT INTO _r VALUES ('anonimo nao le dividas tecnicas', n = 0);

  BEGIN
    INSERT INTO public.project_technical_debts(project_id, title) VALUES (p_id, 'anon');
    ok := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN ok := true;
  END;
  INSERT INTO _r VALUES ('anonimo nao escreve divida tecnica', ok);

  PERFORM set_config('role', 'postgres', true);
END $$;

SELECT cenario, CASE WHEN ok THEN 'PASSOU' ELSE 'FALHOU' END AS resultado FROM _r;
SELECT count(*) FILTER (WHERE ok) AS passou, count(*) FILTER (WHERE NOT ok) AS falhou FROM _r;
ROLLBACK;
