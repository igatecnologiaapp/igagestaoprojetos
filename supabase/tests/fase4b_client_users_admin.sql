-- =====================================================================
-- FASE 4b — Gestão de Clientes pelo caminho administrativo (service_role)
--
-- Simula a homologação (sem privilégios automáticos): retira TODOS os privilégios do
-- service_role nas tabelas que a troca de perfil toca (client_users, user_roles,
-- project_shares, task_shares), comprova que a conversão falha SEM deixar o usuário sem
-- papel, reaplica a migration 20261108120000 a partir do próprio arquivo e testa criação,
-- conversão, troca de empresa, volta a perfil interno e falhas atômicas.
-- Roda em transação e faz ROLLBACK ao final. Rode com psql a partir deste diretório (usa \ir).
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, esperado text, obtido text, ok boolean) ON COMMIT DROP;
CREATE TEMP TABLE _ids(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON _r, _ids TO service_role, authenticated, anon;

-- Homologação: nenhum privilégio automático do service_role nas tabelas da troca de perfil.
REVOKE ALL ON public.client_users, public.user_roles, public.project_shares, public.task_shares FROM service_role;

DO $$
DECLARE
  u_owner uuid := gen_random_uuid();
  u_colab uuid := gen_random_uuid();   -- colaborador que será convertido em Cliente
  u_share uuid := gen_random_uuid();   -- colaborador que participa de projeto (não pode virar Cliente)
  u_view  uuid := gen_random_uuid();   -- visualizador (tentativa sem empresa)
  u_new   uuid := gen_random_uuid();   -- usuário novo criado como Cliente
  c1 uuid; c2 uuid; p1 uuid; t text; n int;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'f4b+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb, x.meta
  FROM (VALUES (u_owner, '{}'::jsonb), (u_colab, '{}'::jsonb), (u_share, '{}'::jsonb), (u_view, '{}'::jsonb),
               (u_new, '{"account_type":"client","full_name":"Cliente Novo"}'::jsonb)) AS x(id, meta);
  DELETE FROM public.user_roles WHERE user_id IN (u_owner, u_colab, u_share, u_view);
  INSERT INTO public.user_roles(user_id, role)
    VALUES (u_owner,'owner'), (u_colab,'collaborator'), (u_share,'collaborator'), (u_view,'viewer');
  INSERT INTO public.companies(name, created_by) VALUES ('F4b Empresa 1', u_owner) RETURNING id INTO c1;
  INSERT INTO public.companies(name, created_by) VALUES ('F4b Empresa 2', u_owner) RETURNING id INTO c2;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('F4b Projeto', c1, u_owner, u_owner, 'in_progress') RETURNING id INTO p1;
  INSERT INTO public.project_shares(project_id, user_id, permission, created_by) VALUES (p1, u_share, 'view', u_owner);
  INSERT INTO _ids VALUES ('owner',u_owner),('colab',u_colab),('share',u_share),('view',u_view),('new',u_new),('c1',c1),('c2',c2);

  SELECT count(*)::text INTO t
    FROM unnest(ARRAY['public.client_users','public.user_roles','public.project_shares','public.task_shares']) tb,
         unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
   WHERE has_table_privilege('service_role', tb, p);
  INSERT INTO _r VALUES ('simulação: service_role sem privilégio nas 4 tabelas', '0', t, t = '0');

  -- Antes da Fase 4b: a conversão falha, e o colaborador CONTINUA colaborador.
  EXECUTE 'set local role service_role';
  BEGIN
    PERFORM public.admin_apply_user_access(u_colab, 'client', c1, u_owner);
    INSERT INTO _r VALUES ('sem a 4b: conversão falha por privilégio', 'negado', 'permitido', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('sem a 4b: conversão falha por privilégio', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';
  SELECT string_agg(role::text, ',') INTO t FROM public.user_roles WHERE user_id = u_colab;
  INSERT INTO _r VALUES ('falha na conversão não remove o papel anterior', 'collaborator', coalesce(t,'(nenhum)'), t = 'collaborator');
  SELECT count(*) INTO n FROM public.client_users WHERE user_id = u_colab;
  INSERT INTO _r VALUES ('falha na conversão não deixa vínculo de Cliente', '0', n::text, n = 0);
END $$;

-- Aplica a migration complementar exatamente como está no repositório.
\ir ../migrations/20261108120000_fase4b_client_users_service_role.sql

DO $$
DECLARE
  u_owner uuid := (SELECT v FROM _ids WHERE k='owner');
  u_colab uuid := (SELECT v FROM _ids WHERE k='colab');
  u_share uuid := (SELECT v FROM _ids WHERE k='share');
  u_view  uuid := (SELECT v FROM _ids WHERE k='view');
  u_new   uuid := (SELECT v FROM _ids WHERE k='new');
  c1 uuid := (SELECT v FROM _ids WHERE k='c1');
  c2 uuid := (SELECT v FROM _ids WHERE k='c2');
  t text; n int;
BEGIN
  -- Privilégios: exatamente os necessários em cada tabela, e nada para anon.
  SELECT string_agg(tb || ':' || ps, ' ' ORDER BY tb) INTO t FROM (
    SELECT tb, string_agg(p, ',' ORDER BY p) AS ps
      FROM unnest(ARRAY['client_users','user_roles','project_shares','task_shares']) tb,
           unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     WHERE has_table_privilege('service_role', 'public.' || tb, p)
     GROUP BY tb) x;
  INSERT INTO _r VALUES ('service_role recebe só o necessário em cada tabela',
    'client_users:DELETE,INSERT,SELECT,UPDATE project_shares:SELECT task_shares:SELECT user_roles:DELETE,INSERT,SELECT', t,
    t = 'client_users:DELETE,INSERT,SELECT,UPDATE project_shares:SELECT task_shares:SELECT user_roles:DELETE,INSERT,SELECT');
  SELECT count(*) INTO n FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p WHERE has_table_privilege('anon', 'public.client_users', p);
  INSERT INTO _r VALUES ('anon continua sem acesso a client_users', '0', n::text, n = 0);

  EXECUTE 'set local role service_role';

  -- Criação: usuário novo criado como Cliente (Auth já criou sem papel; o admin vincula a empresa).
  PERFORM public.admin_apply_user_access(u_new, 'client', c1, u_owner);
  SELECT (SELECT count(*) FROM public.user_roles WHERE user_id = u_new) || '/' ||
         (SELECT count(*) FROM public.client_users WHERE user_id = u_new AND company_id = c1) INTO t;
  INSERT INTO _r VALUES ('criação de Cliente: sem papel interno e vinculado à empresa', '0/1', t, t = '0/1');

  -- Conversão de colaborador em Cliente.
  PERFORM public.admin_apply_user_access(u_colab, 'client', c1, u_owner);
  SELECT (SELECT count(*) FROM public.user_roles WHERE user_id = u_colab) || '/' ||
         (SELECT count(*) FROM public.client_users WHERE user_id = u_colab AND company_id = c1) INTO t;
  INSERT INTO _r VALUES ('conversão em Cliente: papel removido e vínculo criado', '0/1', t, t = '0/1');

  -- Troca de empresa (caminho ON CONFLICT DO UPDATE).
  PERFORM public.admin_apply_user_access(u_colab, 'client', c2, u_owner);
  SELECT count(*) INTO n FROM public.client_users WHERE user_id = u_colab AND company_id = c2;
  INSERT INTO _r VALUES ('troca de empresa do Cliente', '1', n::text, n = 1);

  -- Falha: participante de projeto interno não pode virar Cliente; papel preservado.
  BEGIN
    PERFORM public.admin_apply_user_access(u_share, 'client', c1, u_owner);
    INSERT INTO _r VALUES ('participante interno não vira Cliente', 'negado', 'permitido', false);
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO _r VALUES ('participante interno não vira Cliente', 'negado', 'negado', true);
  END;
  SELECT coalesce(string_agg(role::text, ','), '(nenhum)') || '/' ||
         (SELECT count(*) FROM public.client_users WHERE user_id = u_share) INTO t
    FROM public.user_roles WHERE user_id = u_share;
  INSERT INTO _r VALUES ('após a recusa: mantém collaborator e sem vínculo', 'collaborator/0', t, t = 'collaborator/0');

  -- Falha: Cliente sem empresa; papel preservado.
  BEGIN
    PERFORM public.admin_apply_user_access(u_view, 'client', NULL, u_owner);
    INSERT INTO _r VALUES ('Cliente exige empresa', 'negado', 'permitido', false);
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO _r VALUES ('Cliente exige empresa', 'negado', 'negado', true);
  END;
  SELECT coalesce(string_agg(role::text, ','), '(nenhum)') INTO t FROM public.user_roles WHERE user_id = u_view;
  INSERT INTO _r VALUES ('após a recusa: mantém viewer', 'viewer', t, t = 'viewer');

  -- Falha: empresa inexistente (erro de chave estrangeira no meio da troca); papel preservado.
  BEGIN
    PERFORM public.admin_apply_user_access(u_view, 'client', gen_random_uuid(), u_owner);
    INSERT INTO _r VALUES ('empresa inexistente recusada', 'negado', 'permitido', false);
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO _r VALUES ('empresa inexistente recusada', 'negado', 'negado', true);
  END;
  SELECT coalesce(string_agg(role::text, ','), '(nenhum)') INTO t FROM public.user_roles WHERE user_id = u_view;
  INSERT INTO _r VALUES ('falha no meio da troca não remove o papel', 'viewer', t, t = 'viewer');

  -- Volta a perfil interno.
  PERFORM public.admin_apply_user_access(u_colab, 'viewer', NULL, u_owner);
  SELECT coalesce(string_agg(role::text, ','), '(nenhum)') || '/' ||
         (SELECT count(*) FROM public.client_users WHERE user_id = u_colab) INTO t
    FROM public.user_roles WHERE user_id = u_colab;
  INSERT INTO _r VALUES ('Cliente volta a perfil interno', 'viewer/0', t, t = 'viewer/0');

  -- Perfil inválido.
  BEGIN
    PERFORM public.admin_apply_user_access(u_view, 'superadmin', NULL, u_owner);
    INSERT INTO _r VALUES ('perfil inválido recusado', 'negado', 'permitido', false);
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO _r VALUES ('perfil inválido recusado', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';

  -- Somente service_role executa a função.
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.admin_apply_user_access(u_view, 'owner', NULL, u_owner);
    INSERT INTO _r VALUES ('usuário logado (mesmo Administrador) não chama a função', 'negado', 'permitido', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('usuário logado (mesmo Administrador) não chama a função', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';
  EXECUTE 'set local role anon';
  BEGIN
    PERFORM public.admin_apply_user_access(u_view, 'owner', NULL, NULL);
    INSERT INTO _r VALUES ('anônimo não chama a função', 'negado', 'permitido', false);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('anônimo não chama a função', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';

  -- 2 vínculos criados, 1 troca de empresa, 1 remoção (volta a perfil interno).
  SELECT string_agg(action || ':' || c, ',' ORDER BY action) INTO t FROM (
    SELECT action, count(*) AS c FROM public.audit_history WHERE entity_type = 'client_users' GROUP BY action) x;
  INSERT INTO _r VALUES ('vínculo, troca e remoção registrados na auditoria', 'created:2,deleted:1,updated:1', t,
                         t = 'created:2,deleted:1,updated:1');
END $$;

SELECT cenario, esperado, obtido, CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado FROM _r;
ROLLBACK;
