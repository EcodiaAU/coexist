-- ============================================================
-- Migration: 009_fix_collective_members_recursion.sql
-- Fix: infinite recursion (42P17) in collective_members RLS
--
-- The "collective_members_select_fellow_members" policy from 008
-- uses a sub-SELECT on collective_members itself, which re-triggers
-- the same RLS policies → infinite loop.
--
-- Solution: wrap the fellow-member check in a SECURITY DEFINER
-- function so it bypasses RLS, matching the pattern already used
-- by is_collective_member / is_collective_leader_or_above.
-- ============================================================

-- 1. Create a SECURITY DEFINER helper that checks whether the
--    caller shares a collective with the target row.
CREATE OR REPLACE FUNCTION is_fellow_collective_member(
  caller_uid uuid,
  target_collective_id uuid
)
RETURNS boolean AS $$
  -- guard: this definer takes a uid, so a bare body answers role questions
  -- about third parties to anon. See 20260826090000.
  SELECT CASE
    WHEN caller_uid IS NULL THEN false
    WHEN caller_uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM collective_members
      WHERE collective_id = target_collective_id
        AND user_id = caller_uid
        AND status = 'active'
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 2. Drop the recursive policy
DROP POLICY IF EXISTS "collective_members_select_fellow_members" ON collective_members;

-- 3. Re-create it using the SECURITY DEFINER function
CREATE POLICY "collective_members_select_fellow_members"
  ON collective_members FOR SELECT TO authenticated
  USING (
    is_fellow_collective_member(auth.uid(), collective_id)
  );

-- ============================================================
-- 4. Admin RPC: list users with email from auth.users
--
-- profiles has no email column (it lives in auth.users).
-- The admin users page needs email for display + search.
-- This SECURITY DEFINER function joins the two tables.
-- Only staff/admin can call it (enforced inside the function).
-- ============================================================

CREATE OR REPLACE FUNCTION admin_list_users(
  search_term text DEFAULT '',
  role_filter text DEFAULT 'all',
  result_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  display_name text,
  email text,
  avatar_url text,
  role user_role,
  is_suspended boolean,
  created_at timestamptz
) AS $$
BEGIN
  -- Guard: only staff+ can call this
  IF NOT is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    u.email::text,
    p.avatar_url,
    p.role,
    p.is_suspended,
    p.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE
    (search_term = '' OR (
      p.display_name ILIKE '%' || search_term || '%'
      OR u.email ILIKE '%' || search_term || '%'
    ))
    AND (role_filter = 'all' OR p.role::text = role_filter)
  ORDER BY p.created_at DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
