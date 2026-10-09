-- ============================================================================
-- Cancelled events are visible to admins only.
--
-- Reported 2026-10-09 (Jess, by phone to Tate): Anthea, a non-admin
-- Melbourne City assist_leader, could still see the cancelled
-- "Organ Pipes Nature Hike" (76d00148-124b-41d9-b626-47edfc9528ff).
--
-- Root cause: neither SELECT policy on events looked at status.
--   events_select_public      (authenticated): is_public OR collective member OR admin/staff
--   events_select_public_anon (anon):          is_public
-- so every signed-in user, and anyone logged out, could read every cancelled
-- public event. Most feeds filter status client-side, but not all of them
-- (the leader dashboard mini-calendar has no status filter), and a client
-- filter is not an authorisation boundary.
--
-- Fix: cancelled rows are readable only through is_admin_or_staff
-- (profiles.role national_leader / manager / admin). Everything else is
-- unchanged, including draft visibility.
--
-- Consequences, all intended:
--   * /event/:id (public) and /events/:id for a cancelled event read as
--     "Event not found" for non-admins instead of the cancelled banner.
--   * Policies on child tables that test EXISTS (SELECT 1 FROM events ...)
--     now fail for a cancelled event unless the caller is admin/staff, so a
--     collective leader loses roster/walk-in/impact access on events that
--     were cancelled. A member's OWN registration/ticket rows stay readable
--     through their own user_id arm.
--   * SECURITY DEFINER functions and service-role edge functions
--     (cancel-event, public-event-check-in, self-service-ticket) are
--     unaffected.
-- ============================================================================

ALTER POLICY events_select_public ON public.events
  USING (
    is_admin_or_staff(auth.uid())
    OR (
      status <> 'cancelled'::event_status
      AND (is_public = true OR is_collective_member(auth.uid(), collective_id))
    )
  );

ALTER POLICY events_select_public_anon ON public.events
  USING (
    is_public = true
    AND status <> 'cancelled'::event_status
  );
