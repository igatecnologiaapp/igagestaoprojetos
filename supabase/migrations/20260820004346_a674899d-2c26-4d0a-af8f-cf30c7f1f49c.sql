-- =========================================================
-- IGA NETWORK BR — FASE 1: FUNDAÇÃO, SEGURANÇA E GOVERNANÇA
-- Estrutura isolada com prefixo iga_
-- =========================================================

-- 1. ENUMS -------------------------------------------------
CREATE TYPE public.iga_entity_status AS ENUM ('active','inactive');
CREATE TYPE public.iga_user_status AS ENUM ('active','disabled','pending');
CREATE TYPE public.iga_scope_type AS ENUM ('global','company','unit');
CREATE TYPE public.iga_audit_action AS ENUM ('created','updated','deleted','granted','revoked','login','access_denied','other');
CREATE TYPE public.iga_idem_status AS ENUM ('in_progress','completed','failed');

-- 2. TABELAS BASE ------------------------------------------
CREATE TABLE public.iga_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text,
  cnpj text UNIQUE,
  is_operator boolean NOT NULL DEFAULT false,
  status public.iga_entity_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.iga_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.iga_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  status public.iga_entity_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX iga_units_company_idx ON public.iga_units(company_id);

CREATE TABLE public.iga_profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  status public.iga_user_status NOT NULL DEFAULT 'active',
  disabled_at timestamptz,
  disabled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.iga_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.iga_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  scope_level public.iga_scope_type NOT NULL DEFAULT 'company',
  is_system boolean NOT NULL DEFAULT false,
  is_admin_role boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.iga_role_permissions (
  role_id uuid NOT NULL REFERENCES public.iga_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.iga_permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public.iga_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.iga_profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.iga_companies(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.iga_units(id) ON DELETE SET NULL,
  status public.iga_entity_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, unit_id)
);
CREATE INDEX iga_memberships_user_idx ON public.iga_memberships(user_id);
CREATE INDEX iga_memberships_company_idx ON public.iga_memberships(company_id);

CREATE TABLE public.iga_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.iga_profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.iga_roles(id) ON DELETE RESTRICT,
  scope_type public.iga_scope_type NOT NULL,
  company_id uuid REFERENCES public.iga_companies(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.iga_units(id) ON DELETE CASCADE,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  granted_by uuid,
  grant_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iga_ra_scope_shape CHECK (
    (scope_type = 'global' AND company_id IS NULL AND unit_id IS NULL) OR
    (scope_type = 'company' AND company_id IS NOT NULL AND unit_id IS NULL) OR
    (scope_type = 'unit' AND company_id IS NOT NULL AND unit_id IS NOT NULL)
  )
);
CREATE INDEX iga_ra_user_idx ON public.iga_role_assignments(user_id);
CREATE INDEX iga_ra_company_idx ON public.iga_role_assignments(company_id);
CREATE INDEX iga_ra_active_idx ON public.iga_role_assignments(user_id, revoked_at, valid_from, valid_until);

CREATE TABLE public.iga_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  company_id uuid,
  action public.iga_audit_action NOT NULL,
  object_type text NOT NULL,
  object_id uuid,
  before_state jsonb,
  after_state jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX iga_audit_company_idx ON public.iga_audit_events(company_id, created_at DESC);
CREATE INDEX iga_audit_object_idx ON public.iga_audit_events(object_type, object_id);

CREATE TABLE public.iga_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL,
  version integer NOT NULL,
  company_id uuid REFERENCES public.iga_companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_key, company_id, version)
);

CREATE TABLE public.iga_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.iga_companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);

CREATE TABLE public.iga_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.iga_companies(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  object_id uuid,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX iga_attachments_company_idx ON public.iga_attachments(company_id);
CREATE INDEX iga_attachments_object_idx ON public.iga_attachments(object_type, object_id);

CREATE TABLE public.iga_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  idem_key text NOT NULL,
  request_hash text NOT NULL,
  status public.iga_idem_status NOT NULL DEFAULT 'in_progress',
  response jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX iga_idem_unique ON public.iga_idempotency_keys(COALESCE(company_id,'00000000-0000-0000-0000-000000000000'::uuid), idem_key);

CREATE TABLE public.iga_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.iga_companies(id) ON DELETE CASCADE,
  seq_key text NOT NULL,
  period text NOT NULL DEFAULT '',
  current_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX iga_sequences_unique ON public.iga_sequences(COALESCE(company_id,'00000000-0000-0000-0000-000000000000'::uuid), seq_key, period);

CREATE TABLE public.iga_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.iga_profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.iga_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  category text NOT NULL DEFAULT 'system',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX iga_notifications_user_idx ON public.iga_notifications(user_id, read_at);

-- 3. GRANTS ------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.iga_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.iga_units TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.iga_profiles TO authenticated;
GRANT SELECT ON public.iga_permissions TO authenticated;
GRANT SELECT ON public.iga_roles TO authenticated;
GRANT SELECT ON public.iga_role_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.iga_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.iga_role_assignments TO authenticated;
GRANT SELECT ON public.iga_audit_events TO authenticated;
GRANT SELECT, INSERT ON public.iga_policy_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.iga_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iga_attachments TO authenticated;
GRANT SELECT ON public.iga_idempotency_keys TO authenticated;
GRANT SELECT ON public.iga_sequences TO authenticated;
GRANT SELECT, UPDATE ON public.iga_notifications TO authenticated;

GRANT ALL ON public.iga_companies, public.iga_units, public.iga_profiles, public.iga_permissions,
  public.iga_roles, public.iga_role_permissions, public.iga_memberships, public.iga_role_assignments,
  public.iga_audit_events, public.iga_policy_versions, public.iga_settings, public.iga_attachments,
  public.iga_idempotency_keys, public.iga_sequences, public.iga_notifications TO service_role;

-- 4. FUNÇÕES DE AUTORIZAÇÃO --------------------------------
CREATE OR REPLACE FUNCTION public.iga_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Retorna true se o usuário possui a permissão no escopo informado (default deny)
CREATE OR REPLACE FUNCTION public.iga_has_permission(_user_id uuid, _perm text, _company_id uuid DEFAULT NULL, _unit_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _user_id IS NULL OR _perm IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.iga_role_assignments ra
    JOIN public.iga_role_permissions rp ON rp.role_id = ra.role_id
    JOIN public.iga_permissions p ON p.id = rp.permission_id
    JOIN public.iga_profiles pr ON pr.id = ra.user_id
    WHERE ra.user_id = _user_id
      AND p.code = _perm
      AND pr.status = 'active'
      AND ra.revoked_at IS NULL
      AND ra.valid_from <= now()
      AND (ra.valid_until IS NULL OR ra.valid_until > now())
      AND (
        ra.scope_type = 'global'
        OR (ra.scope_type = 'company' AND _company_id IS NOT NULL AND ra.company_id = _company_id)
        OR (ra.scope_type = 'unit' AND _unit_id IS NOT NULL AND ra.unit_id = _unit_id)
      )
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.iga_is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.iga_role_assignments ra
    JOIN public.iga_roles r ON r.id = ra.role_id
    JOIN public.iga_profiles pr ON pr.id = ra.user_id
    WHERE ra.user_id = _user_id AND r.code = 'platform_admin'
      AND pr.status = 'active' AND ra.scope_type = 'global'
      AND ra.revoked_at IS NULL AND ra.valid_from <= now()
      AND (ra.valid_until IS NULL OR ra.valid_until > now())
  );
$$;

-- Empresas visíveis: vínculo ativo com usuário ativo, ou administrador da plataforma
CREATE OR REPLACE FUNCTION public.iga_can_access_company(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _user_id IS NULL OR _company_id IS NULL THEN false
  ELSE public.iga_is_platform_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.iga_memberships m
    JOIN public.iga_profiles pr ON pr.id = m.user_id
    WHERE m.user_id = _user_id AND m.company_id = _company_id
      AND m.status = 'active' AND pr.status = 'active'
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.iga_company_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.iga_companies c WHERE public.iga_is_platform_admin(_user_id)
  UNION
  SELECT m.company_id FROM public.iga_memberships m
  JOIN public.iga_profiles pr ON pr.id = m.user_id
  WHERE m.user_id = _user_id AND m.status = 'active' AND pr.status = 'active';
$$;

-- Permissão válida em qualquer escopo acessível (para telas globais)
CREATE OR REPLACE FUNCTION public.iga_has_any_permission(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.iga_role_assignments ra
    JOIN public.iga_role_permissions rp ON rp.role_id = ra.role_id
    JOIN public.iga_permissions p ON p.id = rp.permission_id
    JOIN public.iga_profiles pr ON pr.id = ra.user_id
    WHERE ra.user_id = _user_id AND p.code = _perm AND pr.status = 'active'
      AND ra.revoked_at IS NULL AND ra.valid_from <= now()
      AND (ra.valid_until IS NULL OR ra.valid_until > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.iga_has_permission(uuid,text,uuid,uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.iga_has_any_permission(uuid,text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.iga_is_platform_admin(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.iga_can_access_company(uuid,uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.iga_company_ids(uuid) TO authenticated, anon, service_role;

-- 5. AUDITORIA ---------------------------------------------
CREATE OR REPLACE FUNCTION public.iga_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_object text := TG_ARGV[0];
  v_company uuid;
  v_action public.iga_audit_action;
  v_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); v_action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN v_row := to_jsonb(NEW); v_action := 'created';
  ELSE v_row := to_jsonb(NEW); v_action := 'updated'; END IF;

  IF v_row ? 'company_id' THEN v_company := (v_row->>'company_id')::uuid;
  ELSIF v_object = 'company' THEN v_company := (v_row->>'id')::uuid;
  END IF;

  INSERT INTO public.iga_audit_events (actor_id, company_id, action, object_type, object_id, before_state, after_state, context)
  VALUES (
    auth.uid(), v_company, v_action, v_object, (v_row->>'id')::uuid,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    jsonb_build_object('op', TG_OP, 'table', TG_TABLE_NAME)
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER iga_companies_audit AFTER INSERT OR UPDATE OR DELETE ON public.iga_companies
  FOR EACH ROW EXECUTE FUNCTION public.iga_audit_trigger('company');
CREATE TRIGGER iga_units_audit AFTER INSERT OR UPDATE OR DELETE ON public.iga_units
  FOR EACH ROW EXECUTE FUNCTION public.iga_audit_trigger('unit');
CREATE TRIGGER iga_memberships_audit AFTER INSERT OR UPDATE OR DELETE ON public.iga_memberships
  FOR EACH ROW EXECUTE FUNCTION public.iga_audit_trigger('membership');
CREATE TRIGGER iga_role_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON public.iga_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.iga_audit_trigger('role_assignment');
CREATE TRIGGER iga_profiles_audit AFTER INSERT OR UPDATE OR DELETE ON public.iga_profiles
  FOR EACH ROW EXECUTE FUNCTION public.iga_audit_trigger('profile');
CREATE TRIGGER iga_attachments_audit AFTER INSERT OR UPDATE OR DELETE ON public.iga_attachments
  FOR EACH ROW EXECUTE FUNCTION public.iga_audit_trigger('attachment');

CREATE TRIGGER iga_companies_touch BEFORE UPDATE ON public.iga_companies FOR EACH ROW EXECUTE FUNCTION public.iga_touch_updated_at();
CREATE TRIGGER iga_units_touch BEFORE UPDATE ON public.iga_units FOR EACH ROW EXECUTE FUNCTION public.iga_touch_updated_at();
CREATE TRIGGER iga_profiles_touch BEFORE UPDATE ON public.iga_profiles FOR EACH ROW EXECUTE FUNCTION public.iga_touch_updated_at();
CREATE TRIGGER iga_memberships_touch BEFORE UPDATE ON public.iga_memberships FOR EACH ROW EXECUTE FUNCTION public.iga_touch_updated_at();
CREATE TRIGGER iga_ra_touch BEFORE UPDATE ON public.iga_role_assignments FOR EACH ROW EXECUTE FUNCTION public.iga_touch_updated_at();
CREATE TRIGGER iga_settings_touch BEFORE UPDATE ON public.iga_settings FOR EACH ROW EXECUTE FUNCTION public.iga_touch_updated_at();
CREATE TRIGGER iga_attachments_touch BEFORE UPDATE ON public.iga_attachments FOR EACH ROW EXECUTE FUNCTION public.iga_touch_updated_at();

-- 6. REGRAS RBAC (sem autoelevação / último administrador) --
CREATE OR REPLACE FUNCTION public.iga_guard_role_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_admin boolean; v_remaining int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_actor IS NOT NULL AND NEW.user_id = v_actor THEN
      RAISE EXCEPTION 'Autoelevação negada: um usuário não pode atribuir papéis a si mesmo';
    END IF;
    SELECT is_admin_role INTO v_admin FROM public.iga_roles WHERE id = NEW.role_id;
    IF NEW.scope_type = 'global' AND v_actor IS NOT NULL AND NOT public.iga_is_platform_admin(v_actor) THEN
      RAISE EXCEPTION 'Somente administradores da plataforma podem conceder papéis globais';
    END IF;
    NEW.granted_by := COALESCE(NEW.granted_by, v_actor);
    RETURN NEW;
  END IF;

  -- UPDATE: revogação / expiração
  IF (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
     OR (OLD.valid_until IS DISTINCT FROM NEW.valid_until AND NEW.valid_until IS NOT NULL AND NEW.valid_until <= now()) THEN
    SELECT is_admin_role INTO v_admin FROM public.iga_roles WHERE id = OLD.role_id;
    IF v_admin THEN
      SELECT count(*) INTO v_remaining
      FROM public.iga_role_assignments ra
      JOIN public.iga_roles r ON r.id = ra.role_id
      JOIN public.iga_profiles pr ON pr.id = ra.user_id
      WHERE r.is_admin_role
        AND ra.id <> OLD.id
        AND ra.revoked_at IS NULL
        AND ra.valid_from <= now()
        AND (ra.valid_until IS NULL OR ra.valid_until > now())
        AND pr.status = 'active'
        AND ra.scope_type = OLD.scope_type
        AND ra.company_id IS NOT DISTINCT FROM OLD.company_id;
      IF v_remaining = 0 THEN
        RAISE EXCEPTION 'Operação negada: o escopo ficaria sem administrador ativo';
      END IF;
    END IF;
    NEW.revoked_by := COALESCE(NEW.revoked_by, v_actor);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER iga_ra_guard BEFORE INSERT OR UPDATE ON public.iga_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.iga_guard_role_assignment();

-- Desativar usuário: bloquear se for o último administrador ativo do escopo
CREATE OR REPLACE FUNCTION public.iga_guard_profile_disable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_remaining int;
BEGIN
  IF OLD.status = 'active' AND NEW.status <> 'active' THEN
    FOR r IN
      SELECT ra.scope_type, ra.company_id FROM public.iga_role_assignments ra
      JOIN public.iga_roles ro ON ro.id = ra.role_id
      WHERE ra.user_id = OLD.id AND ro.is_admin_role AND ra.revoked_at IS NULL
        AND ra.valid_from <= now() AND (ra.valid_until IS NULL OR ra.valid_until > now())
    LOOP
      SELECT count(*) INTO v_remaining
      FROM public.iga_role_assignments ra
      JOIN public.iga_roles ro ON ro.id = ra.role_id
      JOIN public.iga_profiles pr ON pr.id = ra.user_id
      WHERE ro.is_admin_role AND ra.user_id <> OLD.id AND ra.revoked_at IS NULL
        AND ra.valid_from <= now() AND (ra.valid_until IS NULL OR ra.valid_until > now())
        AND pr.status = 'active' AND ra.scope_type = r.scope_type
        AND ra.company_id IS NOT DISTINCT FROM r.company_id;
      IF v_remaining = 0 THEN
        RAISE EXCEPTION 'Operação negada: o escopo ficaria sem administrador ativo';
      END IF;
    END LOOP;
    NEW.disabled_at := now();
    NEW.disabled_by := auth.uid();
  ELSIF OLD.status <> 'active' AND NEW.status = 'active' THEN
    NEW.disabled_at := NULL; NEW.disabled_by := NULL;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER iga_profiles_guard BEFORE UPDATE ON public.iga_profiles
  FOR EACH ROW EXECUTE FUNCTION public.iga_guard_profile_disable();

-- 7. SEQUÊNCIAS SEGURAS ------------------------------------
CREATE OR REPLACE FUNCTION public.iga_next_sequence(_company_id uuid, _seq_key text, _period text DEFAULT '')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_value bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND _company_id IS NOT NULL AND NOT public.iga_can_access_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Acesso negado ao escopo da empresa';
  END IF;
  LOOP
    UPDATE public.iga_sequences
      SET current_value = current_value + 1, updated_at = now()
      WHERE COALESCE(company_id,'00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(_company_id,'00000000-0000-0000-0000-000000000000'::uuid)
        AND seq_key = _seq_key AND period = COALESCE(_period,'')
      RETURNING current_value INTO v_value;
    IF FOUND THEN RETURN v_value; END IF;
    BEGIN
      INSERT INTO public.iga_sequences (company_id, seq_key, period, current_value)
      VALUES (_company_id, _seq_key, COALESCE(_period,''), 1)
      RETURNING current_value INTO v_value;
      RETURN v_value;
    EXCEPTION WHEN unique_violation THEN
      -- concorrência: repetir o laço e aplicar o UPDATE
    END;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.iga_next_sequence(uuid,text,text) TO authenticated, service_role;

-- 8. IDEMPOTÊNCIA ------------------------------------------
CREATE OR REPLACE FUNCTION public.iga_claim_idempotency(_company_id uuid, _idem_key text, _request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.iga_idempotency_keys%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND _company_id IS NOT NULL AND NOT public.iga_can_access_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Acesso negado ao escopo da empresa';
  END IF;
  INSERT INTO public.iga_idempotency_keys (company_id, idem_key, request_hash, created_by)
  VALUES (_company_id, _idem_key, _request_hash, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('state','new','id',v_row.id);
  END IF;

  SELECT * INTO v_row FROM public.iga_idempotency_keys
   WHERE COALESCE(company_id,'00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(_company_id,'00000000-0000-0000-0000-000000000000'::uuid)
     AND idem_key = _idem_key;

  IF v_row.request_hash IS DISTINCT FROM _request_hash THEN
    RETURN jsonb_build_object('state','conflict','id',v_row.id);
  END IF;
  RETURN jsonb_build_object('state','duplicate','id',v_row.id,'status',v_row.status,'response',v_row.response);
END; $$;

CREATE OR REPLACE FUNCTION public.iga_complete_idempotency(_id uuid, _response jsonb, _ok boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.iga_idempotency_keys
     SET status = CASE WHEN _ok THEN 'completed'::public.iga_idem_status ELSE 'failed'::public.iga_idem_status END,
         response = _response, completed_at = now()
   WHERE id = _id AND created_by IS NOT DISTINCT FROM auth.uid();
END; $$;

GRANT EXECUTE ON FUNCTION public.iga_claim_idempotency(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iga_complete_idempotency(uuid,jsonb,boolean) TO authenticated, service_role;

-- 9. BOOTSTRAP DE PERFIL (sem trigger no schema auth) -------
CREATE OR REPLACE FUNCTION public.iga_bootstrap_profile(_full_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'email','');
  v_role uuid; v_company uuid; v_admin_exists boolean; v_created boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  INSERT INTO public.iga_profiles (id, full_name, email)
  VALUES (v_uid, COALESCE(_full_name, v_email), v_email)
  ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, public.iga_profiles.email);

  SELECT EXISTS (
    SELECT 1 FROM public.iga_role_assignments ra
    JOIN public.iga_roles r ON r.id = ra.role_id
    WHERE r.code = 'platform_admin' AND ra.revoked_at IS NULL
      AND (ra.valid_until IS NULL OR ra.valid_until > now())
  ) INTO v_admin_exists;

  IF NOT v_admin_exists THEN
    SELECT id INTO v_role FROM public.iga_roles WHERE code = 'platform_admin';
    INSERT INTO public.iga_role_assignments (user_id, role_id, scope_type, grant_reason)
    VALUES (v_uid, v_role, 'global', 'Bootstrap inicial da plataforma');
    SELECT id INTO v_company FROM public.iga_companies WHERE is_operator LIMIT 1;
    IF v_company IS NOT NULL THEN
      INSERT INTO public.iga_memberships (user_id, company_id) VALUES (v_uid, v_company)
      ON CONFLICT DO NOTHING;
    END IF;
    v_created := true;
  END IF;

  RETURN jsonb_build_object('user_id', v_uid, 'bootstrapped', v_created);
END; $$;
GRANT EXECUTE ON FUNCTION public.iga_bootstrap_profile(text) TO authenticated;

-- 10. RLS ---------------------------------------------------
ALTER TABLE public.iga_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iga_notifications ENABLE ROW LEVEL SECURITY;

-- Empresas
CREATE POLICY iga_companies_select ON public.iga_companies FOR SELECT TO authenticated
  USING (public.iga_can_access_company(auth.uid(), id) AND public.iga_has_permission(auth.uid(),'companies.read',id));
CREATE POLICY iga_companies_insert ON public.iga_companies FOR INSERT TO authenticated
  WITH CHECK (public.iga_is_platform_admin(auth.uid()));
CREATE POLICY iga_companies_update ON public.iga_companies FOR UPDATE TO authenticated
  USING (public.iga_has_permission(auth.uid(),'companies.update',id))
  WITH CHECK (public.iga_has_permission(auth.uid(),'companies.update',id));

-- Unidades
CREATE POLICY iga_units_select ON public.iga_units FOR SELECT TO authenticated
  USING (public.iga_can_access_company(auth.uid(), company_id) AND public.iga_has_permission(auth.uid(),'units.read',company_id,id));
CREATE POLICY iga_units_insert ON public.iga_units FOR INSERT TO authenticated
  WITH CHECK (public.iga_has_permission(auth.uid(),'units.manage',company_id));
CREATE POLICY iga_units_update ON public.iga_units FOR UPDATE TO authenticated
  USING (public.iga_has_permission(auth.uid(),'units.manage',company_id))
  WITH CHECK (public.iga_has_permission(auth.uid(),'units.manage',company_id));

-- Perfis: o próprio, ou usuários das empresas onde há permissão de leitura
CREATE POLICY iga_profiles_select ON public.iga_profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.iga_is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.iga_memberships m
      WHERE m.user_id = public.iga_profiles.id
        AND m.company_id IN (SELECT public.iga_company_ids(auth.uid()))
        AND public.iga_has_permission(auth.uid(),'users.read',m.company_id)
    )
  );
CREATE POLICY iga_profiles_insert ON public.iga_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY iga_profiles_update ON public.iga_profiles FOR UPDATE TO authenticated
  USING (
    (id = auth.uid() AND status = 'active')
    OR EXISTS (
      SELECT 1 FROM public.iga_memberships m
      WHERE m.user_id = public.iga_profiles.id
        AND public.iga_has_permission(auth.uid(),'users.manage',m.company_id)
    )
    OR public.iga_is_platform_admin(auth.uid())
  )
  WITH CHECK (true);

-- Catálogo RBAC: leitura para autenticados ativos; alteração apenas via service_role
CREATE POLICY iga_permissions_select ON public.iga_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY iga_roles_select ON public.iga_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY iga_role_permissions_select ON public.iga_role_permissions FOR SELECT TO authenticated USING (true);

-- Vínculos
CREATE POLICY iga_memberships_select ON public.iga_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (public.iga_can_access_company(auth.uid(), company_id) AND public.iga_has_permission(auth.uid(),'users.read',company_id)));
CREATE POLICY iga_memberships_insert ON public.iga_memberships FOR INSERT TO authenticated
  WITH CHECK (public.iga_has_permission(auth.uid(),'users.manage',company_id));
CREATE POLICY iga_memberships_update ON public.iga_memberships FOR UPDATE TO authenticated
  USING (public.iga_has_permission(auth.uid(),'users.manage',company_id))
  WITH CHECK (public.iga_has_permission(auth.uid(),'users.manage',company_id));

-- Atribuições de papel
CREATE POLICY iga_ra_select ON public.iga_role_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.iga_is_platform_admin(auth.uid())
    OR (company_id IS NOT NULL AND public.iga_has_permission(auth.uid(),'rbac.read',company_id))
  );
CREATE POLICY iga_ra_insert ON public.iga_role_assignments FOR INSERT TO authenticated
  WITH CHECK (
    user_id <> auth.uid()
    AND (
      (scope_type = 'global' AND public.iga_is_platform_admin(auth.uid()))
      OR (scope_type <> 'global' AND public.iga_has_permission(auth.uid(),'rbac.assign',company_id))
    )
  );
CREATE POLICY iga_ra_update ON public.iga_role_assignments FOR UPDATE TO authenticated
  USING (
    (scope_type = 'global' AND public.iga_is_platform_admin(auth.uid()))
    OR (scope_type <> 'global' AND public.iga_has_permission(auth.uid(),'rbac.revoke',company_id))
  )
  WITH CHECK (true);

-- Auditoria: somente leitura, sem UPDATE/DELETE para qualquer papel do Data API
CREATE POLICY iga_audit_select ON public.iga_audit_events FOR SELECT TO authenticated
  USING (
    public.iga_is_platform_admin(auth.uid())
    OR (company_id IS NOT NULL AND public.iga_has_permission(auth.uid(),'audit.read',company_id))
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.iga_audit_events FROM authenticated, anon;

-- Políticas versionadas
CREATE POLICY iga_policy_select ON public.iga_policy_versions FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.iga_can_access_company(auth.uid(), company_id));
CREATE POLICY iga_policy_insert ON public.iga_policy_versions FOR INSERT TO authenticated
  WITH CHECK (
    (company_id IS NULL AND public.iga_is_platform_admin(auth.uid()))
    OR (company_id IS NOT NULL AND public.iga_has_permission(auth.uid(),'policies.manage',company_id))
  );

-- Configurações
CREATE POLICY iga_settings_select ON public.iga_settings FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.iga_can_access_company(auth.uid(), company_id));
CREATE POLICY iga_settings_write ON public.iga_settings FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND public.iga_has_permission(auth.uid(),'settings.manage',company_id));
CREATE POLICY iga_settings_update ON public.iga_settings FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND public.iga_has_permission(auth.uid(),'settings.manage',company_id))
  WITH CHECK (company_id IS NOT NULL AND public.iga_has_permission(auth.uid(),'settings.manage',company_id));

-- Anexos
CREATE POLICY iga_attachments_select ON public.iga_attachments FOR SELECT TO authenticated
  USING (public.iga_can_access_company(auth.uid(), company_id) AND public.iga_has_permission(auth.uid(),'attachments.read',company_id));
CREATE POLICY iga_attachments_insert ON public.iga_attachments FOR INSERT TO authenticated
  WITH CHECK (public.iga_has_permission(auth.uid(),'attachments.upload',company_id) AND uploaded_by = auth.uid());
CREATE POLICY iga_attachments_update ON public.iga_attachments FOR UPDATE TO authenticated
  USING (public.iga_has_permission(auth.uid(),'attachments.manage',company_id))
  WITH CHECK (public.iga_has_permission(auth.uid(),'attachments.manage',company_id));
CREATE POLICY iga_attachments_delete ON public.iga_attachments FOR DELETE TO authenticated
  USING (public.iga_has_permission(auth.uid(),'attachments.manage',company_id));

-- Idempotência e sequências: leitura restrita, escrita só pelas funções
CREATE POLICY iga_idem_select ON public.iga_idempotency_keys FOR SELECT TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY iga_sequences_select ON public.iga_sequences FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.iga_can_access_company(auth.uid(), company_id));

-- Notificações
CREATE POLICY iga_notifications_select ON public.iga_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY iga_notifications_update ON public.iga_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 11. RLS DO STORAGE (bucket privado) -----------------------
CREATE POLICY iga_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'iga-attachments'
    AND EXISTS (
      SELECT 1 FROM public.iga_attachments a
      WHERE a.storage_path = storage.objects.name
        AND public.iga_can_access_company(auth.uid(), a.company_id)
        AND public.iga_has_permission(auth.uid(),'attachments.read',a.company_id)
    )
  );
CREATE POLICY iga_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'iga-attachments'
    AND public.iga_has_permission(auth.uid(),'attachments.upload',NULLIF(split_part(name,'/',1),'')::uuid)
  );
CREATE POLICY iga_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'iga-attachments'
    AND public.iga_has_permission(auth.uid(),'attachments.manage',NULLIF(split_part(name,'/',1),'')::uuid)
  );

-- 12. SEED DO CATÁLOGO RBAC ---------------------------------
INSERT INTO public.iga_permissions (code, module, description) VALUES
  ('companies.read','companies','Visualizar empresas'),
  ('companies.create','companies','Criar empresas'),
  ('companies.update','companies','Alterar empresas'),
  ('units.read','units','Visualizar unidades'),
  ('units.manage','units','Criar e alterar unidades'),
  ('users.read','users','Visualizar usuários'),
  ('users.manage','users','Gerenciar usuários e vínculos'),
  ('rbac.read','rbac','Visualizar papéis e atribuições'),
  ('rbac.assign','rbac','Conceder papéis'),
  ('rbac.revoke','rbac','Revogar papéis'),
  ('audit.read','audit','Consultar trilha de auditoria'),
  ('attachments.read','attachments','Acessar anexos'),
  ('attachments.upload','attachments','Enviar anexos'),
  ('attachments.manage','attachments','Gerenciar e remover anexos'),
  ('settings.read','settings','Visualizar configurações'),
  ('settings.manage','settings','Alterar configurações'),
  ('policies.read','policies','Visualizar políticas versionadas'),
  ('policies.manage','policies','Publicar novas versões de política'),
  ('notifications.read','notifications','Visualizar notificações');

INSERT INTO public.iga_roles (code, name, description, scope_level, is_system, is_admin_role) VALUES
  ('platform_admin','Administrador da Plataforma','Autoridade global da operadora IGA','global',true,true),
  ('company_admin','Administrador da Empresa','Autoridade administrativa no escopo da própria empresa','company',true,true),
  ('company_manager','Gestor','Gestão operacional no escopo da empresa','company',true,false),
  ('member','Membro','Acesso operacional básico','company',true,false),
  ('auditor','Auditor','Somente leitura, incluindo auditoria','company',true,false);

-- platform_admin: todas as permissões
INSERT INTO public.iga_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.iga_roles r CROSS JOIN public.iga_permissions p WHERE r.code = 'platform_admin';

-- company_admin: tudo exceto criação de empresas
INSERT INTO public.iga_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.iga_roles r CROSS JOIN public.iga_permissions p
WHERE r.code = 'company_admin' AND p.code <> 'companies.create';

INSERT INTO public.iga_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.iga_roles r CROSS JOIN public.iga_permissions p
WHERE r.code = 'company_manager' AND p.code IN
  ('companies.read','units.read','units.manage','users.read','rbac.read','attachments.read','attachments.upload','settings.read','policies.read','notifications.read');

INSERT INTO public.iga_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.iga_roles r CROSS JOIN public.iga_permissions p
WHERE r.code = 'member' AND p.code IN
  ('companies.read','units.read','attachments.read','attachments.upload','notifications.read');

INSERT INTO public.iga_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.iga_roles r CROSS JOIN public.iga_permissions p
WHERE r.code = 'auditor' AND p.code IN
  ('companies.read','units.read','users.read','rbac.read','audit.read','attachments.read','settings.read','policies.read','notifications.read');

-- Empresa operadora IGA
INSERT INTO public.iga_companies (legal_name, trade_name, is_operator) VALUES
  ('IGA Network BR','IGA Network', true);

-- Política inicial versionada (infraestrutura, sem regras de fases futuras)
INSERT INTO public.iga_policy_versions (policy_key, version, payload)
VALUES ('foundation.access', 1, '{"default":"deny","phase":1}'::jsonb);