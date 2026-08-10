-- F6 remediation (Engagement): expose a user's points total as a server-side
-- aggregate.
--
-- The points backend is live (award_points -> points_ledger, credited on
-- donations / merch / tickets / check-ins / badges) but had ZERO client surface,
-- so the profile could never show a balance. A client-side SUM over points_ledger
-- would be capped at PostgREST's 1000-row default and undercount a heavy user
-- (the same footgun this cluster fixes for challenge totals), so the total is
-- aggregated server-side here.
--
-- SECURITY DEFINER so the SUM is correct without widening row visibility. The
-- function restricts a caller to their OWN total (or admins/staff), mirroring the
-- existing points_select_own RLS policy: a non-privileged caller asking for
-- someone else's id gets 0, never another user's balance.
--
-- Additive + reversible: CREATE OR REPLACE + GRANT only. No data change, no drop.

CREATE OR REPLACE FUNCTION get_user_points_total(p_user_id uuid DEFAULT auth.uid())
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(SUM(pl.amount), 0)::bigint
  FROM points_ledger pl
  WHERE pl.user_id = p_user_id
    AND (
      p_user_id = auth.uid()
      OR is_admin_or_staff(auth.uid())
    );
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; restrict to signed-in
-- callers (anon has a null auth.uid() and would only ever get 0, but keep the
-- surface tight).
REVOKE EXECUTE ON FUNCTION get_user_points_total(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_user_points_total(uuid) TO authenticated;
