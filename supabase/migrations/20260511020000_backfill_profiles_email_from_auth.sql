-- ============================================================
-- Migration: 20260511020000_backfill_profiles_email_from_auth.sql
-- Co-Exist 1.8.5, Worker 4 addendum (fork_mp0nb6jr_ba8626).
--
-- Problem: profiles.email is NULL for ~60% of users.
-- auth.users.email is the authoritative email store; profiles.email
-- is a mirror that was never kept in sync post-signup.
--
-- Observed impact: Brisbane Enoggera Hill Reservoir Hike (10 May 2026)
-- had 14/22 attendees with NULL profiles.email. Leader-facing email
-- exports, master-sheet sync, and the impact-stats unification all read
-- from profiles.email and produce broken results.
--
-- This migration:
--   1. Backfills profiles.email from auth.users.email for all rows
--      where profiles.email IS NULL and auth.users.email IS NOT NULL.
--   2. Installs a sync trigger on auth.users (AFTER INSERT OR UPDATE OF
--      email) to keep profiles.email current on every signup / email change.
--
-- Safe to rerun: UPDATE is WHERE email IS NULL, trigger is CREATE OR REPLACE.
-- ============================================================

-- ============================================================
-- 1. Backfill existing NULL rows
-- ============================================================
UPDATE public.profiles p
SET email     = u.email,
    updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;

-- ============================================================
-- 2. Sync function: auth.users -> profiles.email
--    Fires on every INSERT (new signup) and UPDATE OF email
--    (email change / confirmation). SECURITY DEFINER so it can
--    write to profiles from the auth schema trigger context.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_auth_email_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, updated_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        updated_at = NOW()
  WHERE public.profiles.email IS DISTINCT FROM EXCLUDED.email;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_auth_email_to_profile() IS
  'Keeps profiles.email in sync with auth.users.email. '
  'Fires on signup (INSERT) and email change (UPDATE OF email). '
  'ON CONFLICT DO UPDATE with IS DISTINCT FROM guard prevents '
  'no-op writes when email has not actually changed.';

-- ============================================================
-- 3. Trigger: attach to auth.users
-- ============================================================
DROP TRIGGER IF EXISTS sync_auth_email_on_user_change ON auth.users;

CREATE TRIGGER sync_auth_email_on_user_change
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_email_to_profile();

COMMENT ON TRIGGER sync_auth_email_on_user_change ON auth.users IS
  'Mirror auth.users.email -> public.profiles.email on every signup '
  'and email change so leader exports and sheet sync see current emails.';
