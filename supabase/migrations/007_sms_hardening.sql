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
