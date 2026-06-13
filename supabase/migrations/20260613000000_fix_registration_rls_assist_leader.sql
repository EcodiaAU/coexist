-- Migration: 20260613000000_fix_registration_rls_assist_leader
--
-- PURPOSE
-- -------
-- Mirrors 20260523000000_fix_walk_in_rls_assist_leader for the
-- event_registrations table, which got missed in the 2026-05-23 sweep.
--
-- ORIGIN
-- ------
-- 2026-06-13: Issy Calderwood (Perth, assist_leader) reports check-in
-- failing for registered attendees on her Port Beach Tree Planting event
-- (2026-06-07). UPDATE returns 0 rows; the frontend throws the toast
-- "Couldn't check this person in. They may have cancelled, or they aren't
-- registered for this event. Use Add Walk-In to record them." Verified
-- live: 30 registered-attended + 23 walk-ins for that event.
--
-- ROOT CAUSE
-- ----------
-- registrations_select_own_or_leader and registrations_update_own_or_leader
-- (defined in 001_initial_schema.sql) both gate the non-self branch through
-- is_collective_leader_or_above(uid, cid) which the doctrine of
-- 20260523000000 explicitly documents as matching ONLY ('leader',
-- 'co_leader'), excluding assist_leader. RLS denies the UPDATE silently
-- (no error, zero rows matched), so the frontend can't distinguish "RLS
-- blocked" from "user has cancelled". The same shape was fixed for
-- event_walk_ins three weeks ago; event_registrations was missed.
--
-- FIX
-- ---
-- Replace both policies with versions that use is_collective_staff(uid, cid)
-- which includes leader, co_leader, AND assist_leader (the helper at
-- migration 014, also used by the walk-in policy fix). The
-- is_admin_or_staff(uid) global-staff branch is preserved verbatim.
-- The own-row branch (user_id = auth.uid()) is preserved verbatim so the
-- self-check-in upsert path continues to work.
--
-- The day-of trigger enforce_event_day_check_in_window (current rev
-- 20260608000000) opens event-day check-ins to anyone unconditionally, and
-- restricts past-event backfill to is_collective_leader_or_above OR
-- is_admin_or_staff. Widening RLS to assist_leader does NOT widen the
-- past-event backfill window (the trigger still excludes them). On the
-- day, RLS was the only thing blocking; this fix unblocks them.
--
-- IMPORTANT: This migration is NOT executed by any build process. Tate /
-- EcodiaOS runs it manually via the Supabase Management API.

-- ============================================================
-- 1. Replace SELECT policy
-- ============================================================

DROP POLICY IF EXISTS "registrations_select_own_or_leader" ON event_registrations;

CREATE POLICY "registrations_select_own_or_leader"
  ON event_registrations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
        AND (
          is_collective_staff(auth.uid(), e.collective_id)
          OR is_admin_or_staff(auth.uid())
        )
    )
    OR is_admin_or_staff(auth.uid())
  );

-- ============================================================
-- 2. Replace UPDATE policy
-- ============================================================

DROP POLICY IF EXISTS "registrations_update_own_or_leader" ON event_registrations;

CREATE POLICY "registrations_update_own_or_leader"
  ON event_registrations FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
        AND (
          is_collective_staff(auth.uid(), e.collective_id)
          OR is_admin_or_staff(auth.uid())
        )
    )
    OR is_admin_or_staff(auth.uid())
  );
