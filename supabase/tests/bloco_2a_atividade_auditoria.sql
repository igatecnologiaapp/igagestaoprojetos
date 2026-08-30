-- =====================================================================
-- BLOCO 2A — Suíte de integridade histórica (last_activity_at + auditoria)
-- Reproduzível: roda dentro de transação e faz ROLLBACK ao final.
-- Não cria usuários de Auth: usa um usuário existente (owner) como autor.
-- Nota: os gatilhos usam clock_timestamp(), logo os eventos são distinguíveis
-- dentro da mesma transação de teste.
-- Objetivo: comprovar que eventos autorizados movem projects.last_activity_at
-- e que os eventos passam a produzir entrada em public.audit_history.
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, ok boolean) ON COMMIT DROP;

DO $$
DECLARE
  u uuid; c_id uuid; p_id uuid; t_id uuid; a_id uuid;
  t0 timestamptz; t1 timestamptz; n int;
BEGIN
  SELECT user_id INTO u FROM public.user_roles WHERE role = 'owner' LIMIT 1;

  INSERT INTO public.companies(name, created_by) VALUES ('2A Empresa', u) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('2A Projeto', c_id, u, u, 'planning') RETURNING id INTO p_id;

  -- criação de tarefa
  SELECT last_activity_at INTO t0 FROM public.projects WHERE id = p_id;
  INSERT INTO public.tasks(project_id,name,created_by,priority,status,position)
    VALUES (p_id,'2A Tarefa',u,'medium','pending',0) RETURNING id INTO t_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('criacao de tarefa move last_activity_at', t1 > t0);

  -- leitura simples NÃO move
  t0 := t1;
  PERFORM count(*) FROM public.tasks WHERE project_id = p_id;
  PERFORM count(*) FROM public.projects WHERE id = p_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('SELECT/leitura NAO move last_activity_at', t1 = t0);

  -- alteração de tarefa
  UPDATE public.tasks SET status='in_progress' WHERE id = t_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('alteracao de tarefa move last_activity_at', t1 > t0);

  -- comentário
  t0 := t1;
  INSERT INTO public.task_comments(task_id,user_id,body) VALUES (t_id,u,'comentario 2A');
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('comentario move last_activity_at', t1 > t0);

  -- anexo
  t0 := t1;
  INSERT INTO public.task_attachments(task_id,type,name,url,created_by)
    VALUES (t_id,'link','doc','https://exemplo.test/doc',u);
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('anexo move last_activity_at', t1 > t0);

  -- agendamento vinculado ao projeto
  t0 := t1;
  INSERT INTO public.appointments(title, company_id, project_id, start_at, status, created_by)
    VALUES ('2A Agenda', c_id, p_id, now(), 'scheduled', u) RETURNING id INTO a_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('agendamento move last_activity_at', t1 > t0);

  -- registros do dossiê técnico
  t0 := t1;
  INSERT INTO public.project_prompts(project_id,title,prompt_type,prompt_date,created_by)
    VALUES (p_id,'2A Prompt','feature',current_date,u);
  INSERT INTO public.project_github_repos(project_id,url,created_by) VALUES (p_id,'https://github.com/x/y',u);
  INSERT INTO public.project_lovable(project_id,project_url,created_by) VALUES (p_id,'https://lovable.dev/x',u);
  INSERT INTO public.project_emails(project_id,email,created_by) VALUES (p_id,'a@b.test',u);
  INSERT INTO public.project_links(project_id,name,url,category,created_by) VALUES (p_id,'Doc','https://x.test','docs',u);
  INSERT INTO public.project_credits(project_id,entry_date,amount,created_by) VALUES (p_id,current_date,10,u);
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('registros tecnicos movem last_activity_at', t1 > t0);

  -- alteração dos dados principais do projeto
  t0 := t1;
  UPDATE public.projects SET phase='execucao' WHERE id = p_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('alteracao do projeto move last_activity_at', t1 > t0);

  -- auditoria: comentário, anexo, agendamento
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type='task_comment';
  INSERT INTO _r VALUES ('auditoria de comentario registrada', n > 0);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type='task_attachment';
  INSERT INTO _r VALUES ('auditoria de anexo registrada', n > 0);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type='appointment';
  INSERT INTO _r VALUES ('auditoria de agendamento registrada', n > 0);

  -- auditoria de compartilhamentos (concessão e revogação)
  INSERT INTO public.project_shares(project_id,user_id,permission,created_by) VALUES (p_id,u,'view',u);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type='project_share' AND action='created';
  INSERT INTO _r VALUES ('concessao de project_share auditada', n > 0);
  DELETE FROM public.project_shares WHERE project_id=p_id AND user_id=u;
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type='project_share' AND action='deleted';
  INSERT INTO _r VALUES ('revogacao de project_share auditada', n > 0);

  INSERT INTO public.task_shares(task_id,user_id,permission,created_by) VALUES (t_id,u,'view',u);
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type='task_share' AND action='created';
  INSERT INTO _r VALUES ('concessao de task_share auditada', n > 0);
  DELETE FROM public.task_shares WHERE task_id=t_id AND user_id=u;
  SELECT count(*) INTO n FROM public.audit_history WHERE entity_type='task_share' AND action='deleted';
  INSERT INTO _r VALUES ('revogacao de task_share auditada', n > 0);

  -- auditoria não pode conter conteúdo secreto
  SELECT count(*) INTO n FROM public.audit_history
   WHERE changes::text ~* '"(password|senha|secret|token|api_key|apikey|private_key|secret_value)"';
  INSERT INTO _r VALUES ('auditoria sem campos secretos', n = 0);

  -- ruído: update automático de last_activity_at não gera audit de projeto
  SELECT count(*) INTO n FROM public.audit_history
   WHERE entity_type='project' AND entity_id=p_id AND action='updated'
     AND changes ? 'last_activity_at';
  INSERT INTO _r VALUES ('auditoria de projeto sem ruido de last_activity_at', n = 0);
END $$;

SELECT cenario, CASE WHEN ok THEN 'APROVADO' ELSE 'FALHOU' END AS resultado FROM _r;
ROLLBACK;
