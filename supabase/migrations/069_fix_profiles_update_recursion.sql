-- ============================================================================
-- 069: Fix infinite recursion in profiles UPDATE RLS policy
--
-- The "profiles_update_own_safe" policy (from 005) has inline subqueries
-- back to `profiles` to check that `is_suspended` and `role` haven't changed.
-- Those subqueries trigger RLS evaluation on `profiles` again → infinite loop.
--
-- Fix: use a SECURITY DEFINER function to read the protected fields,
-- bypassing RLS for the guard check.
-- ============================================================================

-- Helper: read protected fields without triggering RLS
CREATE OR REPLACE FUNCTION get_profile_protected_fields(uid uuid)
RETURNS TABLE(is_suspended boolean, role user_role) AS $$
  SELECT p.is_suspended, p.role
  FROM profiles p
  WHERE p.id = uid
    -- Guard added 2026-08-26: filter (never RAISE) because this runs inside the
    -- profiles_update_own_safe WITH CHECK, where an exception is a hard write
    -- failure. Self-calls, the only real caller, always match.
    AND (uid = auth.uid() OR public.is_admin_or_staff(auth.uid()))
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Replace the recursive policy with one that uses the helper
DROP POLICY IF EXISTS "profiles_update_own_safe" ON profiles;
CREATE POLICY "profiles_update_own_safe"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      is_suspended IS NOT DISTINCT FROM (SELECT pf.is_suspended FROM get_profile_protected_fields(auth.uid()) pf)
      AND role IS NOT DISTINCT FROM (SELECT pf.role FROM get_profile_protected_fields(auth.uid()) pf)
    )
  );
