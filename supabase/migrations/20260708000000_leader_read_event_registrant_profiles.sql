-- Migration: 20260708000000_leader_read_event_registrant_profiles
--
-- PURPOSE
-- -------
-- Let a collective's leaders (assist_leader / co_leader / leader) read the
-- profiles of everyone REGISTERED for that collective's events, so the
-- pre-event attendee export (and the event-day roster) actually carries
-- name / email / phone / postcode / dietary for every attendee, not just
-- the ones who happen to also be members of the collective.
--
-- ORIGIN
-- ------
-- 2026-07-08: Angelica (Co-Exist) asked for a self-serve pre-event attendee
-- list WITH dietary requirements, for catering. The export UI shipped
-- (registered-scope, per-attendee dietary). Verified live under the RLS
-- context of Hannah Lyttle (leader of the Brisbane collective, the
-- collective that runs the Wild Mountains Conservation Campout, event
-- 99d2b098-78dd-41c7-8a3a-b7eb94020150): of 24 registered attendees she
-- could read only 13 profiles and only 4 of 7 dietary needs. The 11
-- invisible registrants have no collective_members row at all - they
-- registered for the event without joining the collective.
--
-- ROOT CAUSE
-- ----------
-- profiles SELECT was gated by exactly two policies:
--   * profiles_select_own_or_admin  - self, or global staff
--     (is_admin_or_staff = profiles.role in national_leader/manager/admin)
--   * profiles_select_fellow_member - only profiles of people who share an
--     ACTIVE collective_members row with the viewer
-- A collective leader who is NOT global staff therefore could not read the
-- profile of a registered attendee who never joined the collective. The
-- attendee export and the event-day roster both read profiles via a direct
-- PostgREST embed, so both silently dropped name + dietary for those
-- registrants - defeating the catering use case. A global-staff test
-- account would have masked this (is_admin_or_staff bypasses the fellow
-- gate entirely), so a naive login-and-screenshot passes while a real
-- collective leader sees blanks.
--
-- FIX
-- ---
-- Add ONE additive SELECT policy on profiles, scoped through a new
-- SECURITY DEFINER helper that returns true when the viewer is
-- assist_leader+ (is_collective_staff) of a collective that the target
-- profile is registered to via any event. Additive: OR-combined with the
-- existing policies, it only ever WIDENS a leader's read; it removes no
-- existing restriction and grants nothing to non-leaders. The helper is
-- SECURITY DEFINER so the event_registrations / events lookups inside the
-- policy are not themselves re-filtered by RLS (and cannot recurse into
-- profiles). Matches the existing is_collective_staff / is_admin_or_staff
-- helper pattern from 001_initial_schema.sql and the assist_leader sweeps.
--
-- SCOPE / PRIVACY
-- ---------------
-- This exposes registrant contact + dietary + emergency-contact fields to
-- the leaders of the collective running the event the person registered
-- for - the same leaders who already run check-in and the event-day roster
-- for that event. It does not expose profiles to non-leaders, nor to
-- leaders of unrelated collectives.
--
-- IMPORTANT: This migration is NOT executed by any build process.
-- Tate / EcodiaOS runs it manually via the Supabase Management API. It has
-- been applied to production coexist DB as part of shipping this feature.

-- ============================================================
-- 1. Helper: can this viewer, as a collective leader, see this registrant?
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_event_registrant_of_led_collective(viewer uuid, target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    WHERE er.user_id = target
      AND is_collective_staff(viewer, e.collective_id)
  );
$function$;

-- ============================================================
-- 2. Additive SELECT policy on profiles
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_event_registrant_leader" ON profiles;

CREATE POLICY "profiles_select_event_registrant_leader"
  ON profiles FOR SELECT TO authenticated
  USING (
    is_event_registrant_of_led_collective(auth.uid(), profiles.id)
  );
