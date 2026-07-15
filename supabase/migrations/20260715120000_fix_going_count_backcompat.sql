-- =====================================================================
-- FIX: the 20260715060000 who's-going RLS tightening broke the "going"
-- count for the shipped 2.0.20 native app (and every non-registrant).
-- =====================================================================
-- Origin: Tate 2026-07-15. Kurt (a participant on the native app) saw "0/25
-- going" on the Myall Park event. Root cause: the 2.0.20 native app - which is
-- LIVE and predates the who's-going feature - counts attendance by selecting
-- event_registrations AS THE USER:
--     event_registrations.select('id', { count: 'exact', head: true })
--                        .in('status', ['registered','attended'])
-- The 20260715060000 migration tightened registrations_select_visible so a
-- non-registrant can no longer see other people's registration rows, so that
-- count collapsed to 0. `event_going_count` (SECURITY DEFINER) returns the true
-- 17, but the old native binary never calls it. A breaking RLS change shipped to
-- prod ahead of the client that depends on the new path = a live regression.
--
-- The count MUST be public. The privacy that actually matters is WHO is going
-- (names + faces), not the bare count or the existence of registration rows. So:
--   1. Restore registrations_select_visible to the pre-tightening shape (any
--      authenticated user may read registrations for a PUBLISHED event), which
--      makes the count work for every client, old and new.
--   2. Move the who's-going NAME privacy (registrant-gated + profile_visible)
--      into a SECURITY DEFINER RPC `event_going_members`, so the going LIST is
--      gated regardless of table RLS. The new app reads the list through this
--      RPC, not a direct table select.
--
-- Net privacy posture: the count is public (as it was before the who's-going
-- feature and as every other event surface already shows it); the going LIST
-- (first name + avatar) is returned only to a fellow registrant and only for
-- profile-visible members - a STRICTER guarantee than the pre-feature state,
-- where any authenticated user could read the raw list. Names still also depend
-- on profiles RLS; the RPC is the canonical, self-contained gate.
-- =====================================================================

-- 1. Revert the SELECT policy to published-visible-to-authenticated.
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
  OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_registrations.event_id
      AND e.status = 'published'
  )
);

-- 2. Registrant-gated, profile_visible-masked who's-going list. Non-registrants
--    (is_registered_for_event false) get zero rows; opted-out members are
--    omitted but still counted by event_going_count. First name + avatar only.
CREATE OR REPLACE FUNCTION public.event_going_members(p_event_id uuid)
RETURNS TABLE (id uuid, first_name text, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.first_name, p.display_name, p.avatar_url
  FROM event_registrations r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.event_id = p_event_id
    AND r.status IN ('registered', 'attended')
    AND public.is_registered_for_event(auth.uid(), p_event_id)
    AND public.is_profile_visible(r.user_id)
  ORDER BY r.registered_at ASC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.event_going_members(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.event_going_members(uuid) TO authenticated;

COMMENT ON FUNCTION public.event_going_members(uuid) IS
  'Who''s-going list for the event-detail sheet: first name + avatar of '
  'registered/attended members, returned only to a fellow registrant and only '
  'for profile-visible members. SECURITY DEFINER so the gate holds regardless '
  'of event_registrations RLS (which is public-count-friendly). Tate 2026-07-15.';
