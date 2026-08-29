-- =====================================================================
-- BLOCO 1 / FASE 0 — Suíte de menor privilégio (task_share x project_share)
-- Reproduzível: roda dentro de transação e faz ROLLBACK ao final.
-- Exercita RLS de verdade: assume `role authenticated`/`anon` + claims JWT (sub),
-- ou seja, as policies são avaliadas sob o papel esperado (não service_role).
--
-- PRÉ-REQUISITO DE EXECUÇÃO
-- O canal SQL disponível não possui privilégio sobre o schema `auth`
-- (erro: permission denied for schema auth). Nesse caso:
--   1) criar 5 usuários de teste pela Auth Admin API (email_confirm=true);
--   2) substituir os gen_random_uuid() abaixo pelos UUIDs reais retornados;
--   3) remover o bloco INSERT INTO auth.users;
--   4) executar este arquivo;
--   5) excluir os usuários de teste pela Auth Admin API.
-- Foi exatamente esse o procedimento usado na evidência do Bloco 1.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE _res(
  perfil text, recurso text, operacao text, deve_permitir text, esperado int, obtido int, ok boolean
) ON COMMIT DROP;
GRANT ALL ON _res TO authenticated, anon;

DO $$
DECLARE
  u_owner uuid := gen_random_uuid();
  u_task_view uuid := gen_random_uuid();
  u_task_edit uuid := gen_random_uuid();
  u_proj_view uuid := gen_random_uuid();
  u_nada uuid := gen_random_uuid();
  c_id uuid; p_id uuid; t_id uuid; t2_id uuid;
  n int;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'bloco1+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb,
         jsonb_build_object('full_name', x.nome)
  FROM (VALUES (u_owner,'B1 Owner'), (u_task_view,'B1 Task View'), (u_task_edit,'B1 Task Edit'),
               (u_proj_view,'B1 Project View'), (u_nada,'B1 Sem Vinculo')) AS x(id, nome);

  DELETE FROM public.user_roles WHERE user_id IN (u_owner,u_task_view,u_task_edit,u_proj_view,u_nada);
  INSERT INTO public.user_roles(user_id, role) VALUES
    (u_owner,'owner'), (u_task_view,'collaborator'), (u_task_edit,'collaborator'),
    (u_proj_view,'collaborator'), (u_nada,'collaborator');

  INSERT INTO public.companies(name, created_by) VALUES ('B1 Empresa', u_owner) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('B1 Projeto', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p_id;
  INSERT INTO public.tasks(project_id, name, created_by, priority, status, position)
    VALUES (p_id, 'B1 Tarefa compartilhada', u_owner, 'medium', 'pending', 0) RETURNING id INTO t_id;
  INSERT INTO public.tasks(project_id, name, created_by, priority, status, position)
    VALUES (p_id, 'B1 Outra tarefa', u_owner, 'medium', 'pending', 1) RETURNING id INTO t2_id;

  INSERT INTO public.project_credits(project_id, entry_date, amount, created_by) VALUES (p_id, current_date, 10, u_owner);
  INSERT INTO public.project_emails(project_id, email, created_by) VALUES (p_id,'a@b.c',u_owner);
  INSERT INTO public.project_github_repos(project_id, url, created_by) VALUES (p_id,'https://g/x',u_owner);
  INSERT INTO public.project_lovable(project_id, created_by) VALUES (p_id,u_owner);
  INSERT INTO public.project_prompts(project_id, title, prompt_type, prompt_date, created_by)
    VALUES (p_id,'B1','initial',current_date,u_owner);
  INSERT INTO public.project_links(project_id, name, url, category, created_by)
    VALUES (p_id,'L','https://l','doc',u_owner);
  INSERT INTO public.project_accounts(project_id, platform, created_by) VALUES (p_id,'plataforma',u_owner);

  INSERT INTO public.task_shares(task_id, user_id, permission, created_by) VALUES (t_id, u_task_view, 'view', u_owner);
  INSERT INTO public.task_shares(task_id, user_id, permission, created_by) VALUES (t_id, u_task_edit, 'edit', u_owner);
  INSERT INTO public.project_shares(project_id, user_id, permission, created_by) VALUES (p_id, u_proj_view, 'view', u_owner);

  -- ============ ANÔNIMO ============
  EXECUTE 'set local role anon';
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Anônimo','projects','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.tasks WHERE id = t_id;
  INSERT INTO _res VALUES ('Anônimo','tasks','SELECT','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ============ SEM VÍNCULO ============
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_nada,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','projects','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.tasks WHERE id = t_id;
  INSERT INTO _res VALUES ('Sem vínculo','tasks','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_credits WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','project_credits','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_id = p_id;
  INSERT INTO _res VALUES ('Sem vínculo','audit_history (projeto)','SELECT','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ============ TASK SHARE (view) — menor privilégio ============
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_task_view,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.tasks WHERE id = t_id;
  INSERT INTO _res VALUES ('Task share (view)','tarefa compartilhada','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.tasks WHERE id = t2_id;
  INSERT INTO _res VALUES ('Task share (view)','outra tarefa','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','projects (contexto mínimo)','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_credits WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','project_credits','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_emails WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','project_emails','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_github_repos WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','project_github_repos','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_lovable WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','project_lovable','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_prompts WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','project_prompts','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_links WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','project_links','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_accounts WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','project_accounts','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_custom_field_values WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','project_custom_field_values','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_id = p_id;
  INSERT INTO _res VALUES ('Task share (view)','audit_history (projeto)','SELECT','Não',0,n,n=0);
  UPDATE public.tasks SET name='hack' WHERE id = t_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Task share (view)','tarefa compartilhada','UPDATE','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ============ TASK SHARE (edit) ============
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_task_edit,'role','authenticated')::text, true);
  UPDATE public.tasks SET name='B1 Tarefa editada' WHERE id = t_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Task share (edit)','tarefa compartilhada','UPDATE','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.task_status_history WHERE task_id = t_id;
  INSERT INTO _res VALUES ('Task share (edit)','task_status_history','SELECT','Sim',1,n,n>=1);
  INSERT INTO public.task_comments(task_id, user_id, body) VALUES (t_id, u_task_edit, 'ok');
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Task share (edit)','task_comments','INSERT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_prompts WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (edit)','project_prompts','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.project_credits WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Task share (edit)','project_credits','SELECT','Não',0,n,n=0);
  UPDATE public.projects SET phase='x' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Task share (edit)','projects','UPDATE','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ============ PROJECT SHARE (view) — preservação ============
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_proj_view,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','projects','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_credits WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','project_credits','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_emails WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','project_emails','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_github_repos WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','project_github_repos','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_lovable WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','project_lovable','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_prompts WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','project_prompts','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_links WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','project_links','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_accounts WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','project_accounts (somente admin)','SELECT','Não',0,n,n=0);
  SELECT count(*) INTO n FROM public.tasks WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Project share (view)','tasks do projeto','SELECT','Sim',2,n,n=2);
  UPDATE public.projects SET phase='x' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Project share (view)','projects','UPDATE','Não',0,n,n=0);
  EXECUTE 'reset role';

  -- ============ OWNER ============
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.projects WHERE id = p_id;
  INSERT INTO _res VALUES ('Owner','projects','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_credits WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Owner','project_credits','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.project_accounts WHERE project_id = p_id;
  INSERT INTO _res VALUES ('Owner','project_accounts','SELECT','Sim',1,n,n=1);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_id = p_id;
  INSERT INTO _res VALUES ('Owner','audit_history (projeto)','SELECT','Sim',1,n,n>=1);
  UPDATE public.projects SET phase='exec' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _res VALUES ('Owner','projects','UPDATE','Sim',1,n,n=1);
  EXECUTE 'reset role';

  -- ============ DENY INDIVIDUAL (has_permission) ============
  INSERT INTO public.user_permission_overrides(user_id, permission_key, granted, created_by)
    VALUES (u_nada, 'audit.view', true, u_owner);
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_nada,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_id = p_id;
  INSERT INTO _res VALUES ('Grant individual audit.view','audit_history','SELECT','Sim',1,n,n>=1);
  EXECUTE 'reset role';
  UPDATE public.user_permission_overrides SET granted = false
    WHERE user_id = u_nada AND permission_key = 'audit.view';
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_nada,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_id = p_id;
  INSERT INTO _res VALUES ('Deny individual audit.view','audit_history','SELECT','Não',0,n,n=0);
  EXECUTE 'reset role';
END $$;

SELECT perfil, recurso, operacao, deve_permitir, esperado, obtido,
       CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado
FROM _res;

SELECT count(*) FILTER (WHERE ok) AS aprovados,
       count(*) FILTER (WHERE NOT ok) AS falhos,
       count(*) AS total
FROM _res;

ROLLBACK;
