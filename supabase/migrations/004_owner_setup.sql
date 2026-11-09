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

