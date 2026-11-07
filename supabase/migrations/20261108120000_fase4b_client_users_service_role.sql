-- =============================================================================
-- Fase 4b — Gestão de Clientes pelo caminho administrativo (complementa a Fase 4)
--
-- Contexto: em projetos Supabase sem privilégios padrão para tabelas novas (caso da
-- homologação), a Fase 4 concedeu client_users apenas a `authenticated`. As funções de
-- servidor de usuários usam o `service_role`, que ficava sem acesso e falhava ao criar ou
-- converter um usuário em Cliente.
--
-- 1. Privilégios mínimos do service_role em client_users (nada para anon; nada além disso).
-- 2. admin_apply_user_access: troca de perfil (interno <-> Cliente) numa única transação.
--    Antes eram chamadas separadas (apaga o papel, depois grava o Cliente); se a segunda
--    falhasse, o usuário ficava sem papel nenhum. Agora qualquer falha desfaz tudo.
--    SECURITY INVOKER: roda com os privilégios de quem chama (não eleva acesso) e só o
--    service_role pode executá-la.
-- Idempotente. Não altera a migration da Fase 4 (já aplicada).
-- =============================================================================

-- 1. Privilégios mínimos -------------------------------------------------------
-- SELECT: filtros por user_id (DELETE ... WHERE) e alvo do ON CONFLICT
-- INSERT/UPDATE: vincular ou trocar a empresa do Cliente (INSERT ... ON CONFLICT DO UPDATE)
-- DELETE: deixar de ser Cliente ao receber um perfil interno
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_users TO service_role;

-- 2. Troca de perfil atômica ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_apply_user_access(
  _user_id uuid,
  _role text,
  _company_id uuid DEFAULT NULL,
  _actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não informado.';
  END IF;
  IF _role IS NULL OR _role NOT IN ('owner', 'collaborator', 'viewer', 'client') THEN
    RAISE EXCEPTION 'Perfil inválido: %', coalesce(_role, '(vazio)');
  END IF;

  IF _role = 'client' THEN
    IF _company_id IS NULL THEN
      RAISE EXCEPTION 'Selecione a empresa do Cliente.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_shares WHERE user_id = _user_id)
       OR EXISTS (SELECT 1 FROM public.task_shares WHERE user_id = _user_id) THEN
      RAISE EXCEPTION 'Este usuário participa de projetos ou tarefas internos. Remova-o dessas equipes antes de torná-lo Cliente.';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _user_id;
    INSERT INTO public.client_users (user_id, company_id, created_by)
    VALUES (_user_id, _company_id, _actor)
    ON CONFLICT (user_id) DO UPDATE SET company_id = EXCLUDED.company_id;
  ELSE
    DELETE FROM public.client_users WHERE user_id = _user_id;
    DELETE FROM public.user_roles WHERE user_id = _user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role::public.app_role);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_apply_user_access(uuid, text, uuid, uuid) IS
  'Fase 4b: aplica o perfil (owner/collaborator/viewer/client) numa única transação. Somente service_role.';

REVOKE ALL ON FUNCTION public.admin_apply_user_access(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_user_access(uuid, text, uuid, uuid) TO service_role;
