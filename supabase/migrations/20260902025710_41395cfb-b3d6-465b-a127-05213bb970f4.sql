-- ============ BLOCO 4B — FUNDAÇÃO FINANCEIRA ============

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE public.finance_recurrence AS ENUM ('monthly','quarterly','semiannual','annual','one_off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.finance_service_status AS ENUM ('active','paused','cancelled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.finance_entity_status AS ENUM ('active','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. finance_vendors
CREATE TABLE IF NOT EXISTS public.finance_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  document text,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  default_currency text NOT NULL DEFAULT 'BRL',
  status public.finance_entity_status NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_vendors_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT finance_vendors_currency_len CHECK (char_length(default_currency) = 3)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_vendors TO authenticated;
GRANT ALL ON public.finance_vendors TO service_role;
ALTER TABLE public.finance_vendors ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_vendors_name ON public.finance_vendors (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_finance_vendors_status ON public.finance_vendors (status);

CREATE POLICY "Vendors viewable by financial viewers" ON public.finance_vendors
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'financial.view'));
CREATE POLICY "Vendors insert by financial editors" ON public.finance_vendors
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));
CREATE POLICY "Vendors update by financial editors" ON public.finance_vendors
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'financial.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));
CREATE POLICY "Vendors delete by owner" ON public.finance_vendors
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- 3. finance_categories
CREATE TABLE IF NOT EXISTS public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  parent_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'other',
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_categories_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT finance_categories_kind_valid CHECK (kind IN ('infra','dev','ai','service','other')),
  CONSTRAINT finance_categories_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;
GRANT ALL ON public.finance_categories TO service_role;
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_categories_slug ON public.finance_categories (slug);
CREATE INDEX IF NOT EXISTS idx_finance_categories_parent ON public.finance_categories (parent_id);

CREATE POLICY "Categories viewable by financial viewers" ON public.finance_categories
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'financial.view'));
CREATE POLICY "Categories insert by financial editors" ON public.finance_categories
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));
CREATE POLICY "Categories update by financial editors" ON public.finance_categories
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'financial.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));
CREATE POLICY "Categories delete by owner" ON public.finance_categories
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- 4. finance_services
CREATE TABLE IF NOT EXISTS public.finance_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.finance_vendors(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  plan text,
  recurrence public.finance_recurrence NOT NULL DEFAULT 'monthly',
  amount numeric(14,2),
  currency text NOT NULL DEFAULT 'BRL',
  billing_day smallint,
  contracted_at date,
  renews_at date,
  expires_at date,
  auto_renew boolean NOT NULL DEFAULT true,
  status public.finance_service_status NOT NULL DEFAULT 'active',
  project_account_id uuid REFERENCES public.project_accounts(id) ON DELETE SET NULL,
  default_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  is_shared boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_services_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT finance_services_amount_non_negative CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT finance_services_billing_day_valid CHECK (billing_day IS NULL OR (billing_day BETWEEN 1 AND 31)),
  CONSTRAINT finance_services_currency_len CHECK (char_length(currency) = 3),
  CONSTRAINT finance_services_dates_coherent CHECK (
    (expires_at IS NULL OR contracted_at IS NULL OR expires_at >= contracted_at)
    AND (renews_at IS NULL OR contracted_at IS NULL OR renews_at >= contracted_at)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_services TO authenticated;
GRANT ALL ON public.finance_services TO service_role;
ALTER TABLE public.finance_services ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_finance_services_vendor ON public.finance_services (vendor_id);
CREATE INDEX IF NOT EXISTS idx_finance_services_category ON public.finance_services (category_id);
CREATE INDEX IF NOT EXISTS idx_finance_services_project ON public.finance_services (default_project_id);
CREATE INDEX IF NOT EXISTS idx_finance_services_renews_at ON public.finance_services (renews_at);
CREATE INDEX IF NOT EXISTS idx_finance_services_status ON public.finance_services (status);

CREATE POLICY "Services viewable by financial viewers or project members" ON public.finance_services
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(), 'financial.view')
    OR (default_project_id IS NOT NULL AND public.can_view_project_dossier(default_project_id, auth.uid()))
  );
CREATE POLICY "Services insert by financial editors" ON public.finance_services
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));
CREATE POLICY "Services update by financial editors" ON public.finance_services
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'financial.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'financial.edit'));
CREATE POLICY "Services delete by owner" ON public.finance_services
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- 5. updated_at triggers
CREATE TRIGGER trg_finance_vendors_updated BEFORE UPDATE ON public.finance_vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_finance_categories_updated BEFORE UPDATE ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_finance_services_updated BEFORE UPDATE ON public.finance_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. auditoria (reuso de log_audit)
CREATE TRIGGER trg_finance_vendors_audit AFTER INSERT OR UPDATE OR DELETE ON public.finance_vendors
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('finance_vendors');
CREATE TRIGGER trg_finance_categories_audit AFTER INSERT OR UPDATE OR DELETE ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('finance_categories');
CREATE TRIGGER trg_finance_services_audit AFTER INSERT OR UPDATE OR DELETE ON public.finance_services
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('finance_services');

-- 7. last_activity via default_project_id
CREATE OR REPLACE FUNCTION public.touch_project_activity_via_finance_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := OLD.default_project_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW.default_project_id; END IF;

  IF TG_OP = 'UPDATE' AND v_old IS NOT DISTINCT FROM v_new
     AND to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN
    RETURN NEW;
  END IF;

  IF v_new IS NOT NULL THEN
    UPDATE public.projects SET last_activity_at = clock_timestamp() WHERE id = v_new;
  END IF;
  IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new THEN
    UPDATE public.projects SET last_activity_at = clock_timestamp() WHERE id = v_old;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_finance_services_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_services
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity_via_finance_service();

-- 8. seed idempotente de categorias
INSERT INTO public.finance_categories (name, slug, kind, position) VALUES
  ('Infraestrutura','infraestrutura','infra',10),
  ('Plataforma de Desenvolvimento','plataforma-desenvolvimento','dev',20),
  ('Banco de Dados','banco-de-dados','infra',30),
  ('Hospedagem/Cloud','hospedagem-cloud','infra',40),
  ('Domínios','dominios','infra',50),
  ('Inteligência Artificial','inteligencia-artificial','ai',60),
  ('APIs e Integrações','apis-integracoes','service',70),
  ('Serviços de Terceiros','servicos-terceiros','service',80),
  ('Outros','outros','other',90)
ON CONFLICT (slug) DO NOTHING;