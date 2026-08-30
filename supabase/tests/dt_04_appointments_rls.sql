-- =====================================================================
-- DT-04 — Recursão RLS em agendamentos (42P17)
-- Executa em transação com ROLLBACK. Nenhum dado é persistido.
-- =====================================================================
BEGIN;

CREATE TEMP TABLE _res(
  perfil text, recurso text, operacao text, deve_permitir text, esperado int, obtido int, ok boolean
) ON COMMIT DROP;
GRANT ALL ON _res TO authenticated, anon;

DO $$
DECLARE
  u_owner uuid := gen_random_uuid();
  u_membro uuid := gen_random_uuid();
  u_part uuid := gen_random_uuid();
  u_sem uuid := gen_random_uuid();
  c_id uuid; p_id uuid; p2_id uuid; a_id uuid; a2_id uuid;
  n int;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'dt04+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  FROM (VALUES (u_owner),(u_membro),(u_part),(u_sem)) AS x(id);

  DELETE FROM public.user_roles WHERE user_id IN (u_owner,u_membro,u_part,u_sem);
  INSERT INTO public.user_roles(user_id, role) VALUES
    (u_owner,'owner'), (u_membro,'collaborator'), (u_part,'collaborator'), (u_sem,'collaborator');

  INSERT INTO public.companies(name, created_by) VALUES ('DT04 Empresa', u_owner) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('DT04 Projeto', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('DT04 Projeto 2', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p2_id;
  INSERT INTO public.project_shares(project_id, user_id, permission, created_by)
    VALUES (p_id, u_membro, 'view', u_owner);

  INSERT INTO public.appointments(title, project_id, start_at, status, created_by)
    VALUES ('DT04 Agendamento', p_id, now(), 'scheduled', u_owner) RETURNING id INTO a_id;
  INSERT INTO public.appointments(title, project_id, start_at, status, created_by)
    VALUES ('DT04 Agendamento 2', p2_id, now(), 'scheduled', u_owner) RETURNING id INTO a2_id;
  INSERT INTO public.appointment_participants(appointment_id, user_id) VALUES (a_id, u_part);

  -- ---- Owner ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.appointments WHERE id = a_id;
  INSERT INTO _res VALUES ('Owner','appointments','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.appointments WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Owner','appointments (por project_id)','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.appointment_participants WHERE appointment_id = a_id;
  INSERT INTO _res VALUES ('Owner','appointment_participants','SELECT','Sim',1,n,n=1);
  EXECUTE 'reset role';

  -- ---- Membro autorizado do projeto ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_membro,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.appointments WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Membro do projeto','appointments (por project_id)','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.appointments WHERE id = a2_id;
  INSERT INTO _res VALUES ('Membro do projeto','appointments (outro projeto)','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.appointment_participants WHERE appointment_id = a_id;
  INSERT INTO _res VALUES ('Membro do projeto','appointment_participants','SELECT','Sim',1,n,n=1);
  EXECUTE 'reset role';

  -- ---- Participante do agendamento ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_part,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.appointments WHERE id = a_id;
  INSERT INTO _res VALUES ('Participante','appointments','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.appointment_participants WHERE appointment_id = a_id;
  INSERT INTO _res VALUES ('Participante','appointment_participants','SELECT','Sim',1,n,n=1);
  -- participante não ganha acesso ao projeto inteiro
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Participante','projects (projeto do agendamento)','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.appointments WHERE id = a2_id;
  INSERT INTO _res VALUES ('Participante','appointments (outro agendamento)','SELECT','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ---- Usuário sem vínculo ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_sem,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.appointments WHERE id = a_id;
  INSERT INTO _res VALUES ('Sem vínculo','appointments','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.appointments WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','appointments (por project_id)','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.appointment_participants WHERE appointment_id = a_id;
  INSERT INTO _res VALUES ('Sem vínculo','appointment_participants','SELECT','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ---- Anônimo ----
  EXECUTE 'set local role anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SELECT count(*) INTO n FROM public.appointments WHERE id = a_id;
  INSERT INTO _res VALUES ('Anon','appointments','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.appointment_participants WHERE appointment_id = a_id;
  INSERT INTO _res VALUES ('Anon','appointment_participants','SELECT','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ---- Regressão de escrita (regras inalteradas) ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  UPDATE public.appointments SET location = 'DT04' WHERE id = a_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Owner','appointments','UPDATE','Sim',1,n,n=1);
  EXECUTE 'reset role';

  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_sem,'role','authenticated')::text, true);
  UPDATE public.appointments SET location = 'hack' WHERE id = a_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Sem vínculo','appointments','UPDATE','Não',0,n,n=0);
  EXECUTE 'reset role';

EXCEPTION WHEN sqlstate '42P17' THEN
  INSERT INTO _res VALUES ('Sistema','recursão 42P17','SELECT','Não',0,1,false);
END $$;

SELECT perfil, recurso, operacao, deve_permitir, esperado, obtido,
       CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado
FROM _res;

SELECT count(*) FILTER (WHERE ok) AS aprovados,
       count(*) FILTER (WHERE NOT ok) AS falhos,
       count(*) AS total
FROM _res;

ROLLBACK;
