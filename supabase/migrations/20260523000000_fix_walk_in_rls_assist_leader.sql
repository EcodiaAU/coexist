-- Migration: 20260523000000_fix_walk_in_rls_assist_leader
--
-- PURPOSE
-- -------
-- Fixes event_walk_ins RLS so that assist_leaders, managers, and admins
-- can add/view/update walk-ins. The original policies (20260511010000)
-- used is_collective_leader_or_above() which only matches ('leader',
-- 'co_leader'), excluding assist_leaders. They also lacked any
-- admin/manager/national_leader bypass.
--
-- An assistant leader at a live event was blocked from recording walk-ins
-- because of this gap.
--
-- FIX
-- ---
-- Replace all three walk-in RLS policies with versions that check:
--   - is_collective_staff(uid, cid)  => leader, co_leader, assist_leader
--   - OR is_admin_or_staff(uid)      => national_leader, manager, admin
--
-- search_app_users_for_event was already fixed in 20260518100000.
--
-- IMPORTANT: This migration is NOT executed by any build process.
-- Tate runs it manually.

-- ============================================================
-- 1. Replace SELECT policy
-- ============================================================

DROP POLICY IF EXISTS event_walk_ins_select ON event_walk_ins;

CREATE POLICY event_walk_ins_select
  ON event_walk_ins
  FOR SELECT
  USING (
    is_collective_staff(
      auth.uid(),
      (SELECT collective_id FROM events e WHERE e.id = event_walk_ins.event_id)
    )
    OR is_admin_or_staff(auth.uid())
  );

-- ============================================================
-- 2. Replace INSERT policy
-- ============================================================

DROP POLICY IF EXISTS event_walk_ins_insert_leader ON event_walk_ins;

CREATE POLICY event_walk_ins_insert_leader
  ON event_walk_ins
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_via = 'leader_adhoc'
    AND (
      is_collective_staff(
        auth.uid(),
        (SELECT collective_id FROM events e WHERE e.id = event_walk_ins.event_id)
      )
      OR is_admin_or_staff(auth.uid())
    )
  );

-- ============================================================
-- 3. Replace UPDATE policy
-- ============================================================

DROP POLICY IF EXISTS event_walk_ins_update_leader ON event_walk_ins;

CREATE POLICY event_walk_ins_update_leader
  ON event_walk_ins
  FOR UPDATE
  USING (
    is_collective_staff(
      auth.uid(),
      (SELECT collective_id FROM events e WHERE e.id = event_walk_ins.event_id)
    )
    OR is_admin_or_staff(auth.uid())
  );
