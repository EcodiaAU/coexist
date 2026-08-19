-- =====================================================================
-- Unify the event "spots filled" count with the ticket capacity gate.
-- =====================================================================
-- Origin: Tate 2026-08-19. The Wild Mountains Sep-4 campout showed
-- "24/25 spots filled" on the event page while it was genuinely SOLD OUT
-- (25/25 tickets) and the buy gate blocked every new purchase. Root cause:
-- event_going_count read ONLY event_registrations (status registered|attended),
-- while the buy gate (reserve_event_ticket) and the availability RPC
-- (get_event_ticket_availability) count event_tickets. On a ticketed event
-- those two ledgers drift whenever a ticket buyer is not in the registered
-- set (e.g. their registration row is still 'waitlisted'), so the capacity
-- bar under-counted by one and read as "1 spot left" on a full event.
--
-- Fix: make the going count ticket-aware. For a ticketed event, "going" is
-- tickets sold, using the SAME predicate as reserve_event_ticket and
-- get_event_ticket_availability (confirmed + checked_in + non-stale pending),
-- so the event page, the "Sold" box, the event-day roster and the buy gate
-- now all report one number. Non-ticketed events are unchanged (registered +
-- attended registrations). This is the single-source unification Tate has
-- asked for repeatedly across the ticketing / event / event-day surfaces:
-- there is exactly one count function and every surface reads through it.
--
-- SECURITY DEFINER + RLS-independent is preserved (counts must stay accurate
-- for non-registrants and profile-hidden members, per the 2026-07-15 privacy
-- migration this replaces the body of).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.event_going_count(p_event_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN (SELECT is_ticketed FROM events WHERE id = p_event_id) IS TRUE THEN
      COALESCE((
        SELECT SUM(quantity)::int
        FROM event_tickets
        WHERE event_id = p_event_id
          AND status IN ('pending','confirmed','checked_in')
          AND (status <> 'pending' OR created_at > now() - interval '15 minutes')
      ), 0)
    ELSE
      (SELECT count(*)::int
       FROM event_registrations
       WHERE event_id = p_event_id AND status IN ('registered','attended'))
  END;
$$;

REVOKE ALL ON FUNCTION public.event_going_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.event_going_count(uuid) TO authenticated, anon;
