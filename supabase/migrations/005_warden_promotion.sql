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
