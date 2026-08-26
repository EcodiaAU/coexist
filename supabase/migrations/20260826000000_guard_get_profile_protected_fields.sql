-- ============================================================================
-- 20260826000000: scope get_profile_protected_fields to self-or-staff
--
-- Origin: 2026-08-20 anon-past-RLS stress test, authenticated-tier residual.
-- Doctrine: backend/patterns/anon-definer-view-is-a-fleet-invariant-2026-08-20.md
--
-- The helper was added in 069 purely to break RLS recursion in the
-- "profiles_update_own_safe" policy, and every caller passes auth.uid().
-- It is SECURITY DEFINER with an `authenticated` EXECUTE grant and no internal
-- guard, so any logged-in member could read ANY user's role and is_suspended,
-- including users they share no collective with. profiles RLS otherwise limits
-- a member to their own row, fellow active collective members, and registrants
-- of collectives they lead. Proven on the live DB 2026-08-26: a participant saw
-- 0 rows selecting an admin's profile under RLS, yet got role='admin' back from
-- this function for the same uid. That discloses exactly which accounts hold
-- admin/manager privilege (6 of 2457) plus per-user moderation state.
--
-- Fix: filter to self-or-staff inside the body. EXECUTE is deliberately NOT
-- revoked from `authenticated`: RLS policy expressions run with the querying
-- user's privileges, so revoking would break every member's profile update with
-- "permission denied for function".
--
-- Returns zero rows rather than RAISE: this function is evaluated inside an RLS
-- WITH CHECK, where an exception is a hard write failure. Self-calls (the only
-- real caller) always match, so the policy is unaffected.
--
-- is_admin_or_staff is SECURITY DEFINER and owned by postgres, which also owns
-- profiles with relforcerowsecurity=false, so it bypasses RLS and cannot recurse
-- back into the profiles policies. The same call already appears in
-- "profiles_select_own_or_admin".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_profile_protected_fields(uid uuid)
RETURNS TABLE(is_suspended boolean, role user_role)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.is_suspended, p.role
  FROM profiles p
  WHERE p.id = uid
    AND (
      uid = auth.uid()
      OR public.is_admin_or_staff(auth.uid())
    )
  LIMIT 1;
$function$;
