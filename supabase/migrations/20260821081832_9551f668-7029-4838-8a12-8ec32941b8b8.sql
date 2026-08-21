DROP TABLE IF EXISTS public.iga_role_permissions CASCADE;
DROP TABLE IF EXISTS public.iga_role_assignments CASCADE;
DROP TABLE IF EXISTS public.iga_permissions CASCADE;
DROP TABLE IF EXISTS public.iga_roles CASCADE;
DROP TABLE IF EXISTS public.iga_memberships CASCADE;
DROP TABLE IF EXISTS public.iga_units CASCADE;
DROP TABLE IF EXISTS public.iga_notifications CASCADE;
DROP TABLE IF EXISTS public.iga_attachments CASCADE;
DROP TABLE IF EXISTS public.iga_audit_events CASCADE;
DROP TABLE IF EXISTS public.iga_policy_versions CASCADE;
DROP TABLE IF EXISTS public.iga_settings CASCADE;
DROP TABLE IF EXISTS public.iga_sequences CASCADE;
DROP TABLE IF EXISTS public.iga_idempotency_keys CASCADE;
DROP TABLE IF EXISTS public.iga_profiles CASCADE;
DROP TABLE IF EXISTS public.iga_companies CASCADE;

DROP FUNCTION IF EXISTS public.iga_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.iga_bootstrap_profile(text) CASCADE;
DROP FUNCTION IF EXISTS public.iga_can_access_company(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.iga_claim_idempotency(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.iga_company_ids(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.iga_complete_idempotency(uuid, jsonb, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.iga_guard_profile_disable() CASCADE;
DROP FUNCTION IF EXISTS public.iga_guard_role_assignment() CASCADE;
DROP FUNCTION IF EXISTS public.iga_has_any_permission(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.iga_has_permission(uuid, text, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.iga_is_platform_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.iga_next_sequence(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.iga_touch_updated_at() CASCADE;

DROP TYPE IF EXISTS public.iga_audit_action CASCADE;
DROP TYPE IF EXISTS public.iga_entity_status CASCADE;
DROP TYPE IF EXISTS public.iga_idem_status CASCADE;
DROP TYPE IF EXISTS public.iga_scope_type CASCADE;
DROP TYPE IF EXISTS public.iga_user_status CASCADE;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%iga%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;