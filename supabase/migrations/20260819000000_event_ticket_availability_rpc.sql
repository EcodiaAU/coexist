-- Event ticket availability (RLS-safe remaining count)
--
-- Why: the client computed a ticket type's "X left" by aggregating
-- event_tickets directly (useEventTicketTypes). event_tickets SELECT is
-- RLS-locked to tickets_select_own (user_id = auth.uid()) + admin/staff, so a
-- normal member sees only their own ticket rows. The client sold-count was
-- therefore ~0 for everyone else's purchases, and a genuinely sold-out event
-- rendered "25 left" with an enabled "Get Ticket" CTA. Tapping it then failed
-- server-side (reserve RPC "Sold out" / duplicate guard) and surfaced the
-- scary "Payment could not start" banner.
--
-- Fix: a SECURITY DEFINER aggregate that returns per-ticket-type sold/remaining
-- counts ONLY (no PII / no individual rows), using the SAME sold definition as
-- reserve_event_ticket (confirmed + checked_in + non-stale pending), so the
-- displayed availability matches what the reserve path will actually allow.

CREATE OR REPLACE FUNCTION public.get_event_ticket_availability(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_data) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'ticket_type_id', tt.id,
      'capacity', tt.capacity,
      'sold', COALESCE(s.sold_qty, 0),
      'remaining', CASE WHEN tt.capacity IS NULL THEN NULL
                        ELSE GREATEST(0, tt.capacity - COALESCE(s.sold_qty, 0)) END
    ) AS row_data
    FROM event_ticket_types tt
    LEFT JOIN (
      SELECT ticket_type_id, SUM(quantity) AS sold_qty
      FROM event_tickets
      WHERE event_id = p_event_id
        AND status IN ('pending', 'confirmed', 'checked_in')
        AND (status <> 'pending' OR created_at > now() - INTERVAL '15 minutes')
      GROUP BY ticket_type_id
    ) s ON s.ticket_type_id = tt.id
    WHERE tt.event_id = p_event_id AND tt.is_active = true
  ) sub;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_event_ticket_availability(uuid) TO anon, authenticated;
