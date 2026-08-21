-- =====================================================================
-- Canonical "spots taken" count for an event, single source of truth.
-- =====================================================================
-- Origin: Angelica (Resonaverde x Co-Exist), 5 Aug 2026. The Myall Park
-- campout (event cfbe0ce1) showed "25/30 spots filled" on the event banner
-- while the leader ticket-sales panel showed ~20 sold. Two surfaces, two
-- numbers, same event.
--
-- Root cause: the banner counts the RSVP/attendance layer
-- (event_registrations status in registered/attended, via event_going_count)
-- while the sales panel counts the buying layer (event_tickets status in
-- confirmed/checked_in). For a TICKETED event these are two different
-- populations - someone can RSVP without buying, and every paid/comp/free
-- ticket is a real seat that an RSVP is not - so the two counts essentially
-- never agree. Confirmed with a live probe on cfbe0ce1: registrations going
-- = 25, valid tickets (confirmed + checked_in) = 22.
--
-- Fix: one canonical count. For a ticketed event, a taken spot IS a valid
-- ticket (confirmed or checked_in; pending is an incomplete checkout, cancelled
-- and refunded have vacated the seat). For a non-ticketed community event there
-- are no tickets, so a taken spot is a going registration - the deliberate
-- public count established by 20260715120000_fix_going_count_backcompat.sql.
--
-- SECURITY DEFINER + STABLE, mirroring event_going_count, because event_tickets
-- SELECT is RLS-restricted to own/staff/admin: a regular member viewing a
-- ticketed event cannot aggregate the ticket rows client-side (they would see
-- only their own row and undercount). The count must be readable by everyone
-- who can see the event, exactly as the going count is.
--
-- Note: a taken SPOT (capacity occupancy) is not the same as PAID revenue. A
-- free (price_cents = 0) or full-comp ticket still occupies a seat, so it counts
-- here; whether money was actually taken is a separate question answered against
-- Stripe, never inferred from event_tickets.status.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.event_spots_taken(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_event_id AND e.is_ticketed = true
    )
    THEN COALESCE((
      SELECT SUM(quantity)::int
      FROM event_tickets
      WHERE event_id = p_event_id
        AND status IN ('confirmed', 'checked_in')
    ), 0)
    ELSE (
      SELECT count(*)::int
      FROM event_registrations
      WHERE event_id = p_event_id
        AND status IN ('registered', 'attended')
    )
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.event_spots_taken(uuid) TO anon, authenticated, service_role;
