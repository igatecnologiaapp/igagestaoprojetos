-- =====================================================================
-- FASE 0.2 — Suíte de testes negativos e de isolamento (RLS)
-- Reproduzível: executa dentro de uma transação e faz ROLLBACK ao final.
-- Nenhum dado é persistido.
-- Uso: executar este arquivo com privilégio de serviço no banco.
-- =====================================================================
BEGIN;

CREATE TEMP TABLE _res(
  perfil text, recurso text, operacao text, deve_permitir text, esperado int, obtido int, ok boolean
) ON COMMIT DROP;

DO $$
DECLARE
  u_owner uuid := gen_random_uuid();
  u_share_view uuid := gen_random_uuid();
  u_share_edit uuid := gen_random_uuid();
  u_colab_sem_vinculo uuid := gen_random_uuid();
  u_viewer uuid := gen_random_uuid();
  c_id uuid; p_id uuid; t_id uuid;
  n int;

BEGIN
  -- ---------- usuários de teste ----------
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'phase02+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb,
         jsonb_build_object('full_name', x.nome)
  FROM (VALUES (u_owner,'T Owner'), (u_share_view,'T Share View'), (u_share_edit,'T Share Edit'),
               (u_colab_sem_vinculo,'T Sem Vinculo'), (u_viewer,'T Viewer')) AS x(id, nome);

  -- papéis determinísticos
  DELETE FROM public.user_roles WHERE user_id IN
    (u_owner,u_share_view,u_share_edit,u_colab_sem_vinculo,u_viewer);
  INSERT INTO public.user_roles(user_id, role) VALUES
    (u_owner,'owner'), (u_share_view,'collaborator'), (u_share_edit,'collaborator'),
    (u_colab_sem_vinculo,'collaborator'), (u_viewer,'viewer');

  -- ---------- massa de teste pertencente ao owner ----------
  INSERT INTO public.companies(name, created_by) VALUES ('T Empresa 0.2', u_owner) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('T Projeto 0.2', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p_id;
  INSERT INTO public.tasks(project_id, name, created_by, priority, status, position)
    VALUES (p_id, 'T Tarefa 0.2', u_owner, 'medium', 'pending', 0) RETURNING id INTO t_id;

  INSERT INTO public.project_credits(project_id, entry_date, amount, created_by)
    VALUES (p_id, current_date, 10, u_owner);
  INSERT INTO public.project_emails(project_id, email, created_by) VALUES (p_id,'a@b.c',u_owner);
  INSERT INTO public.project_github_repos(project_id, url, created_by) VALUES (p_id,'https://g/x',u_owner);
  INSERT INTO public.project_lovable(project_id, created_by) VALUES (p_id,u_owner);
  INSERT INTO public.project_prompts(project_id, title, prompt_type, prompt_date, created_by)
    VALUES (p_id,'T','initial',current_date,u_owner);
  INSERT INTO public.project_links(project_id, name, url, category, created_by)
    VALUES (p_id,'L','https://l','doc',u_owner);

  -- compartilhamentos
  INSERT INTO public.project_shares(project_id, user_id, permission, created_by)
    VALUES (p_id, u_share_view, 'view', u_owner);
  INSERT INTO public.task_shares(task_id, user_id, permission, created_by)
    VALUES (t_id, u_share_edit, 'edit', u_owner);

  -- exceção individual: nega auditoria ao owner de teste? (usa colaborador)
  INSERT INTO public.user_permission_overrides(user_id, permission_key, granted, created_by)
    VALUES (u_colab_sem_vinculo, 'audit.view', true, u_owner);

  -- =================================================================
  -- CENÁRIOS
  -- =================================================================

  -- ---- Usuário autenticado SEM vínculo (colaborador) ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_colab_sem_vinculo,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','projects','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.tasks WHERE id = t_id;
  INSERT INTO _res VALUES ('Sem vínculo','tasks','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.companies WHERE id = c_id;
  INSERT INTO _res VALUES ('Sem vínculo','companies','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_credits WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','project_credits','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_emails WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','project_emails','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_github_repos WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','project_github_repos','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_lovable WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','project_lovable','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_prompts WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','project_prompts','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_links WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','project_links','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_shares WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','project_shares','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.task_shares WHERE task_id = t_id;
  INSERT INTO _res VALUES ('Sem vínculo','task_shares','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.task_status_history WHERE task_id = t_id;
  INSERT INTO _res VALUES ('Sem vínculo','task_status_history','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.profiles WHERE id = u_owner;
  INSERT INTO _res VALUES ('Sem vínculo','profiles (terceiro)','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.profiles WHERE id = u_colab_sem_vinculo;
  INSERT INTO _res VALUES ('Sem vínculo','profiles (próprio)','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = u_owner;
  INSERT INTO _res VALUES ('Sem vínculo','user_roles (terceiro)','SELECT','Não',0,n,n=0);
  -- grant individual audit.view deve funcionar
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo + grant audit.view','audit_history','SELECT','Sim',
                           (SELECT count(*) FROM public.audit_history WHERE entity_id = p_id AND true)::int, n, n > 0);
  -- não pode alterar projeto alheio
  UPDATE public.projects SET name = 'hack' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Sem vínculo','projects','UPDATE','Não',0,n,n=0);
  UPDATE public.tasks SET name = 'hack' WHERE id = t_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Sem vínculo','tasks','UPDATE','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ---- Viewer sem vínculo ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_viewer,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Viewer','projects','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.tasks WHERE id = t_id;
  INSERT INTO _res VALUES ('Viewer','tasks','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_id = p_id;
  INSERT INTO _res VALUES ('Viewer','audit_history','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.external_collaborators;
  INSERT INTO _res VALUES ('Viewer','external_collaborators','SELECT','Não',0,n,n=0);
  BEGIN
    INSERT INTO public.companies(name, created_by) VALUES ('T Viewer', u_viewer);
    INSERT INTO _res VALUES ('Viewer','companies','INSERT','Não',0,1,false);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    INSERT INTO _res VALUES ('Viewer','companies','INSERT','Não',0,0,true);
  END;
  EXECUTE 'reset role';

  -- ---- Compartilhado com permissão de VISUALIZAÇÃO ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_share_view,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Compartilhado (view)','projects','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_credits WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Compartilhado (view)','project_credits','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.companies WHERE id = c_id;
  INSERT INTO _res VALUES ('Compartilhado (view)','companies','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.tasks WHERE id = t_id;
  INSERT INTO _res VALUES ('Compartilhado (view)','tasks','SELECT','Sim',1,n,n=1);
  UPDATE public.projects SET phase = 'x' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Compartilhado (view)','projects','UPDATE','Não',0,n,n=0);
  UPDATE public.project_emails SET notes = 'x' WHERE project_id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Compartilhado (view)','project_emails','UPDATE','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ---- Compartilhado apenas na TAREFA com permissão de EDIÇÃO ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_share_edit,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.tasks WHERE id = t_id;
  INSERT INTO _res VALUES ('Compartilhado tarefa (edit)','tasks','SELECT','Sim',1,n,n=1);
  UPDATE public.tasks SET name = 'T Tarefa 0.2 editada' WHERE id = t_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Compartilhado tarefa (edit)','tasks','UPDATE','Sim',1,n,n=1);
  UPDATE public.projects SET phase = 'x' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Compartilhado tarefa (edit)','projects','UPDATE','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.task_status_history WHERE task_id = t_id;
  INSERT INTO _res VALUES ('Compartilhado tarefa (edit)','task_status_history','SELECT','Sim',1,n,n>=1);
  INSERT INTO public.task_comments(task_id, user_id, body) VALUES (t_id, u_share_edit, 'ok');
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Compartilhado tarefa (edit)','task_comments','INSERT','Sim',1,n,n=1);
  EXECUTE 'reset role';

  -- ---- Owner/Administrador ----
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Owner','projects','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.profiles;
  INSERT INTO _res VALUES ('Owner','profiles','SELECT','Sim',5,n,n>=5);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_id = p_id;
  INSERT INTO _res VALUES ('Owner','audit_history','SELECT','Sim',1,n,n>=1);
  UPDATE public.projects SET phase = 'exec' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Owner','projects','UPDATE','Sim',1,n,n=1);
  EXECUTE 'reset role';

  -- ---- Proteção do último administrador ----
  -- remove os demais owners de teste; tenta remover o último owner real
  BEGIN
    DELETE FROM public.user_roles WHERE role='owner';
    INSERT INTO _res VALUES ('Sistema','último owner','DELETE','Não',0,1,false);
  EXCEPTION WHEN others THEN
    INSERT INTO _res VALUES ('Sistema','último owner','DELETE','Não',0,0,true);
  END;
END $$;

SELECT perfil, recurso, operacao, deve_permitir, esperado, obtido,
       CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado
FROM _res;

SELECT count(*) FILTER (WHERE ok) AS aprovados,
       count(*) FILTER (WHERE NOT ok) AS falhos,
       count(*) AS total
FROM _res;

ROLLBACK;
