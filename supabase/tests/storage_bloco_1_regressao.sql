-- =====================================================================
-- BLOCO 1 / FASE 0 — Regressão do Storage privado (bucket task-files)
-- Não altera o desenho do storage; apenas comprova o isolamento.
-- Roda em transação e faz ROLLBACK ao final.
-- Pré-requisito: mesmos usuários de teste da suíte de menor privilégio
-- (criados pela Auth Admin API — ver rls_bloco_1_menor_privilegio.sql).
-- Substituir os UUIDs abaixo pelos usuários de teste reais.
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _s(cenario text, esperado int, obtido int, ok boolean) ON COMMIT DROP;
GRANT ALL ON _s TO authenticated, anon;

DO $$
DECLARE
  u_owner uuid := '00000000-0000-0000-0000-000000000001';      -- substituir
  u_task_view uuid := '00000000-0000-0000-0000-000000000002';  -- substituir
  u_nada uuid := '00000000-0000-0000-0000-000000000003';       -- substituir
  c_id uuid; p_id uuid; t_id uuid; n int; pub boolean;
BEGIN
  SELECT public INTO pub FROM storage.buckets WHERE id='task-files';
  INSERT INTO _s VALUES ('bucket task-files privado',0,(CASE WHEN pub THEN 1 ELSE 0 END), pub IS FALSE);

  DELETE FROM public.user_roles WHERE user_id IN (u_owner,u_task_view,u_nada);
  INSERT INTO public.user_roles(user_id, role) VALUES (u_owner,'owner'),(u_task_view,'collaborator'),(u_nada,'collaborator');
  INSERT INTO public.companies(name, created_by) VALUES ('B1 Storage Empresa', u_owner) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('B1 Storage Projeto', c_id, u_owner, u_owner,'planning') RETURNING id INTO p_id;
  INSERT INTO public.tasks(project_id,name,created_by,priority,status,position)
    VALUES (p_id,'B1 Storage Tarefa',u_owner,'medium','pending',0) RETURNING id INTO t_id;
  INSERT INTO public.task_shares(task_id,user_id,permission,created_by) VALUES (t_id,u_task_view,'view',u_owner);
  INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('task-files', t_id::text || '/arquivo.pdf', u_owner);

  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_task_view,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='task-files' AND name = t_id::text || '/arquivo.pdf';
  INSERT INTO _s VALUES ('usuario com task_share ve o arquivo',1,n,n=1);
  EXECUTE 'reset role';

  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_nada,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='task-files' AND name = t_id::text || '/arquivo.pdf';
  INSERT INTO _s VALUES ('usuario sem vinculo NAO ve o arquivo',0,n,n=0);
  EXECUTE 'reset role';

  DELETE FROM public.task_shares WHERE task_id = t_id AND user_id = u_task_view;
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_task_view,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='task-files' AND name = t_id::text || '/arquivo.pdf';
  INSERT INTO _s VALUES ('acesso revogado deixa de ver o arquivo',0,n,n=0);
  EXECUTE 'reset role';

  EXECUTE 'set local role anon';
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='task-files';
  INSERT INTO _s VALUES ('anonimo NAO ve arquivos',0,n,n=0);
  EXECUTE 'reset role';
END $$;

SELECT cenario, esperado, obtido, CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado FROM _s;
ROLLBACK;
