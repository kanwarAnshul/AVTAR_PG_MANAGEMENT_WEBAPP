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
