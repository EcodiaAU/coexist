-- ============================================================
-- Migration: 20260509300000_admin_rls_audit.sql
-- 1.8.5 polish item 7, fork_moy0xmrx_158384 (Co-Exist 1.8.5).
--
-- Tate verbatim 16:44 AEST 9 May 2026:
--   "right now some collective assistant leaders maybe and definitely
--    leaders can see some admin pages so I think the permissions and
--    sidebar need to be redone so that leaders can't see or access
--    admin pages."
--
-- Three-surface fix: sidebar (FE), route guard (FE), RLS (this file).
--
-- This migration introduces is_admin_tier(uid) - a strict role check
-- that resolves true ONLY for global role 'manager' or 'admin'. The
-- existing is_admin_or_staff(uid) helper (which also matches
-- national_leader) stays UNCHANGED because it is used in many
-- non-admin-page contexts (chat moderation, message reactions,
-- referrals, surveys) where leader-tier access is still correct.
--
-- We then re-affirm the RLS policies + RPCs that gate admin-tier-only
-- writes. Where a policy was already manager+admin (e.g. charity_settings,
-- system_email_overrides admin manage), no change is needed. We tighten:
--   - admin_list_users RPC: was national_leader+manager+admin -> now manager+admin
--   - applications.applications_admin_*: was national_leader+admin -> now manager+admin
--   - notification_recipients: same
--   - timeline_rules manage: same
--
-- Defence-in-depth alongside FE changes:
--   - src/lib/capabilities.ts ROLE_DEFAULT_CAPS.leader = []
--   - src/App.tsx /admin route uses RequireRole minRole="manager"
--   - src/components/unified-sidebar.tsx admin sidebar gated by isAdminTier
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. New helper: is_admin_tier(uid)
--    True iff profiles.role IN ('manager', 'admin').
--    Distinct from is_admin_or_staff which also matches national_leader.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin_tier(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role IN ('manager', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_admin_tier(uuid) IS
  'Admin-tier check: profiles.role IN (manager, admin). Use for admin-page-only writes. '
  'Distinct from is_admin_or_staff which also matches national_leader.';

-- ---------------------------------------------------------------------------
-- 2. Re-affirm admin_list_users RPC restricted to admin tier only.
--    Was: national_leader, manager, admin (per migration 078).
--    Now: manager, admin only - consistent with FE /admin/users page being
--    manager+admin-only post-1.8.5 item 7.
--
-- DROP required because the return type changed from the 20260413080001 version
-- (8 cols including last_sign_in_at + collective_count) to this 7-col version
-- (adds is_suspended, removes last_sign_in_at + collective_count).
-- PostgreSQL does not allow CREATE OR REPLACE when the RETURNS TABLE signature
-- changes; DROP + CREATE is the correct pattern (same as migration 20260413080001).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_list_users(text, text, integer, integer);
CREATE OR REPLACE FUNCTION admin_list_users(
  search_term  text DEFAULT '',
  role_filter  text DEFAULT 'all',
  result_limit integer DEFAULT 30,
  offset_val   integer DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  display_name   text,
  avatar_url     text,
  role           text,
  email          text,
  is_suspended   boolean,
  created_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_tier(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.role::text,
    u.email::text,
    p.is_suspended,
    p.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE
    (role_filter = 'all' OR p.role::text = role_filter)
    AND (
      search_term = ''
      OR p.display_name ILIKE '%' || search_term || '%'
      OR u.email ILIKE '%' || search_term || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT result_limit
  OFFSET offset_val;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tighten admin-tier-only RLS policies.
--    These policies gate WRITES to tables surfaced exclusively on /admin.
--    Reads stay broader where appropriate (some policies retained read access
--    for staff to support non-admin contexts).
-- ---------------------------------------------------------------------------

-- ---- collective_applications: admin-page only writes ----
DROP POLICY IF EXISTS "Staff can view applications" ON public.collective_applications;
CREATE POLICY "Staff can view applications"
  ON public.collective_applications FOR SELECT
  TO authenticated
  USING (is_admin_tier(auth.uid()));

DROP POLICY IF EXISTS "Staff can update applications" ON public.collective_applications;
CREATE POLICY "Staff can update applications"
  ON public.collective_applications FOR UPDATE
  TO authenticated
  USING (is_admin_tier(auth.uid()));

-- ---- notification_recipients: admin-page only ----
DROP POLICY IF EXISTS "Staff can manage notification recipients" ON public.notification_recipients;
CREATE POLICY "Staff can manage notification recipients"
  ON public.notification_recipients FOR ALL
  TO authenticated
  USING (is_admin_tier(auth.uid()));

-- ---- timeline_rules: tighten manage to admin-tier only.
--      Read stays broader (leaders need to see timeline rules to operate
--      their collective; only management is admin-tier).
DROP POLICY IF EXISTS "Admins can manage timeline rules" ON public.timeline_rules;
CREATE POLICY "Admins can manage timeline rules"
  ON timeline_rules FOR ALL
  USING (is_admin_tier(auth.uid()));
-- (read policy "Staff can read timeline rules" intentionally unchanged - leaders
-- and collective leaders still need read for their day-to-day operations.)

-- ---------------------------------------------------------------------------
-- 4. Audit notes (no DDL; surfaces tracked here for future tightening passes).
--    The following admin-page surfaces ALREADY use manager+admin checks:
--      - charity_settings (mig 076 - already manager+admin)
--      - membership_rewards manage (mig 076 - already manager+admin)
--      - memberships select (mig 076 - already manager+admin)
--      - leader_todos admin select (mig 076 - already manager+admin)
--      - storage.objects updates bucket admin write (mig 076 - already manager+admin)
--      - system_email_overrides admin manage (mig 076 - already manager+admin)
--    These remain untouched as their existing policies match the new doctrine.
--
--    The following intentionally stay on is_admin_or_staff (broader staff tier)
--    because they are NOT admin-page surfaces and leaders need access:
--      - chat reactions, message moderation, chat channels (legitimate leader scope)
--      - audit log inserts (everywhere - logging metadata)
--      - referrals (admin views aggregate; leaders see own)
--      - surveys (admin manages, leaders consume)
--      - event_registrations visibility (leaders see their own collective's)
-- ---------------------------------------------------------------------------
