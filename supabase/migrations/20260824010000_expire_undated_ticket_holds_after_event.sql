-- Undated organiser holds never expired.
--
-- `reserve_spot_for_user` accepts a NULL `hold_expires_at`, and the organiser
-- sheet (issue-ticket-sheet.tsx) offers exactly that with the copy
-- "Leave blank to hold the spot until the event." The sweep, however, required
-- `hold_expires_at IS NOT NULL`, so a blank date reached a hold that NOTHING
-- swept: not this cron, and not anything else (there is no post-event ticket
-- sweep anywhere in the schema). The seat stayed inside `event_spots_taken`
-- permanently, so a past event kept reporting an occupied, never-paid seat.
--
-- This implements the promise the UI already makes rather than deciding a new
-- one: a blank date means "until the event", so the hold lapses when the event
-- has ENDED. Dated holds keep their existing behaviour exactly.
--
-- Deliberately NOT changed here:
--   * A hold on a CANCELLED event still waits for its date to pass. Cancelling
--     an event is an organiser action with its own path; folding it into the
--     sweep would cancel seats on the strength of a status flip.
--   * The status flip fires `trg_reconcile_event_ticket_state`, exactly as the
--     dated sweep already does, so lapsed holds are reconciled the same way.
CREATE OR REPLACE FUNCTION public.expire_lapsed_ticket_holds()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE event_tickets t
  SET status = 'cancelled', updated_at = now()
  FROM events e
  WHERE e.id = t.event_id
    AND t.status = 'reserved'
    AND (
      -- Dated hold: lapses at its own deadline (unchanged).
      (t.hold_expires_at IS NOT NULL AND t.hold_expires_at < now())
      -- Undated hold: "until the event", so it lapses once the event is over.
      -- COALESCE covers an event with no explicit end.
      OR (t.hold_expires_at IS NULL AND COALESCE(e.date_end, e.date_start) < now())
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
