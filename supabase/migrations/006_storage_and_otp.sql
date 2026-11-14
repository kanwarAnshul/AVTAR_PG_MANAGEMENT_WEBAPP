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
