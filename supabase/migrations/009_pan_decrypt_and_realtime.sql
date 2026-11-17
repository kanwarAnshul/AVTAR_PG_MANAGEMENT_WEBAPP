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
