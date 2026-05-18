-- Allow leaders / staff to INSERT event_registrations rows for other users.
--
-- The existing `registrations_insert_own` policy is strict
-- (user_id = auth.uid()) so leaders trying to add a walk-in via the
-- new WalkInSheet search-and-check-in path hit 42501 (RLS violation).
--
-- The check-in flows in event-day rely on this insert: the
-- handleAddAndCheckIn callback inserts a row with status='attended'
-- and checked_in_at=now on behalf of an attendee who showed up.
--
-- This adds a second INSERT policy. Multiple INSERT policies stack
-- with OR in Postgres RLS, so the existing self-insert path stays
-- intact while leaders / admins / managers / national_leaders get the
-- new path. Scoped to the event's collective so a leader of one
-- collective can't register people for another.

DROP POLICY IF EXISTS registrations_insert_by_leader ON public.event_registrations;

CREATE POLICY registrations_insert_by_leader
  ON public.event_registrations
  FOR INSERT
  WITH CHECK (
    -- Global staff tier: admin / manager / national_leader can insert
    -- for any event.
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager', 'national_leader')
    )
    -- Or any collective-tier leader (incl. assist) of the event's
    -- collective. Mirrors the gate on search_app_users_for_event
    -- migration 20260518100000.
    OR EXISTS (
      SELECT 1
      FROM public.collective_members cm
      JOIN public.events e ON e.collective_id = cm.collective_id
      WHERE cm.user_id = auth.uid()
        AND e.id = event_registrations.event_id
        AND cm.role IN ('leader', 'co_leader', 'assist_leader')
    )
  );
