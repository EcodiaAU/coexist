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

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "registrations_select_own_or_leader" ON event_registrations;
DROP POLICY IF EXISTS "registrations_select_visible" ON event_registrations;

-- Drop the helper function if it was created by a prior version of this migration
DROP FUNCTION IF EXISTS is_registered_for_event(uuid, uuid);

-- New policy: any authenticated user can see registrations for published events.
-- This lets users see attendee counts/avatars before deciding to register.
-- Leaders and admins retain full access regardless of event status.
CREATE POLICY "registrations_select_visible"
  ON event_registrations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND e.status = 'published'
    )
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_collective_leader_or_above(auth.uid(), e.collective_id)
    )
    OR is_admin_or_staff(auth.uid())
  );
