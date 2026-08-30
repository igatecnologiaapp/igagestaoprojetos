-- =====================================================================
-- BLOCO 3A / 3A.1 — Suíte de integridade e autorização da Governança
-- Estruturas cobertas: public.project_development_records
--                      public.project_technical_debts
-- Reproduzível: roda dentro de transação e faz ROLLBACK ao final.
-- Não cria usuários de Auth: usa um usuário existente (owner) como autor.
-- Autorização real (RLS) é exercitada com SET LOCAL ROLE authenticated +
-- request.jwt.claims (mesmo mecanismo usado pelo PostgREST) e com o papel anon.
-- =====================================================================
BEGIN;
CREATE TEMP TABLE _r(cenario text, ok boolean) ON COMMIT DROP;

DO $$
DECLARE
  u uuid; c_id uuid; p_id uuid; p2_id uuid; d_id uuid; g_id uuid;
  t0 timestamptz; t1 timestamptz; n int; dup boolean;
BEGIN
  SELECT user_id INTO u FROM public.user_roles WHERE role = 'owner' LIMIT 1;

  INSERT INTO public.companies(name, created_by) VALUES ('3A Empresa', u) RETURNING id INTO c_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('3A Projeto', c_id, u, u, 'planning') RETURNING id INTO p_id;
  INSERT INTO public.projects(name, company_id, created_by, owner_id, status)
    VALUES ('3A Projeto B', c_id, u, u, 'planning') RETURNING id INTO p2_id;

  -- 1) criação de registro de desenvolvimento + last_activity_at
  SELECT last_activity_at INTO t0 FROM public.projects WHERE id = p_id;
  INSERT INTO public.project_development_records(project_id, record_type, title, event_date, created_by)
    VALUES (p_id, 'decision', '3A Decisão', current_date, u) RETURNING id INTO g_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  INSERT INTO _r VALUES ('criacao de registro de desenvolvimento', g_id IS NOT NULL);
  INSERT INTO _r VALUES ('registro de desenvolvimento move last_activity_at', t1 > t0);

  SELECT count(*) INTO n FROM public.audit_history
   WHERE entity_type='project_development_records' AND entity_id=g_id AND action='INSERT';
  INSERT INTO _r VALUES ('registro de desenvolvimento gera audit_history (INSERT)', n = 1);

  -- 2) edição
  t0 := t1;
  UPDATE public.project_development_records SET title='3A Decisão (rev.)', result='aprovado' WHERE id=g_id;
  SELECT last_activity_at INTO t1 FROM public.projects WHERE id = p_id;
  SELECT count(*) INTO n FROM public.audit_history
   WHERE entity_type='project_development_records' AND entity_id=g_id AND action='UPDATE';
  INSERT REPLACE_ME;
EXCEPTION WHEN OTHERS THEN RAISE; END $$;
ROLLBACK;
