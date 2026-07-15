-- =====================================================================
-- "Who's going" privacy: registrants-only + profile_visible, DB-enforced.
-- =====================================================================
-- Origin: Tate 2026-07-15. Members want to see who else is coming to an
-- event, but "name + face + event location + time" is the Adventure/Strava
-- safety exposure. Guardrails: (1) only a fellow registrant of the event can
-- see the going list, (2) honour the existing profile_visible toggle
-- (opted-out members appear in the count only, never by name/face), (3) first
-- name + avatar only, (4) visible-by-default, one tap to hide.
--
-- The boundary is enforced in RLS, NOT just the UI: the prior
-- registrations_select_visible policy exposed every published event's full
-- registration list to ANY authenticated user, so a determined client could
-- read it directly. This tightens that to co-registrants of the same
-- published event, and only rows whose owner is profile-visible.
--
-- Recursion-safe: the policy self-references event_registrations (am I a
-- registrant?) and reads profiles (are they visible?), so both go through
-- SECURITY DEFINER helpers to avoid RLS recursion / a profiles-RLS dependency.
--
-- Counts must stay accurate for everyone (incl. non-registrants and hidden
-- members), so event_going_count is SECURITY DEFINER and RLS-independent.
--
-- Verified 2026-07-15 by role-scoped probe on published event 66faac8c:
--   registrant sees all 34; after a co-attendee opts out, registrant sees 33
--   while going_count stays 34; a non-registrant sees 0.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_registered_for_event(p_user uuid, p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_registrations
    WHERE event_id = p_event AND user_id = p_user
      AND status IN ('registered','attended','waitlisted')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_profile_visible(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (notification_preferences->>'profile_visible')::boolean FROM profiles WHERE id = p_user),
    true);
$$;

CREATE OR REPLACE FUNCTION public.event_going_count(p_event_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM event_registrations
  WHERE event_id = p_event_id AND status IN ('registered','attended');
$$;

REVOKE ALL ON FUNCTION public.event_going_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.event_going_count(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_registered_for_event(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profile_visible(uuid) TO authenticated;

DROP POLICY IF EXISTS registrations_select_visible ON public.event_registrations;
CREATE POLICY registrations_select_visible ON public.event_registrations
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR is_admin_or_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_registrations.event_id
      AND is_collective_leader_or_above(auth.uid(), e.collective_id)
  )
  OR (
    EXISTS (SELECT 1 FROM events e WHERE e.id = event_registrations.event_id AND e.status = 'published')
    AND public.is_registered_for_event(auth.uid(), event_registrations.event_id)
    AND public.is_profile_visible(event_registrations.user_id)
  )
);
