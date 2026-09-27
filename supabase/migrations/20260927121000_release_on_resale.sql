-- Release on resale (2026-09-27).
--
-- Inside the refund cutoff (default 7 days before the event) a member who can
-- no longer come could only contact an organiser. Now they can RELEASE the
-- ticket: it goes back on sale (the waitlist-notify sweep offers the freed seat
-- automatically), and they are refunded in full once someone else buys a paid
-- ticket to that event. If nobody buys before the event starts, no refund.
-- Before the cutoff the existing self-refund path is unchanged.
--
-- Everything here is gated by the SAME per-event flag as self-refund,
-- events.self_service_refund_enabled (default false), so nothing is
-- member-facing until an organiser turns it on for an event.
--
-- THE LEDGER. Three columns on event_tickets:
--   released_at          when the holder released it (NULL for a $0 ticket,
--                        which is simply cancelled: there is nothing to refund).
--   resold_by_ticket_id  the paid buyer ticket this release was paired with.
--                        Stamped by claim_resale_refunds(), FIFO by released_at.
--   resale_refunded_at   when Stripe accepted the refund. The charge.refunded
--                        webhook then flips status to 'refunded' and emails the
--                        member (_shared/ticket-refund-notify.ts), exactly as for
--                        every other refund path.
--
-- DELIBERATE CHOICES, stated so the next reader does not re-derive them:
--   * "Event not yet ended" is evaluated as "the buyer bought BEFORE the event
--     started" (buyer.created_at < events.date_start), not as now() < start.
--     That way a Stripe failure retried after the event still pays out a refund
--     that was earned before it. The scan is bounded to events that started in
--     the last 60 days.
--   * A buyer pairs only if buyer.quantity >= release.quantity, so a one-seat
--     purchase can never refund a multi-seat release. Every row is quantity 1
--     as of 2026-09-27 (probed: 0 of 273 rows have quantity > 1).
--   * Pairing is event-wide, not per ticket type, and it does not ask whether
--     the event was sold out. That is the product rule as specified: "refunded
--     once someone else buys a paid ticket to that event".
--   * A stamp that never reached Stripe (the process died between the stamp and
--     the refund call) is re-offered after 15 minutes. A re-offer cannot become
--     a second refund: the edge sweep refunds the whole intent, Stripe never
--     refunds more than was charged, and "already refunded" is read as success
--     (see _shared/resale-refunds.ts for why there is no idempotency key).
--
-- NOT HANDLED HERE: cancel-event refunds only LIVE ticket statuses, so a
-- released (status cancelled) ticket on an event that is later cancelled is
-- not refunded by that path. Excluded from pairing below; see cancel-event.

ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS resold_by_ticket_id uuid REFERENCES public.event_tickets(id),
  ADD COLUMN IF NOT EXISTS resale_refunded_at timestamptz;

-- ON DELETE SET NULL, stated explicitly: profiles cascade-delete their tickets,
-- so a bare REFERENCES would make a buyer's account deletion fail the moment
-- their ticket had paid for someone else's refund.
ALTER TABLE public.event_tickets
  DROP CONSTRAINT IF EXISTS event_tickets_resold_by_ticket_id_fkey,
  ADD CONSTRAINT event_tickets_resold_by_ticket_id_fkey
    FOREIGN KEY (resold_by_ticket_id) REFERENCES public.event_tickets(id) ON DELETE SET NULL;

-- The sweep reads pending releases every 5 minutes. Partial, so it stays tiny.
CREATE INDEX IF NOT EXISTS idx_event_tickets_pending_release
  ON public.event_tickets (event_id, released_at)
  WHERE released_at IS NOT NULL AND resale_refunded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_tickets_resold_by
  ON public.event_tickets (resold_by_ticket_id)
  WHERE resold_by_ticket_id IS NOT NULL;

/* ------------------------------------------------------------------ */
/*  get_my_ticket_self_service: + can_release, released_at             */
/*  Rebuilt from the LIVE definition (pg_get_functiondef, 2026-09-27). */
/*  Every existing key and behaviour is unchanged.                     */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.get_my_ticket_self_service(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket public.event_tickets;
  v_event  public.events;
  v_cutoff timestamptz;
  v_can_refund boolean := false;
  v_can_transfer boolean := false;
  v_can_release boolean := false;
  v_reason text := null;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_ticket FROM event_tickets
  WHERE id = p_ticket_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_ticket.event_id;

  v_cutoff := v_event.date_start
            - make_interval(hours => COALESCE(v_event.self_service_refund_cutoff_hours, 168));

  IF v_ticket.status = 'checked_in' THEN
    v_reason := 'checked_in';
  ELSIF v_ticket.status <> 'confirmed' THEN
    v_reason := 'not_confirmed';
  ELSIF v_event.status = 'cancelled' THEN
    v_reason := 'event_cancelled';
  ELSIF v_event.date_start <= now() THEN
    v_reason := 'event_started';
  ELSE
    v_can_refund   := COALESCE(v_event.self_service_refund_enabled, false) AND now() < v_cutoff;
    v_can_transfer := COALESCE(v_event.self_service_transfer_enabled, false);
    IF NOT v_can_refund AND COALESCE(v_event.self_service_refund_enabled, false) AND now() >= v_cutoff THEN
      v_reason := 'past_refund_cutoff';
      -- Release on resale: exactly the case that used to be a dead end.
      v_can_release := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'ticket_id', v_ticket.id,
    'status', v_ticket.status,
    'price_cents', v_ticket.price_cents,
    'is_paid', (v_ticket.price_cents > 0 AND v_ticket.stripe_payment_intent_id IS NOT NULL),
    'hold_expires_at', v_ticket.hold_expires_at,
    'can_refund', v_can_refund,
    'can_transfer', v_can_transfer,
    'can_release', v_can_release,
    'released_at', v_ticket.released_at,
    'resale_refunded_at', v_ticket.resale_refunded_at,
    'refund_cutoff_at', v_cutoff,
    'refund_enabled_for_event', COALESCE(v_event.self_service_refund_enabled, false),
    'transfer_enabled_for_event', COALESCE(v_event.self_service_transfer_enabled, false),
    'blocked_reason', v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_ticket_self_service(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_ticket_self_service(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_ticket_self_service(uuid) TO authenticated;

/* ------------------------------------------------------------------ */
/*  release_my_ticket: the holder releases their own ticket            */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.release_my_ticket(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket  public.event_tickets;
  v_event   public.events;
  v_cutoff  timestamptz;
  v_is_paid boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock first, then decide, so two taps cannot both pass the status check.
  SELECT * INTO v_ticket FROM event_tickets
  WHERE id = p_ticket_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_ticket.event_id;
  v_cutoff := v_event.date_start
            - make_interval(hours => COALESCE(v_event.self_service_refund_cutoff_hours, 168));

  -- The same eligibility get_my_ticket_self_service reports as can_release.
  IF v_ticket.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed ticket can be released (this one is %)', v_ticket.status;
  END IF;
  IF NOT COALESCE(v_event.self_service_refund_enabled, false) THEN
    RAISE EXCEPTION 'Releasing a ticket is not available for this event';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'This event was cancelled';
  END IF;
  IF v_event.date_start <= now() THEN
    RAISE EXCEPTION 'This event has already started';
  END IF;
  IF now() < v_cutoff THEN
    -- Outside the cutoff the member refunds directly; release is the
    -- inside-the-cutoff path only.
    RAISE EXCEPTION 'You can still refund this ticket directly';
  END IF;

  v_is_paid := COALESCE(v_ticket.price_cents, 0) > 0 AND v_ticket.stripe_payment_intent_id IS NOT NULL;

  -- Status change is what frees the seat (event_spots_taken counts only
  -- confirmed/checked_in/reserved) and what trg_reconcile_event_ticket_state
  -- reacts to (registration cancelled, campout chat membership removed).
  -- A $0 ticket is simply cancelled: there is no resale refund to wait for.
  UPDATE event_tickets
  SET status = 'cancelled',
      released_at = CASE WHEN v_is_paid THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = v_ticket.id;

  -- A released ticket can no longer be claimed; withdraw any live offer so the
  -- recipient's link says so instead of failing on an odd error.
  UPDATE event_ticket_transfers
  SET status = 'cancelled'
  WHERE ticket_id = v_ticket.id AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'ticket_id', v_ticket.id,
    'event_id', v_ticket.event_id,
    'action', CASE WHEN v_is_paid THEN 'released' ELSE 'cancelled' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.release_my_ticket(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_my_ticket(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_my_ticket(uuid) TO authenticated;

/* ------------------------------------------------------------------ */
/*  claim_resale_refunds: pair releases with later paid buyers         */
/*  Service role only. Called by the waitlist-notify sweep.            */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.claim_resale_refunds(p_event_id uuid DEFAULT NULL)
 RETURNS TABLE (
   ticket_id uuid,
   stripe_payment_intent_id text,
   event_id uuid,
   user_id uuid,
   resold_by_ticket_id uuid,
   is_retry boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_ev    uuid;
  v_rel   record;
  v_buyer uuid;
BEGIN
  FOR v_ev IN
    SELECT DISTINCT r.event_id
    FROM event_tickets r
    JOIN events e ON e.id = r.event_id
    WHERE r.released_at IS NOT NULL
      AND r.resale_refunded_at IS NULL
      AND r.status = 'cancelled'
      AND (p_event_id IS NULL OR r.event_id = p_event_id)
      AND e.date_start > now() - interval '60 days'
    ORDER BY 1
  LOOP
    -- One pairing pass per event at a time. Two concurrent sweeps (the cron and
    -- a manual fire) serialise here instead of pairing one buyer twice.
    PERFORM pg_advisory_xact_lock(hashtext('claim_resale_refunds:' || v_ev::text));

    -- 1. Re-offer stamps that never reached Stripe (process died mid-sweep).
    RETURN QUERY
      UPDATE event_tickets r
      SET updated_at = now()
      WHERE r.event_id = v_ev
        AND r.released_at IS NOT NULL
        AND r.resold_by_ticket_id IS NOT NULL
        AND r.resale_refunded_at IS NULL
        AND r.status = 'cancelled'
        AND r.updated_at < now() - interval '15 minutes'
      RETURNING r.id, r.stripe_payment_intent_id, r.event_id, r.user_id, r.resold_by_ticket_id, true;

    -- 2. Pair new releases, oldest release first, each with the oldest eligible
    --    buyer not already used by another release.
    FOR v_rel IN
      SELECT r.id, r.released_at, r.quantity
      FROM event_tickets r
      JOIN events e ON e.id = r.event_id
      WHERE r.event_id = v_ev
        AND r.released_at IS NOT NULL
        AND r.resold_by_ticket_id IS NULL
        AND r.resale_refunded_at IS NULL
        AND r.status = 'cancelled'
        AND COALESCE(r.price_cents, 0) > 0
        AND r.stripe_payment_intent_id IS NOT NULL
        AND e.status IS DISTINCT FROM 'cancelled'
      ORDER BY r.released_at, r.id
    LOOP
      SELECT b.id INTO v_buyer
      FROM event_tickets b
      JOIN events e ON e.id = b.event_id
      WHERE b.event_id = v_ev
        AND b.id <> v_rel.id
        AND b.status IN ('confirmed', 'checked_in')
        AND COALESCE(b.price_cents, 0) > 0
        AND b.stripe_payment_intent_id IS NOT NULL
        AND b.created_at > v_rel.released_at
        AND b.created_at < e.date_start
        AND b.released_at IS NULL
        AND COALESCE(b.quantity, 1) >= COALESCE(v_rel.quantity, 1)
        AND NOT EXISTS (
          SELECT 1 FROM event_tickets u WHERE u.resold_by_ticket_id = b.id
        )
      ORDER BY b.created_at, b.id
      LIMIT 1;

      IF v_buyer IS NOT NULL THEN
        RETURN QUERY
          UPDATE event_tickets r
          SET resold_by_ticket_id = v_buyer, updated_at = now()
          WHERE r.id = v_rel.id AND r.resold_by_ticket_id IS NULL
          RETURNING r.id, r.stripe_payment_intent_id, r.event_id, r.user_id, r.resold_by_ticket_id, false;
      END IF;
    END LOOP;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_resale_refunds(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_resale_refunds(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_resale_refunds(uuid) TO service_role;
