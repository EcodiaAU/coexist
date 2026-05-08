-- ============================================================================
-- Fix event_registrations SELECT visibility
--
-- Previously, users could only see their own registrations (+ leaders/admins).
-- This meant the attendee list for an event only showed the current user.
--
-- New policy: any authenticated user who is registered for an event can see
-- all other registrations for that same event. This enables attendee lists,
-- carpool coordination, and community features.
--
-- The check uses a SECURITY DEFINER function to avoid infinite recursion
-- (a policy on event_registrations cannot query event_registrations directly).
-- ============================================================================

-- Helper: check if a user is registered for a given event (bypasses RLS)
CREATE OR REPLACE FUNCTION is_registered_for_event(uid uuid, eid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_registrations
    WHERE event_id = eid
      AND user_id = uid
      AND status IN ('registered', 'attended', 'waitlisted')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "registrations_select_own_or_leader" ON event_registrations;

-- New policy: see your own registrations OR registrations for events you're
-- registered for OR you're a collective leader/admin/staff.
CREATE POLICY "registrations_select_visible"
  ON event_registrations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_registered_for_event(auth.uid(), event_id)
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_collective_leader_or_above(auth.uid(), e.collective_id)
    )
    OR is_admin_or_staff(auth.uid())
  );
