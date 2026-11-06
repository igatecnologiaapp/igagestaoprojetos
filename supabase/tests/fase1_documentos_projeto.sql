-- =====================================================================
-- FASE 1 — Documentos da pasta digital (project_files + bucket project-files)
-- Roda em transação e faz ROLLBACK ao final (nenhum dado persiste).
-- Exercita a RLS de verdade: `set local role authenticated/anon` + claims JWT.
--
-- PRÉ-REQUISITO (igual às suítes do Bloco 1): se o canal SQL não tiver
-- permissão no schema `auth`, criar 6 usuários de teste pela Auth Admin API,
-- substituir os gen_random_uuid() pelos UUIDs reais e remover o INSERT em auth.users.
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, esperado text, obtido text, ok boolean) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated, anon;

DO $$
DECLARE
  u_owner  uuid := gen_random_uuid();  -- Administrador
  u_editor uuid := gen_random_uuid();  -- Colaborador com project_share 'edit'
  u_viewer uuid := gen_random_uuid();  -- Visualizador com project_share 'view'
  u_task   uuid := gen_random_uuid();  -- Colaborador só com task_share (não vê dossiê)
  u_nada   uuid := gen_random_uuid();  -- Colaborador sem vínculo
  c_id uuid; p_id uuid; p2_id uuid; t_id uuid; f_id uuid;
  n int; ok boolean; act_before timestamptz; act_after timestamptz;
  path1 text; path2 text;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'fase1docs+' || x.id || '@test.local', 'x', now(), now(), now(), '{}'::jsonb,
         jsonb_build_object('full_name', x.nome)
  FROM (VALUES (u_owner,'F1 Owner'),(u_editor,'F1 Editor'),(u_viewer,'F1 Viewer'),
               (u_task,'F1 Task'),(u_nada,'F1 Nada')) AS x(id, nome);

  DELETE FROM public.user_roles WHERE user_id IN (u_owner,u_editor,u_viewer,u_task,u_nada);
  INSERT INTO public.user_roles(user_id, role) VALUES
    (u_owner,'owner'),(u_editor,'collaborator'),(u_viewer,'viewer'),(u_task,'collaborator'),(u_nada,'collaborator');

  INSERT INTO public.companies(name, created_by) VALUES ('F1 Docs Empresa', u_owner) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('F1 Docs Projeto', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('F1 Docs Outro Projeto', c_id, u_owner, u_owner, 'planning') RETURNING id INTO p2_id;
  INSERT INTO public.project_shares(project_id, user_id, permission, created_by) VALUES
    (p_id, u_editor, 'edit', u_owner), (p_id, u_viewer, 'view', u_owner);
  INSERT INTO public.tasks(project_id, name, created_by, priority, status, position)
    VALUES (p_id, 'F1 Docs Tarefa', u_owner, 'medium', 'pending', 0) RETURNING id INTO t_id;
  INSERT INTO public.task_shares(task_id, user_id, permission, created_by) VALUES (t_id, u_task, 'view', u_owner);

  path1 := p_id::text || '/' || gen_random_uuid()::text || '-contrato.pdf';
  path2 := p_id::text || '/' || gen_random_uuid()::text || '-briefing.docx';

  SELECT public INTO ok FROM storage.buckets WHERE id = 'project-files';
  INSERT INTO _r VALUES ('bucket project-files é privado', 'false', ok::text, ok IS FALSE);

  UPDATE public.projects SET last_activity_at = now() - interval '10 days' WHERE id = p_id;
  SELECT last_activity_at INTO act_before FROM public.projects WHERE id = p_id;

  -- Administrador envia arquivo (storage + metadados)
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_owner,'role','authenticated')::text, true);
  INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('project-files', path1, u_owner);
  INSERT INTO public.project_files(project_id, folder, file_name, storage_path, size_bytes, mime_type, created_by)
    VALUES (p_id, 'Contratos', 'contrato.pdf', path1, 1024, 'application/pdf', u_owner) RETURNING id INTO f_id;
  INSERT INTO _r VALUES ('Administrador envia arquivo', 'ok', 'ok', true);
  EXECUTE 'reset role';

  SELECT last_activity_at INTO act_after FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('envio atualiza última movimentação do projeto', 'maior', CASE WHEN act_after > act_before THEN 'maior' ELSE 'igual' END, act_after > act_before);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type = 'project_files' AND entity_id = f_id AND action = 'created';
  INSERT INTO _r VALUES ('envio registrado na auditoria', '1', n::text, n = 1);

  -- Editor do projeto envia arquivo
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_editor,'role','authenticated')::text, true);
  BEGIN
    INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('project-files', path2, u_editor);
    INSERT INTO public.project_files(project_id, folder, file_name, storage_path, created_by)
      VALUES (p_id, 'Briefing', 'briefing.docx', path2, u_editor);
    INSERT INTO _r VALUES ('editor do projeto envia arquivo', 'ok', 'ok', true);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('editor do projeto envia arquivo', 'ok', SQLERRM, false);
  END;
  -- created_by falso é recusado
  BEGIN
    INSERT INTO public.project_files(project_id, folder, file_name, storage_path, created_by)
      VALUES (p_id, 'Geral', 'x.txt', p_id::text || '/falso.txt', u_owner);
    INSERT INTO _r VALUES ('editor NÃO registra arquivo em nome de outro', 'negado', 'permitido', false);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('editor NÃO registra arquivo em nome de outro', 'negado', 'negado', true);
  END;
  -- caminho de outro projeto é recusado
  BEGIN
    INSERT INTO public.project_files(project_id, folder, file_name, storage_path, created_by)
      VALUES (p_id, 'Geral', 'y.txt', p2_id::text || '/y.txt', u_editor);
    INSERT INTO _r VALUES ('caminho apontando para outro projeto é recusado', 'negado', 'permitido', false);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('caminho apontando para outro projeto é recusado', 'negado', 'negado', true);
  END;
  -- editor não envia para projeto em que não é editor
  BEGIN
    INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('project-files', p2_id::text || '/z.pdf', u_editor);
    INSERT INTO _r VALUES ('editor NÃO envia para outro projeto (storage)', 'negado', 'permitido', false);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('editor NÃO envia para outro projeto (storage)', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';

  -- Visualizador: vê e baixa, não envia nem apaga
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_viewer,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.project_files WHERE project_id = p_id;
  INSERT INTO _r VALUES ('visualizador vê os metadados', '2', n::text, n = 2);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-files' AND name IN (path1, path2);
  INSERT INTO _r VALUES ('visualizador vê os arquivos no storage', '2', n::text, n = 2);
  BEGIN
    INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('project-files', p_id::text || '/v.pdf', u_viewer);
    INSERT INTO _r VALUES ('visualizador NÃO envia arquivo', 'negado', 'permitido', false);
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('visualizador NÃO envia arquivo', 'negado', 'negado', true);
  END;
  DELETE FROM public.project_files WHERE id = f_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _r VALUES ('visualizador NÃO apaga metadados', '0', n::text, n = 0);
  DELETE FROM storage.objects WHERE bucket_id = 'project-files' AND name = path1;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _r VALUES ('visualizador NÃO apaga arquivo no storage', '0', n::text, n = 0);
  EXECUTE 'reset role';

  -- Acesso só por tarefa e usuário sem vínculo: não veem documentos
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_task,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.project_files WHERE project_id = p_id;
  INSERT INTO _r VALUES ('acesso só por tarefa NÃO vê documentos do projeto', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-files';
  INSERT INTO _r VALUES ('acesso só por tarefa NÃO vê arquivos no storage', '0', n::text, n = 0);
  EXECUTE 'reset role';

  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_nada,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.project_files;
  INSERT INTO _r VALUES ('usuário sem vínculo NÃO vê documentos', '0', n::text, n = 0);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-files';
  INSERT INTO _r VALUES ('usuário sem vínculo NÃO vê arquivos', '0', n::text, n = 0);
  EXECUTE 'reset role';

  EXECUTE 'set local role anon';
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    SELECT count(*) INTO n FROM public.project_files;
    INSERT INTO _r VALUES ('anônimo NÃO lê documentos', 'negado', n::text, n = 0);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('anônimo NÃO lê documentos', 'negado', 'negado', true);
  END;
  BEGIN
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-files';
    INSERT INTO _r VALUES ('anônimo NÃO vê arquivos', 'negado', n::text, n = 0);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('anônimo NÃO vê arquivos', 'negado', 'negado', true);
  END;
  EXECUTE 'reset role';

  -- Revogar o compartilhamento retira o acesso
  DELETE FROM public.project_shares WHERE project_id = p_id AND user_id = u_viewer;
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_viewer,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.project_files WHERE project_id = p_id;
  INSERT INTO _r VALUES ('compartilhamento revogado deixa de ver documentos', '0', n::text, n = 0);
  EXECUTE 'reset role';

  -- Editor apaga arquivo
  EXECUTE 'set local role authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_editor,'role','authenticated')::text, true);
  DELETE FROM public.project_files WHERE storage_path = path2;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _r VALUES ('editor apaga metadados', '1', n::text, n = 1);
  DELETE FROM storage.objects WHERE bucket_id = 'project-files' AND name = path2;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _r VALUES ('editor apaga arquivo no storage', '1', n::text, n = 1);
  EXECUTE 'reset role';
END $$;

SELECT cenario, esperado, obtido, CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado FROM _r;
ROLLBACK;
