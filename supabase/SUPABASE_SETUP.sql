-- ============================================================
-- AVTAR SINGH PG - SUPABASE SETUP (003 + 004 + 005 + 006 + 007 + 008 + 009 + 010)
-- Run this ONLY after migrations 001 and 002 are already applied.
--
-- HOW: Supabase Dashboard -> SQL Editor -> New query -> paste
-- this ENTIRE file -> click Run.
--
-- ABOUT THE WARNING: Supabase may warn about a "destructive"
-- statement. It is caused by a small number of DROP POLICY lines.
-- They remove old SECURITY POLICIES only. They do NOT delete
-- any table, column, schema, row or data. It is safe to confirm.
--
-- 003 = Q4 features (dues, presence, requests, alerts, notices)
-- 004 = one-time Super Admin bootstrap + signup hardening
-- 005 = owner-only warden promotion RPC
-- 006 = storage buckets/policies (fixes document-upload RLS) +
--       SMS OTP password reset + PAN encryption RPC
-- 007 = SMS hardening: pg_net, real provider-response
--       verification, sms_status() + sms_send_test()
-- 008 = forgot-password lookup fix: backfill phone from signup
--       metadata and match it when resolving an identifier
-- 009 = decrypt_pan() (owner-only PAN decryption) + put notices,
--       notifications, profiles, tenant_requests, emergency_alerts,
--       complaints and daily_presence into the realtime publication
-- 010 = tenant checkout request (date + time + feedback) sent to the
--       owner, owner approval that archives then permanently deletes
--       the tenant and all personal documents, former-tenants archive,
--       Privacy Policy + Terms & Conditions with a tenant login gate
--
-- Safe to re-run.
-- ============================================================
-- ============================================================
-- AVTAR PG MANAGER — Migration 003: Q4 Updates
-- Run this in Supabase SQL Editor (after 001 + 002)
-- Covers: theme-safe data saves, dues reminders, due-day rule,
-- profiles/rooms/notices/privacy, warden activity, tenant
-- requests, daily presence, emergency alerts.
-- ============================================================

-- ── 1. Tenancies: monthly due day (allocation date default) ──
ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS due_day INT DEFAULT 5;
-- Backfill from check-in date where missing
UPDATE tenancies SET due_day = EXTRACT(DAY FROM check_in_date)::INT
WHERE due_day IS NULL OR due_day < 1 OR due_day > 31;

-- ── 2. Rooms: listing fields (BHK, photos, videos, location) ──
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'studio';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';

-- ── 3. Notices: fine support ──
ALTER TABLE notices ADD COLUMN IF NOT EXISTS fine_amount INT;  -- paise
ALTER TABLE notices ADD COLUMN IF NOT EXISTS damaged_item TEXT;

-- ── 4. New enums ──
DO $$ BEGIN CREATE TYPE tenant_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE presence_status AS ENUM ('present', 'absent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend notice_type with 'fine' if enum is used
ALTER TYPE notice_type ADD VALUE IF NOT EXISTS 'fine';

-- ── 5. Tenant amenity / requirement requests ──
CREATE TABLE IF NOT EXISTS tenant_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id         UUID REFERENCES rooms(id),
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'other',
  status          tenant_request_status NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  reviewer_id     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Daily presence marking ──
CREATE TABLE IF NOT EXISTS daily_presence (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  presence_date DATE NOT NULL,
  status        presence_status NOT NULL,
  marked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, presence_date)
);
CREATE INDEX IF NOT EXISTS idx_presence_date ON daily_presence(presence_date);
CREATE INDEX IF NOT EXISTS idx_presence_room ON daily_presence(room_id, presence_date);

-- ── 7. Emergency room alerts ──
CREATE TABLE IF NOT EXISTS emergency_alerts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. App settings (privacy policy etc.) ──
CREATE TABLE IF NOT EXISTS app_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL,
  updated_by  UUID REFERENCES profiles(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. Warden invites audit ──
CREATE TABLE IF NOT EXISTS warden_invites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id),
  email       TEXT,
  phone       TEXT,
  channel     TEXT NOT NULL DEFAULT 'email',
  status      TEXT NOT NULL DEFAULT 'sent',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. RLS: enable + policies for new tables ──
ALTER TABLE tenant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE warden_invites ENABLE ROW LEVEL SECURITY;

-- Tenant requests
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_requests' AND policyname = 'tenant_full_own_requests') THEN
    CREATE POLICY "tenant_full_own_requests" ON tenant_requests FOR ALL
      USING (tenant_id = my_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_requests' AND policyname = 'warden_full_requests') THEN
    CREATE POLICY "warden_full_requests" ON tenant_requests FOR ALL
      USING (property_id IN (SELECT warden_property_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_requests' AND policyname = 'owner_full_requests') THEN
    CREATE POLICY "owner_full_requests" ON tenant_requests FOR ALL
      USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- Daily presence (tenant writes own, warden/owner read property, roommates read same room)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_presence' AND policyname = 'tenant_writes_own_presence') THEN
    CREATE POLICY "tenant_writes_own_presence" ON daily_presence FOR ALL
      USING (tenant_id = my_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_presence' AND policyname = 'tenant_reads_room_presence') THEN
    CREATE POLICY "tenant_reads_room_presence" ON daily_presence FOR SELECT
      USING (room_id IN (SELECT room_id FROM tenancies WHERE tenant_id = my_tenant_id() AND status = 'active'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_presence' AND policyname = 'warden_full_presence') THEN
    CREATE POLICY "warden_full_presence" ON daily_presence FOR ALL
      USING (property_id IN (SELECT warden_property_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_presence' AND policyname = 'owner_full_presence') THEN
    CREATE POLICY "owner_full_presence" ON daily_presence FOR ALL
      USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- Emergency alerts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'tenant_full_own_alerts') THEN
    CREATE POLICY "tenant_full_own_alerts" ON emergency_alerts FOR ALL
      USING (tenant_id = my_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'tenant_reads_room_alerts') THEN
    CREATE POLICY "tenant_reads_room_alerts" ON emergency_alerts FOR SELECT
      USING (room_id IN (SELECT room_id FROM tenancies WHERE tenant_id = my_tenant_id() AND status = 'active'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'warden_full_alerts') THEN
    CREATE POLICY "warden_full_alerts" ON emergency_alerts FOR ALL
      USING (property_id IN (SELECT warden_property_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'owner_full_alerts') THEN
    CREATE POLICY "owner_full_alerts" ON emergency_alerts FOR ALL
      USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- App settings (privacy policy)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'public_read_settings') THEN
    CREATE POLICY "public_read_settings" ON app_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'owner_write_settings') THEN
    CREATE POLICY "owner_write_settings" ON app_settings FOR ALL USING (is_owner());
  END IF;
END $$;

-- Warden invites
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'warden_invites' AND policyname = 'owner_full_invites') THEN
    CREATE POLICY "owner_full_invites" ON warden_invites FOR ALL USING (is_owner());
  END IF;
END $$;

-- ── 11. FIX: notifications — owner/warden must be able to notify tenants ──
-- Remove the old restrictive policy (policy only — NO table/data is deleted),
-- then add role-aware rules.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'users_own_notifications') THEN
    DROP POLICY "users_own_notifications" ON notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'users_read_own_notifications') THEN
    CREATE POLICY "users_read_own_notifications" ON notifications FOR SELECT
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'users_update_own_notifications') THEN
    CREATE POLICY "users_update_own_notifications" ON notifications FOR UPDATE
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'owner_can_notify_anyone') THEN
    CREATE POLICY "owner_can_notify_anyone" ON notifications FOR INSERT
      WITH CHECK (is_owner());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'warden_can_notify_property') THEN
    CREATE POLICY "warden_can_notify_property" ON notifications FOR INSERT
      WITH CHECK (is_warden());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'users_insert_own_notifications') THEN
    CREATE POLICY "users_insert_own_notifications" ON notifications FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ── 12. FIX: tenant self-update for presence quick-path (defaults already safe) ──
-- Allow tenants to update their own tenancy due_day (before-15th rule is
-- enforced in the app; RLS here only scopes to own row).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenancies' AND policyname = 'tenant_update_own_tenancy_due_day') THEN
    CREATE POLICY "tenant_update_own_tenancy_due_day" ON tenancies FOR UPDATE
      USING (tenant_id = my_tenant_id());
  END IF;
END $$;

-- ── 13. Helpful indexes ──
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_requests_tenant ON tenant_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_room ON emergency_alerts(room_id, is_active);


-- ============================================================
-- 004_owner_setup.sql
-- One-time Super Admin (owner) bootstrap.
--
-- WHY: The app has a single shared email/password sign-in. The
-- role comes from public.profiles.role. Tenant self-registration
-- always creates role = 'tenant', so the first owner account must
-- be claimed explicitly.
--
-- SAFETY: claim_first_owner() only works while NO owner exists.
-- Once an owner is created, the function refuses to promote anyone
-- else. Run this migration, then use "Super Admin setup" on the
-- Welcome screen once.
-- ============================================================

-- Does a Super Admin (owner) already exist?
CREATE OR REPLACE FUNCTION public.owner_exists()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'owner');
$$;

REVOKE ALL ON FUNCTION public.owner_exists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_exists() TO anon, authenticated;

-- Promote the currently signed-in account to owner, but ONLY if
-- no owner exists yet. Uses a transaction advisory lock so two
-- simultaneous claims cannot both succeed.
CREATE OR REPLACE FUNCTION public.claim_first_owner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to claim Super Admin access.';
  END IF;

  -- Serialize concurrent claims.
  PERFORM pg_advisory_xact_lock(918273645);

  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'owner') THEN
    RAISE EXCEPTION 'A Super Admin account already exists. Please sign in with that account.';
  END IF;

  INSERT INTO public.profiles (id, email, role)
  SELECT u.id, u.email, 'owner'::public.user_role
  FROM auth.users u
  WHERE u.id = uid
  ON CONFLICT (id) DO UPDATE SET role = 'owner'::public.user_role;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_first_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_first_owner() TO authenticated;

-- ============================================================
-- SECURITY FIX: signup must NEVER trust a client-supplied role.
-- Previously handle_new_user() read raw_user_meta_data->>'role',
-- which let anyone call the signup API with role=owner and bypass
-- the one-time bootstrap. Every new signup is now a tenant.
-- Owners are promoted only via claim_first_owner() above (once),
-- and wardens only via the owner portal.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'tenant')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;



-- ============================================================
-- 005_warden_promotion.sql
-- Owner-only warden creation.
--
-- WHY: Migration 004 hardened handle_new_user() so that EVERY
-- signup becomes role = 'tenant' (client-supplied metadata is
-- never trusted). That is the correct security behaviour, but it
-- means the owner portal can no longer create a warden by passing
-- role: 'warden' at signup time.
--
-- FIX: the owner signs the warden up (the trigger creates a
-- tenant), then calls promote_to_warden(<new user id>). The
-- function refuses unless the CALLER is the owner.
--
-- The app calls auth.signUp() through a SEPARATE, non-persisted
-- Supabase client so the owner's own session is not replaced by
-- the new warden session.
--
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.promote_to_warden(
  target_user_id uuid,
  warden_name text DEFAULT NULL,
  warden_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role public.user_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to add a warden.';
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'owner'::public.user_role THEN
    RAISE EXCEPTION 'Only the Super Admin can add wardens.';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing warden account.';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'That account does not exist yet. Ask the warden to confirm their email first.';
  END IF;

  -- SECURITY DEFINER is required here: normal owners cannot update another
  -- user's profile row under RLS, so name/phone are written in this function.
  UPDATE public.profiles
     SET role = 'warden'::public.user_role,
         full_name = COALESCE(NULLIF(trim(warden_name), ''), full_name),
         phone = COALESCE(NULLIF(trim(warden_phone), ''), phone),
         updated_at = NOW()
   WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_warden(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_to_warden(uuid, text, text) TO authenticated;

-- Convenience: does the currently signed-in user have an owner profile?
-- (owner_exists() already tells us if ANY owner exists; this is per-user.)
CREATE OR REPLACE FUNCTION public.am_i_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.am_i_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.am_i_owner() TO authenticated;

-- Verify:
--   SELECT proname FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN ('promote_to_warden','am_i_owner');
-- Expect 2 rows.

-- ============================================================
-- 006_storage_and_otp.sql (appended to combined setup)
-- ============================================================

-- ============================================================
-- 006_storage_and_otp.sql
-- Two fixes in one idempotent migration:
--
--   PART 1 — STORAGE BUCKETS + RLS POLICIES
--     Fixes: "new row violates row level security policy" when a
--     student / employee uploads registration documents.
--     Root cause: 002 only had *comments* about storage policies;
--     the buckets and storage.objects policies were never created.
--
--   PART 2 — SMS OTP PASSWORD RESET (all roles)
--     Adds password_reset_otps + RPCs used by the Forgot Password
--     screen. A random 6-digit OTP is generated server-side and
--     sent to the account's mobile number.
--
-- Run this in Supabase SQL Editor AFTER 001-005.
-- Safe to re-run.
-- ============================================================


-- ============================================================
-- PART 1 — STORAGE
-- ============================================================

-- Buckets must exist before storage.objects policies can match.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('tenant_docs',     'tenant_docs',     false, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('complaint_photos','complaint_photos', false, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---- tenant_docs -------------------------------------------------
-- Path convention:
--   <auth uid>/photo.jpg            (student / employee registration)
--   <auth uid>/address_proof.jpg
--   <auth uid>/aadhaar_front.jpg
--   <auth uid>/avatar_*.jpg         (profile photo)
--   <tenant record id>/...          (legacy / defensive)
DROP POLICY IF EXISTS "tenant_docs_insert_own" ON storage.objects;
CREATE POLICY "tenant_docs_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant_docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = my_tenant_id()::text
    )
  );

DROP POLICY IF EXISTS "tenant_docs_update_own" ON storage.objects;
CREATE POLICY "tenant_docs_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant_docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = my_tenant_id()::text
    )
  );

DROP POLICY IF EXISTS "tenant_docs_delete_own" ON storage.objects;
CREATE POLICY "tenant_docs_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant_docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = my_tenant_id()::text
    )
  );

-- Owner + wardens review KYC documents through short-lived signed URLs.
DROP POLICY IF EXISTS "tenant_docs_read_staff" ON storage.objects;
CREATE POLICY "tenant_docs_read_staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant_docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = my_tenant_id()::text
      OR is_warden()   -- is_warden() is true for owner + warden
    )
  );

-- ---- complaint_photos --------------------------------------------
-- The app uploads to <tenant record id>/complaint_*.jpg, so allow
-- either the auth uid or the caller's tenant record id as folder.
DROP POLICY IF EXISTS "complaint_photos_insert_own" ON storage.objects;
CREATE POLICY "complaint_photos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'complaint_photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = my_tenant_id()::text
    )
  );

DROP POLICY IF EXISTS "complaint_photos_read" ON storage.objects;
CREATE POLICY "complaint_photos_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'complaint_photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = my_tenant_id()::text
      OR is_warden()
    )
  );

DROP POLICY IF EXISTS "complaint_photos_update_own" ON storage.objects;
CREATE POLICY "complaint_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'complaint_photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = my_tenant_id()::text
    )
  );

DROP POLICY IF EXISTS "complaint_photos_delete_own" ON storage.objects;
CREATE POLICY "complaint_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'complaint_photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = my_tenant_id()::text
    )
  );


-- ============================================================
-- PART 1b — WARDEN CAN SEE PENDING REGISTRATIONS
-- Registration rows are inserted with property_id = NULL, so the
-- original policy (property_id IN warden_property_ids()) hid every
-- pending application from wardens. Wardens now see unassigned
-- applications plus applications for their own properties.
-- ============================================================
DROP POLICY IF EXISTS "warden_reads_property_registrations" ON public.tenant_registrations;
CREATE POLICY "warden_reads_property_registrations" ON public.tenant_registrations
  FOR SELECT
  USING (
    is_warden()
    AND (property_id IS NULL OR property_id IN (SELECT warden_property_ids()))
  );

DROP POLICY IF EXISTS "warden_updates_registration_status" ON public.tenant_registrations;
CREATE POLICY "warden_updates_registration_status" ON public.tenant_registrations
  FOR UPDATE
  USING (
    is_warden()
    AND (property_id IS NULL OR property_id IN (SELECT warden_property_ids()))
  )
  WITH CHECK (
    is_warden()
    AND (property_id IS NULL OR property_id IN (SELECT warden_property_ids()))
  );


-- ============================================================
-- PART 2 — SMS OTP PASSWORD RESET
-- ============================================================

-- Phone helper: keep only the last 10 digits (Indian mobile).
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN length(regexp_replace(p, '\D', '', 'g')) < 10 THEN NULL
    ELSE right(regexp_replace(p, '\D', '', 'g'), 10)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mask_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL OR length(p) < 4 THEN '******'
    ELSE repeat('*', greatest(length(p) - 4, 0)) || right(p, 4)
  END;
$$;

-- Store the phone number on the profile at signup. The app now sends
-- phone in the signUp metadata; the trigger is the only writer, so a
-- client can never set another user's phone.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    public.normalize_phone(NEW.raw_user_meta_data->>'phone'),
    'tenant'::public.user_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill phone numbers for accounts created before 006.
UPDATE public.profiles p
SET phone = src.phone
FROM (
  SELECT DISTINCT ON (user_id)
         user_id,
         public.normalize_phone(phone) AS phone
  FROM public.tenant_registrations
  WHERE phone IS NOT NULL
  ORDER BY user_id, created_at DESC
) src
WHERE p.id = src.user_id
  AND src.phone IS NOT NULL
  AND public.normalize_phone(p.phone) IS NULL;

-- Resolve an email or mobile number to an account. Internal only.
CREATE OR REPLACE FUNCTION public.find_account_by_identifier(p_identifier text)
RETURNS TABLE (user_id uuid, email text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identifier text := lower(trim(coalesce(p_identifier, '')));
  v_digits     text := public.normalize_phone(p_identifier);
BEGIN
  RETURN QUERY
  SELECT p.id,
         p.email,
         COALESCE(
           public.normalize_phone(p.phone),
           (SELECT public.normalize_phone(r.phone)
              FROM public.tenant_registrations r
             WHERE r.user_id = p.id AND r.phone IS NOT NULL
             ORDER BY r.created_at DESC
             LIMIT 1)
         )
  FROM public.profiles p
  WHERE lower(p.email) = v_identifier
     OR (v_digits IS NOT NULL AND public.normalize_phone(p.phone) = v_digits)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_account_by_identifier(text) FROM PUBLIC, anon, authenticated;

-- One-time OTP records. RLS on + no policies + no grants = only
-- SECURITY DEFINER functions (owned by postgres) can read it.
CREATE TABLE IF NOT EXISTS public.password_reset_otps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone        text NOT NULL,
  otp_hash     text NOT NULL,
  attempts     int  NOT NULL DEFAULT 0,
  max_attempts int  NOT NULL DEFAULT 5,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_reset_otps FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user
  ON public.password_reset_otps (user_id, created_at DESC);

-- Private SMS provider credentials. Never readable by anon/authenticated:
-- app_settings has a public SELECT policy, so secrets must live here.
CREATE TABLE IF NOT EXISTS public.sms_provider_config (
  id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider     text NOT NULL DEFAULT 'none', -- none | fast2sms | msg91 | webhook
  api_key      text,
  sender_id    text,
  template_id  text,
  webhook_url  text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_provider_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sms_provider_config FROM anon, authenticated;
INSERT INTO public.sms_provider_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Send the OTP through the configured provider using pg_net.
-- Returns: sent | unconfigured | misconfigured | failed
CREATE OR REPLACE FUNCTION public.send_sms_otp(p_phone text, p_otp text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c          public.sms_provider_config;
  v_digits   text := public.normalize_phone(p_phone);
  v_message  text;
BEGIN
  IF v_digits IS NULL THEN
    RETURN 'misconfigured';
  END IF;

  SELECT * INTO c FROM public.sms_provider_config WHERE id = 1;
  IF c.provider IS NULL OR c.provider = 'none' OR coalesce(c.api_key, '') = '' THEN
    RETURN 'unconfigured';
  END IF;

  v_message := 'Your AVTAR SINGH PG verification code is ' || p_otp ||
               '. It expires in 10 minutes. Do not share this code with anyone.';

  BEGIN
    IF c.provider = 'fast2sms' THEN
      PERFORM net.http_post(
        url     := 'https://www.fast2sms.com/dev/bulkV2',
        headers := jsonb_build_object(
          'authorization', c.api_key,
          'Content-Type', 'application/json'
        ),
        body    := jsonb_build_object(
          'route', 'q',
          'message', v_message,
          'language', 'english',
          'flash', '0',
          'numbers', v_digits
        )
      );
      RETURN 'sent';

    ELSIF c.provider = 'msg91' THEN
      IF coalesce(c.template_id, '') = '' THEN
        RETURN 'misconfigured';
      END IF;
      PERFORM net.http_get(
        url    := 'https://control.msg91.com/api/v5/otp',
        params := jsonb_build_object(
          'template_id', c.template_id,
          'mobile', '91' || v_digits,
          'authkey', c.api_key,
          'otp', p_otp
        )
      );
      RETURN 'sent';

    ELSIF c.provider = 'webhook' THEN
      IF coalesce(c.webhook_url, '') = '' THEN
        RETURN 'misconfigured';
      END IF;
      PERFORM net.http_post(
        url     := c.webhook_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'to', '+91' || v_digits,
          'message', v_message,
          'otp', p_otp,
          'sender', c.sender_id,
          'api_key', c.api_key
        )
      );
      RETURN 'sent';
    END IF;

    RETURN 'misconfigured';
  EXCEPTION WHEN OTHERS THEN
    -- Most commonly pg_net is not enabled on the project.
    RAISE NOTICE 'send_sms_otp failed: %', SQLERRM;
    RETURN 'failed';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.send_sms_otp(text, text) FROM PUBLIC, anon, authenticated;

-- Owner-only: configure the SMS provider from the app (or SQL).
CREATE OR REPLACE FUNCTION public.set_sms_provider(
  p_provider    text,
  p_api_key     text,
  p_sender_id   text DEFAULT NULL,
  p_template_id text DEFAULT NULL,
  p_webhook_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only the Super Admin can change SMS settings.';
  END IF;

  UPDATE public.sms_provider_config
     SET provider    = lower(coalesce(nullif(trim(p_provider), ''), 'none')),
         -- A blank key keeps the existing secret (so saving other fields
         -- from the app never wipes it). Enter a key to replace it.
         api_key     = CASE
                         WHEN p_api_key IS NULL OR trim(p_api_key) = '' THEN api_key
                         ELSE trim(p_api_key)
                       END,
         sender_id   = nullif(trim(p_sender_id), ''),
         template_id = nullif(trim(p_template_id), ''),
         webhook_url = nullif(trim(p_webhook_url), ''),
         updated_at  = now()
   WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.set_sms_provider(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_sms_provider(text, text, text, text, text) TO authenticated;

-- Owner-only: read the non-secret SMS settings (never returns the key).
CREATE OR REPLACE FUNCTION public.get_sms_provider()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.sms_provider_config;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only the Super Admin can view SMS settings.';
  END IF;

  SELECT * INTO c FROM public.sms_provider_config WHERE id = 1;

  RETURN jsonb_build_object(
    'provider', c.provider,
    'sender_id', c.sender_id,
    'template_id', c.template_id,
    'webhook_url', c.webhook_url,
    'has_api_key', coalesce(c.api_key, '') <> ''
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sms_provider() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sms_provider() TO authenticated;

-- Owner-only: show the OTP on screen while no SMS provider is set up.
-- MUST be turned off once a real provider is configured.
CREATE OR REPLACE FUNCTION public.set_sms_dev_mode(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only the Super Admin can change SMS settings.';
  END IF;

  INSERT INTO public.app_settings (key, value)
  VALUES ('sms_dev_mode', CASE WHEN p_enabled THEN 'true' ELSE 'false' END)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_sms_dev_mode(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_sms_dev_mode(boolean) TO authenticated;

-- Generate + send a 6-digit OTP. Callable while signed out.
CREATE OR REPLACE FUNCTION public.request_password_otp(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid       uuid;
  v_phone     text;
  v_otp       text;
  v_status    text;
  v_dev       text;
  v_recent    int;
BEGIN
  SELECT a.user_id, a.phone INTO v_uid, v_phone
  FROM public.find_account_by_identifier(p_identifier) a;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No account was found for that email or mobile number.'
    );
  END IF;

  IF v_phone IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No mobile number is saved for this account. Ask the Super Admin to add your phone number in your profile, then try again.'
    );
  END IF;

  -- Abuse limits: max 5 per hour, max 1 per 45 seconds.
  SELECT count(*) INTO v_recent
  FROM public.password_reset_otps
  WHERE user_id = v_uid AND created_at > now() - interval '1 hour';

  IF v_recent >= 5 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Too many OTP requests. Please try again after an hour.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.password_reset_otps
    WHERE user_id = v_uid AND created_at > now() - interval '45 seconds'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Please wait about a minute before requesting a new OTP.'
    );
  END IF;

  v_otp := lpad(
    (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text,
    6,
    '0'
  );

  -- Invalidate any previous live OTP.
  UPDATE public.password_reset_otps
     SET consumed_at = now()
   WHERE user_id = v_uid AND consumed_at IS NULL;

  INSERT INTO public.password_reset_otps (user_id, phone, otp_hash, expires_at)
  VALUES (v_uid, v_phone, crypt(v_otp, gen_salt('bf', 10)), now() + interval '10 minutes');

  v_dev := NULL;
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    EXECUTE 'SELECT value FROM public.app_settings WHERE key = ''sms_dev_mode'' LIMIT 1'
      INTO v_dev;
  END IF;

  IF coalesce(v_dev, 'false') <> 'true' THEN
    v_status := public.send_sms_otp(v_phone, v_otp);

    IF v_status = 'unconfigured' OR v_status = 'misconfigured' OR v_status = 'failed' THEN
      -- Never leave a live OTP that could not be delivered.
      UPDATE public.password_reset_otps
         SET consumed_at = now()
       WHERE user_id = v_uid AND consumed_at IS NULL;

      RETURN jsonb_build_object(
        'ok', false,
        'error', CASE v_status
          WHEN 'unconfigured' THEN 'SMS service is not configured yet. Ask the Super Admin to enable mobile OTP.'
          WHEN 'misconfigured' THEN 'SMS service settings are incomplete. Ask the Super Admin to check them.'
          ELSE 'Could not send the SMS right now. Please try again in a minute.'
        END
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'delivery', 'sms',
      'phone', public.mask_phone(v_phone),
      'message', 'A 6-digit OTP has been sent to your mobile number.'
    );
  END IF;

  -- Demo mode (no SMS provider configured yet).
  RETURN jsonb_build_object(
    'ok', true,
    'delivery', 'demo',
    'phone', public.mask_phone(v_phone),
    'dev_otp', v_otp,
    'message', 'Demo mode: SMS is not configured, so the OTP is shown on screen.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_password_otp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_password_otp(text) TO anon, authenticated;

-- Verify the OTP and set a new password.
CREATE OR REPLACE FUNCTION public.reset_password_with_otp(
  p_identifier   text,
  p_otp          text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid   uuid;
  v_row   public.password_reset_otps;
  v_left  int;
BEGIN
  SELECT a.user_id INTO v_uid
  FROM public.find_account_by_identifier(p_identifier) a;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No account was found for that email or mobile number.');
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Password must be at least 8 characters long.');
  END IF;

  IF p_otp IS NULL OR length(trim(p_otp)) <> 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter the 6-digit OTP.');
  END IF;

  SELECT * INTO v_row
  FROM public.password_reset_otps
  WHERE user_id = v_uid AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No active OTP. Please request a new one.');
  END IF;

  IF v_row.expires_at < now() THEN
    UPDATE public.password_reset_otps SET consumed_at = now() WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'This OTP has expired. Please request a new one.');
  END IF;

  IF v_row.attempts >= v_row.max_attempts THEN
    UPDATE public.password_reset_otps SET consumed_at = now() WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts. Please request a new OTP.');
  END IF;

  IF crypt(trim(p_otp), v_row.otp_hash) <> v_row.otp_hash THEN
    UPDATE public.password_reset_otps
       SET attempts = attempts + 1
     WHERE id = v_row.id;

    v_left := greatest(v_row.max_attempts - v_row.attempts - 1, 0);
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Incorrect OTP. %s attempt(s) left.', v_left)
    );
  END IF;

  -- Same bcrypt format GoTrue uses, so sign-in works immediately.
  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf', 10)),
         updated_at = now()
   WHERE id = v_uid;

  UPDATE public.password_reset_otps
     SET consumed_at = now()
   WHERE user_id = v_uid AND consumed_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Password updated. You can now sign in with your new password.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_password_with_otp(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_password_with_otp(text, text, text) TO anon, authenticated;

-- Demo mode is ON by default so the flow can be tested before an SMS
-- provider is connected. Turn it OFF after configuring a provider:
--   SELECT public.set_sms_dev_mode(false);
DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    INSERT INTO public.app_settings (key, value)
    SELECT 'sms_dev_mode', 'true'
    WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'sms_dev_mode');
  END IF;
END $$;

-- Try to enable pg_net (ignore if the project already has it or the
-- extension is not available). SMS delivery needs it.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net not enabled: %', SQLERRM;
END $$;


-- ============================================================
-- PART 3 — PAN ENCRYPTION (employee registration)
-- The app has always called encrypt_pan(), but the function was
-- never created, so PAN numbers were silently stored in plain text.
-- The key lives in a private table (no anon/authenticated grants).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_secrets FROM anon, authenticated;

INSERT INTO public.app_secrets (key, value)
SELECT 'pan_key', gen_random_uuid()::text || gen_random_uuid()::text
WHERE NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'pan_key');

CREATE OR REPLACE FUNCTION public.encrypt_pan(pan_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  k text;
BEGIN
  IF pan_text IS NULL OR length(trim(pan_text)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT value INTO k FROM public.app_secrets WHERE key = 'pan_key';
  IF k IS NULL THEN
    RAISE EXCEPTION 'PAN encryption key is missing. Run migration 006 again.';
  END IF;

  RETURN encode(pgp_sym_encrypt(upper(trim(pan_text)), k), 'base64');
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_pan(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encrypt_pan(text) TO authenticated;


-- ============================================================
-- VERIFY
-- ============================================================
-- Buckets (expect 2 rows):
--   SELECT id, public FROM storage.buckets WHERE id IN ('tenant_docs','complaint_photos');
-- Storage policies (expect 7 rows):
--   SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'tenant_docs%' OR policyname LIKE 'complaint_photos%';
-- OTP functions (expect 5 rows):
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname IN ('request_password_otp','reset_password_with_otp',
--                         'set_sms_provider','set_sms_dev_mode','send_sms_otp');
-- ============================================================


-- ============================================================
-- 007_sms_hardening.sql
-- Makes the SMS OTP transport verifiable and self-diagnosing.
--
-- WHY THIS FILE EXISTS
--   006 shipped send_sms_otp() on top of pg_net's net.http_post(),
--   which is ASYNCHRONOUS: it queues a request and returns a request
--   id. The old code returned 'sent' immediately, so a bad API key,
--   an expired DLT template or a rejected sender id still looked
--   like a success. The user saw "OTP sent" and no SMS ever arrived.
--
--   This migration:
--     1. enables pg_net explicitly (it is required for outbound HTTP)
--     2. rewrites send_sms_otp() to WAIT for the provider response and
--        read the real status code + body, so failures are visible
--     3. rewrites request_password_otp() so it only reports success on a
--        genuinely delivered message
--     4. adds sms_status()   -> owner-only health check
--     5. adds sms_send_test() -> owner-only one-tap test message that
--        returns the provider's raw response
--
-- Run in Supabase SQL Editor AFTER 006. Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
-- 1. pg_net (outbound HTTP from Postgres)
-- ------------------------------------------------------------
-- If this line fails with "extension pg_net must be installed by
-- superuser", run it separately as the postgres role:
--   CREATE EXTENSION pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ------------------------------------------------------------
-- 2. Interpret a provider response
-- ------------------------------------------------------------
-- Returns NULL when the response looks like a success, otherwise a
-- short human-readable error. Handles the three shapes our
-- providers return:
--   Fast2SMS  {"return":"success"|"error","message":"..."}
--   MSG91     {"type":"success"|"error","message":"..."}
--   Generic   HTTP 4xx/5xx or a body containing "error"
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_response_error(p_status int, p_body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_body text := coalesce(p_body, '');
BEGIN
  IF p_status IS NULL THEN
    RETURN NULL; -- no response captured; do not invent a failure
  END IF;

  IF p_status >= 400 THEN
    RETURN 'HTTP ' || p_status || ' from provider: ' ||
           left(regexp_replace(v_body, '\s+', ' ', 'g'), 200);
  END IF;

  IF v_body ~* '"return"\s*:\s*"error"' THEN
    RETURN left(regexp_replace(v_body, '\s+', ' ', 'g'), 200);
  END IF;

  IF v_body ~* '"type"\s*:\s*"error"' THEN
    RETURN left(regexp_replace(v_body, '\s+', ' ', 'g'), 200);
  END IF;

  IF v_body ~* '"status"\s*:\s*"fail' THEN
    RETURN left(regexp_replace(v_body, '\s+', ' ', 'g'), 200);
  END IF;

  IF v_body ~* 'invalid[ _-]?(api[ _-]?)?key|unauthori[sz]ed|invalid[ _-]?credentials' THEN
    RETURN 'Provider rejected the API key: ' ||
           left(regexp_replace(v_body, '\s+', ' ', 'g'), 200);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_response_error(int, text) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 3. send_sms_otp - now waits for the provider's answer
-- ------------------------------------------------------------
-- Returns:
--   sent                              provider accepted the message
--   unconfigured                      no provider / no API key set
--   misconfigured                      provider chosen but required
--                                     fields (sender id, template id,
--                                     webhook url) are missing
--   failed:<detail>                   provider rejected the request
--   failed:no-response                pg_net did not return in time
CREATE OR REPLACE FUNCTION public.send_sms_otp(p_phone text, p_otp text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  c          public.sms_provider_config;
  v_digits   text := public.normalize_phone(p_phone);
  v_message  text;
  v_req_id   bigint;
  v_status   int;
  v_body     text;
  v_error    text;
BEGIN
  IF v_digits IS NULL THEN
    RETURN 'misconfigured';
  END IF;

  SELECT * INTO c FROM public.sms_provider_config WHERE id = 1;
  IF c.provider IS NULL OR c.provider = 'none' OR coalesce(c.api_key, '') = '' THEN
    RETURN 'unconfigured';
  END IF;

  v_message := 'Your AVTAR SINGH PG verification code is ' || p_otp ||
               '. It expires in 10 minutes. Do not share this code with anyone.';

  BEGIN
    IF c.provider = 'fast2sms' THEN
      IF coalesce(c.sender_id, '') = '' THEN
        RETURN 'misconfigured';
      END IF;

      v_req_id := net.http_post(
        url     := 'https://www.fast2sms.com/dev/bulkV2',
        headers := jsonb_build_object(
          'authorization', c.api_key,
          'Content-Type', 'application/json'
        ),
        body    := jsonb_build_object(
          'route', 'q',
          'sender_id', c.sender_id,
          'message', v_message,
          'language', 'english',
          'flash', '0',
          'numbers', v_digits
        )
      );

    ELSIF c.provider = 'msg91' THEN
      IF coalesce(c.template_id, '') = '' THEN
        RETURN 'misconfigured';
      END IF;

      v_req_id := net.http_get(
        url    := 'https://control.msg91.com/api/v5/otp',
        params := jsonb_build_object(
          'template_id', c.template_id,
          'mobile', '91' || v_digits,
          'authkey', c.api_key,
          'otp', p_otp
        )
      );

    ELSIF c.provider = 'webhook' THEN
      IF coalesce(c.webhook_url, '') = '' THEN
        RETURN 'misconfigured';
      END IF;

      v_req_id := net.http_post(
        url     := c.webhook_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'to', '+91' || v_digits,
          'message', v_message,
          'otp', p_otp,
          'sender', c.sender_id,
          'api_key', c.api_key
        )
      );

    ELSE
      RETURN 'misconfigured';
    END IF;

    -- pg_net is asynchronous: wait for the response row to appear.
    -- Up to ~12 seconds, half a second at a time.
    FOR i IN 1..24 LOOP
      BEGIN
        SELECT r.status_code, r.content
          INTO v_status, v_body
          FROM net._http_response r
         WHERE r.id = v_req_id;
      EXCEPTION WHEN OTHERS THEN
        v_status := NULL;
        v_body := NULL;
      END;

      EXIT WHEN v_status IS NOT NULL;

      PERFORM pg_sleep(0.5);
    END LOOP;

    IF v_status IS NULL THEN
      -- Request was queued but no answer arrived. Treat as a soft
      -- failure so the user is told to retry rather than being left
      -- waiting for an SMS that may never come.
      RETURN 'failed:no response from provider (check API key, sender id and DLT template)';
    END IF;

    v_error := public.sms_response_error(v_status, v_body);
    IF v_error IS NOT NULL THEN
      RETURN 'failed:' || v_error;
    END IF;

    RETURN 'sent';

  EXCEPTION WHEN OTHERS THEN
    -- Most commonly pg_net is not enabled on the project.
    RAISE NOTICE 'send_sms_otp failed: %', SQLERRM;
    RETURN 'failed:' || left(SQLERRM, 180);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.send_sms_otp(text, text) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 4. request_password_otp - only reports success on delivery
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_password_otp(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid       uuid;
  v_phone     text;
  v_otp       text;
  v_status    text;
  v_dev       text;
  v_recent    int;
BEGIN
  SELECT a.user_id, a.phone INTO v_uid, v_phone
  FROM public.find_account_by_identifier(p_identifier) a;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No account was found for that email or mobile number.'
    );
  END IF;

  IF v_phone IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No mobile number is saved for this account. Ask the Super Admin to add your phone number in your profile, then try again.'
    );
  END IF;

  -- Abuse limits: max 5 per hour, max 1 per 45 seconds.
  SELECT count(*) INTO v_recent
  FROM public.password_reset_otps
  WHERE user_id = v_uid AND created_at > now() - interval '1 hour';

  IF v_recent >= 5 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Too many OTP requests. Please try again after an hour.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.password_reset_otps
    WHERE user_id = v_uid AND created_at > now() - interval '45 seconds'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Please wait about a minute before requesting a new OTP.'
    );
  END IF;

  v_otp := lpad(
    (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text,
    6,
    '0'
  );

  -- Invalidate any previous live OTP.
  UPDATE public.password_reset_otps
     SET consumed_at = now()
   WHERE user_id = v_uid AND consumed_at IS NULL;

  INSERT INTO public.password_reset_otps (user_id, phone, otp_hash, expires_at)
  VALUES (v_uid, v_phone, crypt(v_otp, gen_salt('bf', 10)), now() + interval '10 minutes');

  v_dev := NULL;
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    EXECUTE 'SELECT value FROM public.app_settings WHERE key = ''sms_dev_mode'' LIMIT 1'
      INTO v_dev;
  END IF;

  IF coalesce(v_dev, 'false') <> 'true' THEN
    v_status := public.send_sms_otp(v_phone, v_otp);

    -- Only a real delivery counts as success. 'failed:...' carries the
    -- provider's own complaint, which is what the owner needs to fix.
    IF v_status IS DISTINCT FROM 'sent' THEN
      -- Never leave a live OTP that could not be delivered.
      UPDATE public.password_reset_otps
         SET consumed_at = now()
       WHERE user_id = v_uid AND consumed_at IS NULL;

      RETURN jsonb_build_object(
        'ok', false,
        'delivery', 'sms',
        'error', CASE
          WHEN v_status = 'unconfigured' THEN 'SMS service is not configured yet. Ask the Super Admin to enable mobile OTP.'
          WHEN v_status = 'misconfigured' THEN 'SMS service settings are incomplete. Ask the Super Admin to check them.'
          WHEN v_status LIKE 'failed:%' THEN 'Could not send the SMS right now. Please try again in a minute.'
          ELSE 'Could not send the SMS right now. Please try again in a minute.'
        END
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'delivery', 'sms',
      'phone', public.mask_phone(v_phone),
      'message', 'A 6-digit OTP has been sent to your mobile number.'
    );
  END IF;

  -- Demo mode (no SMS provider configured yet).
  RETURN jsonb_build_object(
    'ok', true,
    'delivery', 'demo',
    'phone', public.mask_phone(v_phone),
    'dev_otp', v_otp,
    'message', 'Demo mode: SMS is not configured, so the OTP is shown on screen.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_password_otp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_password_otp(text) TO anon, authenticated;


-- ------------------------------------------------------------
-- 5. sms_status - owner-only health check
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        public.sms_provider_config;
  v_dev    text;
  v_pgnet  boolean := false;
  v_problem text;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only the Super Admin can view SMS settings.';
  END IF;

  SELECT * INTO c FROM public.sms_provider_config WHERE id = 1;

  IF to_regclass('public.app_settings') IS NOT NULL THEN
    EXECUTE 'SELECT value FROM public.app_settings WHERE key = ''sms_dev_mode'' LIMIT 1'
      INTO v_dev;
  END IF;

  BEGIN
    PERFORM 1 FROM pg_extension WHERE extname = 'pg_net';
    v_pgnet := true;
  EXCEPTION WHEN OTHERS THEN
    v_pgnet := false;
  END;

  -- Work out what is still missing.
  v_problem := NULL;
  IF c.provider IS NULL OR c.provider = 'none' THEN
    v_problem := 'No SMS provider selected.';
  ELSIF coalesce(c.api_key, '') = '' THEN
    v_problem := 'API key is missing.';
  ELSIF c.provider = 'fast2sms' AND coalesce(c.sender_id, '') = '' THEN
    v_problem := 'Sender ID is missing.';
  ELSIF c.provider = 'msg91' AND coalesce(c.template_id, '') = '' THEN
    v_problem := 'Template ID is missing.';
  ELSIF c.provider = 'webhook' AND coalesce(c.webhook_url, '') = '' THEN
    v_problem := 'Webhook URL is missing.';
  ELSIF NOT v_pgnet THEN
    v_problem := 'pg_net extension is not enabled on this Supabase project.';
  END IF;

  RETURN jsonb_build_object(
    'provider', c.provider,
    'has_api_key', coalesce(c.api_key, '') <> '',
    'sender_id', c.sender_id,
    'template_id', c.template_id,
    'webhook_url', c.webhook_url,
    'dev_mode', coalesce(v_dev, 'true') = 'true',
    'pg_net_enabled', v_pgnet,
    'ready', v_problem IS NULL,
    'problem', v_problem
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sms_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_status() TO authenticated;


-- ------------------------------------------------------------
-- 6. sms_send_test - owner-only test message
-- ------------------------------------------------------------
-- Sends a real message to p_phone and returns the provider's raw
-- answer, so the owner can confirm the key / sender / DLT template
-- from the phone instead of guessing.
CREATE OR REPLACE FUNCTION public.sms_send_test(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  c         public.sms_provider_config;
  v_digits  text := public.normalize_phone(p_phone);
  v_req_id  bigint;
  v_status  int;
  v_body    text;
  v_error   text;
  v_message text;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only the Super Admin can send test messages.';
  END IF;

  IF v_digits IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Enter a valid 10-digit Indian mobile number.'
    );
  END IF;

  SELECT * INTO c FROM public.sms_provider_config WHERE id = 1;

  IF c.provider IS NULL OR c.provider = 'none' OR coalesce(c.api_key, '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No SMS provider is configured yet. Choose a provider and save an API key first.'
    );
  END IF;

  v_message := 'AVTAR SINGH PG test message. Your SMS gateway is working correctly.';

  BEGIN
    IF c.provider = 'fast2sms' THEN
      IF coalesce(c.sender_id, '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sender ID is missing. Save it first.');
      END IF;
      v_req_id := net.http_post(
        url     := 'https://www.fast2sms.com/dev/bulkV2',
        headers := jsonb_build_object(
          'authorization', c.api_key,
          'Content-Type', 'application/json'
        ),
        body    := jsonb_build_object(
          'route', 'q',
          'sender_id', c.sender_id,
          'message', v_message,
          'language', 'english',
          'flash', '0',
          'numbers', v_digits
        )
      );

    ELSIF c.provider = 'msg91' THEN
      IF coalesce(c.template_id, '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Template ID is missing. Save it first.');
      END IF;
      v_req_id := net.http_get(
        url    := 'https://control.msg91.com/api/v5/otp',
        params := jsonb_build_object(
          'template_id', c.template_id,
          'mobile', '91' || v_digits,
          'authkey', c.api_key,
          'otp', '123456'
        )
      );

    ELSIF c.provider = 'webhook' THEN
      IF coalesce(c.webhook_url, '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Webhook URL is missing. Save it first.');
      END IF;
      v_req_id := net.http_post(
        url     := c.webhook_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'to', '+91' || v_digits,
          'message', v_message,
          'otp', '123456',
          'sender', c.sender_id,
          'api_key', c.api_key,
          'test', true
        )
      );

    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Unknown provider: ' || c.provider);
    END IF;

    FOR i IN 1..24 LOOP
      BEGIN
        SELECT r.status_code, r.content
          INTO v_status, v_body
          FROM net._http_response r
         WHERE r.id = v_req_id;
      EXCEPTION WHEN OTHERS THEN
        v_status := NULL;
        v_body := NULL;
      END;

      EXIT WHEN v_status IS NOT NULL;
      PERFORM pg_sleep(0.5);
    END LOOP;

    IF v_status IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'provider', c.provider,
        'error', 'No response from the provider within 12 seconds. Check the API key, sender id and DLT template.'
      );
    END IF;

    v_error := public.sms_response_error(v_status, v_body);

    RETURN jsonb_build_object(
      'ok', v_error IS NULL,
      'provider', c.provider,
      'to', '+91' || v_digits,
      'http_status', v_status,
      'response', left(coalesce(v_body, ''), 600),
      'error', v_error
    );

  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'provider', c.provider,
      'error', left(SQLERRM, 300)
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_send_test(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sms_send_test(text) TO authenticated;


-- ============================================================
-- VERIFY
-- ============================================================
-- pg_net (expect true):
--   SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net');
-- Health check (run as the Super Admin in SQL Editor):
--   SELECT public.sms_status();
-- Test message (run as the Super Admin):
--   SELECT public.sms_send_test('9876543210');
-- ============================================================


-- ============================================================
-- 008_identifier_lookup_fix.sql
--
-- BUG: "Forgot password" says "No account was found for that email
-- or mobile number" even though the account WAS created with that
-- mobile number.
--
-- ROOT CAUSE (two parts)
--
--   1. The signup trigger threw the phone number away.
--      Migration 001/004's handle_new_user() was:
--          INSERT INTO profiles (id, email, role) VALUES (...)
--      There was NO phone column. The number the user typed during
--      registration / Super Admin setup was stored by Supabase in
--      auth.users.raw_user_meta_data, but the app's trigger never
--      copied it into profiles.phone - so profiles.phone stayed NULL
--      for every account created before migration 006.
--
--      Migration 006 added the phone column to the trigger and
--      backfilled from tenant_registrations, but it never backfilled
--      from the signup metadata, which is where the original number
--      actually lives.
--
--   2. find_account_by_identifier() only matched on profiles.phone.
--      The COALESCE over tenant_registrations only affected the VALUE
--      returned, never the WHERE clause - so a number that existed
--      only in the registration was reported as "not found".
--
-- THIS MIGRATION
--   a. backfills profiles.phone from the signup metadata
--   b. backfills profiles.phone from tenant_registrations (defensive)
--   c. rewrites find_account_by_identifier() to search ALL three
--      sources: profiles.phone, auth.users signup metadata, and
--      tenant_registrations.phone
--
-- Run in Supabase SQL Editor AFTER 007. Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
-- a. Backfill from the signup metadata (the number typed at signup)
-- ------------------------------------------------------------
-- This is the number the user actually remembers entering.
UPDATE public.profiles p
   SET phone = public.normalize_phone(a.raw_user_meta_data->>'phone')
  FROM auth.users a
 WHERE a.id = p.id
   AND public.normalize_phone(p.phone) IS NULL
   AND public.normalize_phone(a.raw_user_meta_data->>'phone') IS NOT NULL;


-- ------------------------------------------------------------
-- b. Backfill from tenant registrations (defensive)
-- ------------------------------------------------------------
UPDATE public.profiles p
   SET phone = src.phone
  FROM (
    SELECT DISTINCT ON (user_id)
           user_id,
           public.normalize_phone(phone) AS phone
      FROM public.tenant_registrations
     WHERE phone IS NOT NULL
     ORDER BY user_id, created_at DESC
  ) src
 WHERE p.id = src.user_id
   AND public.normalize_phone(p.phone) IS NULL
   AND src.phone IS NOT NULL;


-- ------------------------------------------------------------
-- c. Resolve an email or mobile number to an account (v2)
-- ------------------------------------------------------------
-- Now matches on any of the three places a phone can be stored and
-- returns the best one it finds.
CREATE OR REPLACE FUNCTION public.find_account_by_identifier(p_identifier text)
RETURNS TABLE (user_id uuid, email text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identifier text := lower(trim(coalesce(p_identifier, '')));
  v_digits     text := public.normalize_phone(p_identifier);
BEGIN
  IF v_identifier = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.email,
         COALESCE(
           public.normalize_phone(p.phone),
           public.normalize_phone(a.raw_user_meta_data->>'phone'),
           (SELECT public.normalize_phone(r.phone)
              FROM public.tenant_registrations r
             WHERE r.user_id = p.id
               AND r.phone IS NOT NULL
             ORDER BY r.created_at DESC
             LIMIT 1)
         ) AS phone
  FROM public.profiles p
  JOIN auth.users a ON a.id = p.id
  WHERE lower(p.email) = v_identifier
     OR (
       v_digits IS NOT NULL
       AND (
         public.normalize_phone(p.phone) = v_digits
         OR public.normalize_phone(a.raw_user_meta_data->>'phone') = v_digits
         OR EXISTS (
              SELECT 1
                FROM public.tenant_registrations r
               WHERE r.user_id = p.id
                 AND public.normalize_phone(r.phone) = v_digits
            )
       )
     )
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_account_by_identifier(text) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- d. Clearer messages on the OTP request
-- ------------------------------------------------------------
-- The old text told every user "Ask the Super Admin to add your
-- phone number", even when the user WAS the Super Admin - and there
-- is no Super Admin to ask when you are locked out. Owners and
-- wardens can edit their own phone from Profile.
CREATE OR REPLACE FUNCTION public.request_password_otp(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid       uuid;
  v_phone     text;
  v_otp       text;
  v_status    text;
  v_dev       text;
  v_recent    int;
  v_is_email  boolean := position('@' in coalesce(p_identifier, '')) > 0;
BEGIN
  SELECT a.user_id, a.phone INTO v_uid, v_phone
  FROM public.find_account_by_identifier(p_identifier) a;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE
        WHEN v_is_email THEN
          'No account was found for that email address. Check the spelling, or try the mobile number on your account instead.'
        ELSE
          'No account was found for that mobile number. Check the number, or try the email address on your account instead.'
      END
    );
  END IF;

  IF v_phone IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No mobile number is saved for this account. Open Profile, enter your mobile number and save, then try again.'
    );
  END IF;

  -- Abuse limits: max 5 per hour, max 1 per 45 seconds.
  SELECT count(*) INTO v_recent
  FROM public.password_reset_otps
  WHERE user_id = v_uid AND created_at > now() - interval '1 hour';

  IF v_recent >= 5 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Too many OTP requests. Please try again after an hour.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.password_reset_otps
    WHERE user_id = v_uid AND created_at > now() - interval '45 seconds'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Please wait about a minute before requesting a new OTP.'
    );
  END IF;

  v_otp := lpad(
    (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text,
    6,
    '0'
  );

  UPDATE public.password_reset_otps
     SET consumed_at = now()
   WHERE user_id = v_uid AND consumed_at IS NULL;

  INSERT INTO public.password_reset_otps (user_id, phone, otp_hash, expires_at)
  VALUES (v_uid, v_phone, crypt(v_otp, gen_salt('bf', 10)), now() + interval '10 minutes');

  v_dev := NULL;
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    EXECUTE 'SELECT value FROM public.app_settings WHERE key = ''sms_dev_mode'' LIMIT 1'
      INTO v_dev;
  END IF;

  IF coalesce(v_dev, 'false') <> 'true' THEN
    v_status := public.send_sms_otp(v_phone, v_otp);

    IF v_status IS DISTINCT FROM 'sent' THEN
      UPDATE public.password_reset_otps
         SET consumed_at = now()
       WHERE user_id = v_uid AND consumed_at IS NULL;

      RETURN jsonb_build_object(
        'ok', false,
        'delivery', 'sms',
        'error', CASE
          WHEN v_status = 'unconfigured' THEN 'SMS service is not configured yet. Ask the Super Admin to enable mobile OTP.'
          WHEN v_status = 'misconfigured' THEN 'SMS service settings are incomplete. Ask the Super Admin to check them.'
          ELSE 'Could not send the SMS right now. Please try again in a minute.'
        END
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'delivery', 'sms',
      'phone', public.mask_phone(v_phone),
      'message', 'A 6-digit OTP has been sent to your mobile number.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'delivery', 'demo',
    'phone', public.mask_phone(v_phone),
    'dev_otp', v_otp,
    'message', 'Demo mode: SMS is not configured, so the OTP is shown on screen.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_password_otp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_password_otp(text) TO anon, authenticated;


-- ============================================================
-- VERIFY (run this in the SQL Editor to see where your number is)
-- ============================================================
-- Replace the email with the address you sign in with:
--
--   SELECT p.email,
--          p.phone                        AS profiles_phone,
--          a.raw_user_meta_data->>'phone' AS signup_meta_phone,
--          (SELECT r.phone FROM public.tenant_registrations r
--            WHERE r.user_id = p.id
--            ORDER BY r.created_at DESC LIMIT 1) AS registration_phone,
--          public.normalize_phone(
--            COALESCE(p.phone, a.raw_user_meta_data->>'phone')
--          ) AS resolved
--     FROM public.profiles p
--     JOIN auth.users a ON a.id = p.id
--    WHERE lower(p.email) = 'YOUR_EMAIL_HERE';
--
-- Expected after this migration: `resolved` is your 10-digit number.
-- If every column is NULL, no number was ever saved - set it once in
-- the app (Profile -> Phone Number -> Save) or with:
--
--   UPDATE public.profiles
--      SET phone = '9876543210'
--    WHERE lower(email) = 'YOUR_EMAIL_HERE';
-- ============================================================

-- ============================================================
-- 009_pan_decrypt_and_realtime.sql
--
-- TWO BUGS FOUND WHILE TESTING THE APP END-TO-END.
--
--
-- BUG 1: Owner approvals shows an encrypted PAN blob
-- --------------------------------------------------
-- app/(owner)/approvals.tsx calls:
--
--     supabase.rpc('decrypt_pan', { encrypted_pan: reg.pan_encrypted })
--
-- but NO migration ever created decrypt_pan(). PostgREST answers
-- 404 with the hint "Perhaps you meant to call the function
-- public.encrypt_pan". The screen's catch block then falls back to
-- printing the raw base64 ciphertext, so the Super Admin sees a
-- meaningless blob instead of the PAN they are meant to verify.
--
-- FIX: add decrypt_pan() as the exact mirror of encrypt_pan()
-- (006_storage_and_otp.sql) - owner-only, SECURITY DEFINER, reads
-- the same key from app_secrets.
--
--
-- BUG 2: Realtime delivers nothing (notifications / notices dead)
-- --------------------------------------------------------------
-- Verified against the live project:
--   broadcast  -> SUBSCRIBED, events received   (service healthy)
--   presence   -> SUBSCRIBED, tracked           (service healthy)
--   postgres_changes -> SUBSCRIBED, 0 events    (BROKEN)
--
-- The subscription joins successfully but no row change is ever
-- delivered, on any table, for a user who can both write and read
-- the row. Cause: a table only produces realtime events when it is
-- a member of the `supabase_realtime` publication, and no migration
-- in this project ever ran
--
--     ALTER PUBLICATION supabase_realtime ADD TABLE ...
--
-- Tables created by SQL migrations are NOT added automatically -
-- only tables toggled through the dashboard are. So every table in
-- this app was outside the publication.
--
-- Impact in the app:
--   * notification badge never updates live (notificationStore)
--   * tenant notice board never refreshes live (notices.tsx)
--   * both fall back to "only when you pull-to-refresh / reopen"
--
-- FIX: add the tables the app actually subscribes to (plus the
-- safety-critical ones worth pushing live) to the publication.
-- Idempotent: membership is checked first, so re-running is safe.
--
-- Run in Supabase SQL Editor AFTER 007 and 008.
-- ============================================================


-- ============================================================
-- BUG 1: decrypt_pan()
-- ============================================================
-- Mirror of public.encrypt_pan(pan_text text) from migration 006.
-- Key material lives in public.app_secrets ('pan_key') and is only
-- readable by SECURITY DEFINER code, so the key never leaves the
-- database.
CREATE OR REPLACE FUNCTION public.decrypt_pan(encrypted_pan text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  k    text;
  raw  bytea;
BEGIN
  IF encrypted_pan IS NULL OR length(trim(encrypted_pan)) = 0 THEN
    RETURN NULL;
  END IF;

  -- PAN data is owner-only. encrypt_pan() is granted to any
  -- authenticated user (employees submit their own PAN), but only
  -- the Super Admin is allowed to read one back.
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only the Super Admin can view PAN numbers.';
  END IF;

  SELECT value INTO k FROM public.app_secrets WHERE key = 'pan_key';
  IF k IS NULL THEN
    RAISE EXCEPTION 'PAN encryption key is missing. Run migration 006 again.';
  END IF;

  BEGIN
    raw := decode(trim(encrypted_pan), 'base64');
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Stored PAN is not valid encrypted data.';
  END;

  RETURN upper(trim(convert_from(pgp_sym_decrypt(raw, k), 'UTF8')));
END;
$$;

-- Owner-only: no anon, no other authenticated user.
REVOKE ALL ON FUNCTION public.decrypt_pan(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_pan(text) TO authenticated;


-- ============================================================
-- BUG 2: put the app's tables into the realtime publication
-- ============================================================
-- `supabase_realtime` is the publication Supabase's realtime
-- service reads. Membership is required for postgres_changes.
--
-- WHY THESE TABLES:
--   notices, notifications - the two the app subscribes to today
--   profiles                - role/phone/avatar changes across devices
--   tenant_requests         - owner/warden must see new requests live
--   emergency_alerts        - safety critical, must not wait for refresh
--   complaints              - status updates pushed to the tenant
--   daily_presence          - presence board updates as people mark
--
-- Add more later with the same statement, e.g.
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
DO $$
DECLARE
  t text;
BEGIN
  IF to_regclass('pg_catalog.pg_publication') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE NOTICE 'Publication supabase_realtime not found - skipping realtime setup.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'notices', 'notifications', 'profiles', 'tenant_requests',
    'emergency_alerts', 'complaints', 'daily_presence'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table public.% does not exist - skipped.', t;
    ELSIF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added public.% to supabase_realtime publication.', t;
    END IF;
  END LOOP;
END
$$;


-- ============================================================
-- VERIFY
-- ============================================================
-- 1. decrypt_pan exists and is owner-gated:
--      SELECT p.proname, pg_get_function_identity_arguments(p.oid)
--        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'decrypt_pan';
--
-- 2. publication membership (expect 7 rows):
--      SELECT schemaname, tablename
--        FROM pg_publication_tables
--       WHERE pubname = 'supabase_realtime'
--       ORDER BY tablename;
--
-- 3. End-to-end realtime check from the app: open the tenant Notice
--    board on one device, post a notice as the owner on another -
--    the board updates without pulling to refresh. The notification
--    badge should also tick over the moment a notification is
--    inserted.
-- ============================================================

-- ============================================================
-- 010_checkout_and_policies.sql (appended to combined setup)
-- ============================================================
-- ============================================================
-- AVTAR PG MANAGER — Migration 010: Tenant Checkout + Archive
--   + Privacy Policy / Terms & Conditions
--
--   1. checkout_requests  — required tenant checkout form
--        (date + time + feedback) sent to the owner for approval.
--   2. former_tenants     — owner-only archive of past tenants
--        (name, address, phone, family contact, feedback).
--   3. decide_checkout()  — owner approves -> warning -> ALL personal
--        documents + tenant data are archived then permanently deleted.
--   4. profiles.terms_accepted_at + app_settings seeds — tenants must
--        accept the Terms & Conditions before entering the app
--        (optional gate, ON by default; owner can switch it off).
--   5. Owner storage DELETE policy so uploaded documents can be purged.
--
-- Run this in Supabase SQL Editor AFTER 009.
-- Safe to re-run.
-- ============================================================

-- ============================================================
-- 1. CHECKOUT REQUESTS (tenant form -> owner approval)
-- ============================================================
DO $$ BEGIN CREATE TYPE checkout_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS checkout_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- SET NULL (not CASCADE): the row must survive the tenant purge so the
  -- owner keeps a record of what was approved and when.
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenant_name     TEXT NOT NULL,          -- snapshot, survives deletion
  room_label      TEXT,
  bed_label       TEXT,
  check_out_date  DATE NOT NULL,
  check_out_time  TEXT NOT NULL,
  feedback        TEXT NOT NULL,
  status          checkout_status NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  reviewer_id     UUID REFERENCES profiles(id),
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_checkout_requests_updated_at ON checkout_requests;
CREATE TRIGGER trg_checkout_requests_updated_at
  BEFORE UPDATE ON checkout_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Only one open request per tenant at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_pending
  ON checkout_requests(tenant_id)
  WHERE status = 'pending' AND tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkout_property ON checkout_requests(property_id, status);
CREATE INDEX IF NOT EXISTS idx_checkout_created ON checkout_requests(created_at DESC);

ALTER TABLE checkout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_submits_checkout" ON checkout_requests;
CREATE POLICY "tenant_submits_checkout" ON checkout_requests
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = my_tenant_id());

DROP POLICY IF EXISTS "tenant_reads_own_checkout" ON checkout_requests;
CREATE POLICY "tenant_reads_own_checkout" ON checkout_requests
  FOR SELECT TO authenticated
  USING (tenant_id = my_tenant_id());

DROP POLICY IF EXISTS "owner_manages_checkout" ON checkout_requests;
CREATE POLICY "owner_manages_checkout" ON checkout_requests
  FOR ALL TO authenticated
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()))
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "warden_reads_checkout" ON checkout_requests;
CREATE POLICY "warden_reads_checkout" ON checkout_requests
  FOR SELECT TO authenticated
  USING (property_id IN (SELECT warden_property_ids()));


-- ============================================================
-- 2. FORMER TENANTS ARCHIVE (owner only)
-- ============================================================
CREATE TABLE IF NOT EXISTS former_tenants (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id          UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source_tenant_id     UUID,                 -- no FK: tenants row is deleted
  full_name            TEXT NOT NULL,
  phone                TEXT,
  emergency_phone      TEXT,
  email                TEXT,
  permanent_address    TEXT,
  current_address      TEXT,
  family_contact_name  TEXT,
  family_contact_phone TEXT,
  family_relation      TEXT,
  category             TEXT,
  room_no              TEXT,
  bed_label            TEXT,
  check_in_date        DATE,
  check_out_date       DATE,
  check_out_time       TEXT,
  feedback             TEXT NOT NULL,
  archived_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_by          UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_former_tenants_property ON former_tenants(property_id, archived_at DESC);

ALTER TABLE former_tenants ENABLE ROW LEVEL SECURITY;

-- Owner-only read. No INSERT/UPDATE/DELETE policy on purpose: only the
-- SECURITY DEFINER routine (table owner) may write the archive.
DROP POLICY IF EXISTS "owner_reads_former_tenants" ON former_tenants;
CREATE POLICY "owner_reads_former_tenants" ON former_tenants
  FOR SELECT TO authenticated
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));


-- ============================================================
-- 3. TERMS ACCEPTANCE (login gate) + SETTINGS SEEDS
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Terms & Conditions text (tenant-visible, owner authored)
INSERT INTO app_settings (key, value)
VALUES ('terms_conditions', 'AVTAR Singh PG - Terms & Conditions (v1.0)

These terms apply to every tenant staying at AVTAR Singh PG. By accepting them you agree to the following:

1. REGISTRATION - Every tenant must complete one-time registration with valid ID proof and contact details before move-in. Details must be kept up to date.

2. RENT & PAYMENTS - Rent is due on the due day shown in the app each month. Late payment may attract a fine. Payments are recorded in the app; ask the office for a receipt.

3. DEPOSIT - A security deposit is collected at move-in and adjusted against damages, unpaid dues or missing items at checkout.

4. CONDUCT - No loud music after 10 PM, no smoking or alcohol inside rooms, and no guests overnight without prior permission from the warden.

5. ROOM & BED - The allotted room and bed may not be changed or shared without written approval from the owner.

6. DOCUMENTS - KYC documents uploaded in the app are used only for verification. They are deleted when your tenancy is completed at checkout.

7. CHECKOUT - Checkout requires submitting a request in the app with date, time and feedback. On owner approval all your personal documents and records are permanently deleted from the app and archived as a former tenant.

8. LIABILITY - The management is not responsible for loss of personal valuables. Use the provided lockers and inform the warden of any security concern.

9. TERMINATION - The owner may ask a tenant to vacate for rule violations, with reasonable notice.

10. CHANGES - The owner may update these terms; you will be asked to accept the updated version at your next login.

Contact: avtar.singh@avtarpg.com - Gurgaon, Haryana.')
ON CONFLICT (key) DO NOTHING;

-- Login gate switch (true = tenants must accept before entering)
INSERT INTO app_settings (key, value)
VALUES ('terms_gate_enabled', 'true')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- 4. OWNER STORAGE PURGE POLICY
-- Lets the owner delete a checked-out tenant's uploaded documents
-- (tenant_docs + complaint_photos). Wardens keep read-only access.
-- ============================================================
DROP POLICY IF EXISTS "owner_purge_tenant_docs" ON storage.objects;
CREATE POLICY "owner_purge_tenant_docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('tenant_docs', 'complaint_photos')
    AND is_owner()
  );


-- ============================================================
-- 5. RPC: tenant submits the checkout form (all fields required)
-- ============================================================
CREATE OR REPLACE FUNCTION submit_checkout_request(
  p_check_out_date DATE,
  p_check_out_time TEXT,
  p_feedback TEXT
) RETURNS UUID AS $$
DECLARE
  v_tenant    tenants%ROWTYPE;
  v_room_no   TEXT;
  v_bed_label TEXT;
  v_request_id UUID;
BEGIN
  IF p_check_out_date IS NULL THEN
    RAISE EXCEPTION 'Checkout date is required.';
  END IF;
  IF p_check_out_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Checkout date cannot be in the past.';
  END IF;
  IF p_check_out_time IS NULL OR btrim(p_check_out_time) = '' THEN
    RAISE EXCEPTION 'Checkout time is required.';
  END IF;
  IF p_feedback IS NULL OR btrim(p_feedback) = '' THEN
    RAISE EXCEPTION 'Feedback is required.';
  END IF;
  IF length(btrim(p_feedback)) < 10 THEN
    RAISE EXCEPTION 'Please write at least 10 characters of feedback for the owner.';
  END IF;

  SELECT * INTO v_tenant FROM tenants WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active tenant record found for your account.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM checkout_requests
    WHERE tenant_id = v_tenant.id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a checkout request waiting for owner approval.';
  END IF;

  SELECT r.room_no, b.label INTO v_room_no, v_bed_label
  FROM tenancies t
  LEFT JOIN rooms r ON r.id = t.room_id
  LEFT JOIN beds b  ON b.id = t.bed_id
  WHERE t.tenant_id = v_tenant.id AND t.status = 'active'
  LIMIT 1;

  INSERT INTO checkout_requests (
    tenant_id, property_id, tenant_name, room_label, bed_label,
    check_out_date, check_out_time, feedback
  ) VALUES (
    v_tenant.id, v_tenant.property_id, v_tenant.full_name, v_room_no, v_bed_label,
    p_check_out_date, btrim(p_check_out_time), btrim(p_feedback)
  )
  RETURNING id INTO v_request_id;

  -- Tell every owner of this property (realtime badge + notification list)
  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT p.owner_id,
         'checkout',
         'Checkout request',
         v_tenant.full_name || ' wants to check out on ' ||
           to_char(p_check_out_date, 'DD Mon YYYY') || ' at ' || btrim(p_check_out_time) || '.',
         jsonb_build_object('checkout_id', v_request_id)
  FROM properties p
  WHERE p.id = v_tenant.property_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION submit_checkout_request(DATE, TEXT, TEXT) TO authenticated;


-- ============================================================
-- 6. RPC: owner approves (archive + purge) or rejects
--
--    APPROVE = the warning the owner confirms in the app:
--      * archive name / address / phone / family contact / feedback
--        into former_tenants (owner-only, permanent record)
--      * free the bed, close the tenancy
--      * delete invoices, payments, deposits, complaints, requests,
--        presence, alerts, notifications and push tokens
--      * delete the registration (KYC documents + PAN) and tenants row
--      * delete the login (auth.users). If the platform refuses that,
--        fall back to stripping all profile PII and deactivating it.
--    Document FILES in storage are removed by the app right after this
--    call (owner DELETE policy above).
-- ============================================================
CREATE OR REPLACE FUNCTION decide_checkout(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_req         checkout_requests%ROWTYPE;
  v_tenant      tenants%ROWTYPE;
  v_reg         tenant_registrations%ROWTYPE;
  v_user_id     UUID;
  v_tenancy_id  UUID;
  v_email       TEXT;
  v_room_no     TEXT;
  v_bed_label   TEXT;
  v_check_in    DATE;
  v_archive_id  UUID;
BEGIN
  SELECT * INTO v_req FROM checkout_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout request not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM properties WHERE id = v_req.property_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the property owner can decide checkout requests.';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This checkout request has already been decided.';
  END IF;

  -- ---------- REJECT ----------
  IF NOT COALESCE(p_approve, false) THEN
    UPDATE checkout_requests
       SET status = 'rejected',
           decision_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'Rejected by owner'),
           reviewer_id = auth.uid(),
           decided_at = NOW()
     WHERE id = p_request_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT t.user_id,
           'rejection',
           'Checkout request rejected',
           COALESCE('Reason: ' || btrim(p_reason), 'Your checkout request was rejected.'),
           jsonb_build_object('checkout_id', p_request_id)
    FROM tenants t
    WHERE t.id = v_req.tenant_id;

    INSERT INTO audit_events (actor_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), 'REJECT_CHECKOUT', 'checkout_requests', p_request_id,
            jsonb_build_object('tenant_name', v_req.tenant_name, 'reason', p_reason));

    RETURN;
  END IF;

  -- ---------- APPROVE ----------
  SELECT * INTO v_tenant FROM tenants WHERE id = v_req.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The tenant record for this request no longer exists.';
  END IF;

  v_user_id := v_tenant.user_id;

  SELECT * INTO v_reg FROM tenant_registrations WHERE id = v_tenant.registration_id;
  SELECT email INTO v_email FROM profiles WHERE id = v_user_id;

  SELECT t.id, r.room_no, b.label, t.check_in_date
    INTO v_tenancy_id, v_room_no, v_bed_label, v_check_in
  FROM tenancies t
  LEFT JOIN rooms r ON r.id = t.room_id
  LEFT JOIN beds b  ON b.id = t.bed_id
  WHERE t.tenant_id = v_tenant.id AND t.status = 'active'
  LIMIT 1;

  -- 6a. ARCHIVE FIRST (this is what the Former Tenants section shows)
  INSERT INTO former_tenants (
    property_id, source_tenant_id, full_name, phone, emergency_phone, email,
    permanent_address, current_address, family_contact_name, family_contact_phone,
    family_relation, category, room_no, bed_label, check_in_date,
    check_out_date, check_out_time, feedback, archived_by
  ) VALUES (
    v_tenant.property_id, v_tenant.id, v_tenant.full_name, v_tenant.phone,
    v_tenant.emergency_phone, v_email,
    v_reg.permanent_address, v_reg.current_address, v_reg.family_contact_name,
    v_reg.family_contact_phone, v_reg.family_relation,
    v_tenant.category::TEXT,
    COALESCE(v_room_no, v_req.room_label), COALESCE(v_bed_label, v_req.bed_label),
    v_check_in, v_req.check_out_date, v_req.check_out_time, v_req.feedback,
    auth.uid()
  )
  RETURNING id INTO v_archive_id;

  -- 6b. Free the bed (if still allocated)
  IF v_tenancy_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM bed_allocations
       WHERE tenancy_id = v_tenancy_id AND released_at IS NULL
     ) THEN
    PERFORM release_bed_atomic(v_tenancy_id, v_req.check_out_date);
  END IF;

  -- 6c. DELETE every record that references the tenant.
  --     Order matters: dependants first, tenants row last.
  DELETE FROM payment_allocations
    WHERE payment_id IN (SELECT id FROM payments WHERE tenant_id = v_tenant.id);
  DELETE FROM payments              WHERE tenant_id = v_tenant.id;
  DELETE FROM invoices              WHERE tenant_id = v_tenant.id;   -- lines cascade
  DELETE FROM deposit_transactions  WHERE tenant_id = v_tenant.id;
  DELETE FROM complaints            WHERE tenant_id = v_tenant.id;   -- comments cascade
  DELETE FROM complaint_comments    WHERE author_id = v_user_id;
  DELETE FROM tenant_requests       WHERE tenant_id = v_tenant.id;
  DELETE FROM daily_presence        WHERE tenant_id = v_tenant.id;
  DELETE FROM emergency_alerts      WHERE tenant_id = v_tenant.id;
  DELETE FROM notifications         WHERE user_id = v_user_id;
  DELETE FROM push_tokens           WHERE user_id = v_user_id;
  UPDATE audit_events SET actor_id = NULL WHERE actor_id = v_user_id;
  DELETE FROM bed_allocations       WHERE tenancy_id = v_tenancy_id;
  DELETE FROM tenancies             WHERE tenant_id = v_tenant.id;
  DELETE FROM tenants               WHERE id = v_tenant.id;
  DELETE FROM tenant_registrations  WHERE id = v_reg.id;

  -- 6d. Remove the login itself. auth.users may not be deletable from a
  --     SQL function on every project, so fall back to stripping all
  --     personal data from the profile and deactivating the account.
  BEGIN
    DELETE FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE profiles
       SET full_name = NULL,
           phone = NULL,
           avatar_url = NULL,
           terms_accepted_at = NULL,
           is_active = false
     WHERE id = v_user_id;
  END;

  -- 6e. Close the request (tenant_id already NULLed by the cascade above)
  UPDATE checkout_requests
     SET status = 'approved',
         decision_reason = COALESCE(NULLIF(btrim(p_reason), ''),
           'Approved - tenant data and personal documents deleted'),
         reviewer_id = auth.uid(),
         decided_at = NOW(),
         tenant_id = NULL
   WHERE id = p_request_id;

  INSERT INTO audit_events (actor_id, action, table_name, record_id, new_data)
  VALUES (auth.uid(), 'APPROVE_CHECKOUT', 'checkout_requests', p_request_id,
          jsonb_build_object(
            'tenant_name', v_req.tenant_name,
            'archived_id', v_archive_id,
            'check_out_date', v_req.check_out_date,
            'documents_deleted', true
          ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION decide_checkout(UUID, BOOLEAN, TEXT) TO authenticated;

-- Make PostgREST pick up the new functions immediately.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- VERIFY
-- ============================================================
-- SELECT 'checkout_requests' AS t, count(*) FROM checkout_requests
-- UNION ALL SELECT 'former_tenants', count(*) FROM former_tenants
-- UNION ALL SELECT 'terms_accepted', count(*) FROM profiles WHERE terms_accepted_at IS NOT NULL;
--
-- SELECT key, left(value, 40) FROM app_settings
--  WHERE key IN ('terms_conditions', 'terms_gate_enabled');
--
-- \df submit_checkout_request
-- \df decide_checkout
