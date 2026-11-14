-- ============================================================
-- AVTAR SINGH PG - SUPABASE SETUP (003 + 004 + 005 + 006)
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
