-- A waitlist offer now holds its seat for the 24 hours the email promises.
--
-- waitlist-notify emails the next person in line: "This spot is held for you
-- for the next 24 hours. After that it passes to the next person waiting."
-- Until this migration nothing held it. waitlist_drain_candidates subtracts
-- live offers when it decides WHO to email next, but reserve_event_ticket and
-- get_event_ticket_availability counted ticket rows only, so a walk-up buyer
-- could take the seat out from under the person it had just been promised to.
--
-- Found live 2026-09-25 on "Birding with Cob & Co-Exist Retreat - Wild
-- Mountains" (810cf846): a comp ticket was cancelled at 23:31:56Z, the sweep
-- offered the freed seat to the first person waiting at 23:35:04Z, and the
-- checkout and the app still showed that seat as open to anyone.
--
-- ONE DEFINITION OF A LIVE OFFER, shared with the drain: notified in the last
-- 24 hours, not converted, not removed. That 24 is the same 24 as the drain's
-- grace window and waitlist-notify's OFFER_HOURS. Change all three together.
--
-- THE OFFEREE IS EXEMPT FROM THEIR OWN HOLD, matched on user_id, or on the
-- account's email for a guest who joined by email and is given an account at
-- checkout (guest-ticket-checkout resolves that account before it reserves).
-- After an organiser's "email everyone waiting" blast every notified person is
-- an offeree, so they compete among themselves for the free seats and only
-- walk-up buyers are held back.
--
-- THE HOLD NEVER EXCEEDS WHAT IS FREE. Offers can outnumber free seats (a blast
-- on one open seat), and a hold of 4 against 1 free seat must read as 1 held,
-- not as the event being oversold.
--
-- WHAT THE DISPLAY DOES, and why anonymous viewers are left alone.
-- get_event_ticket_availability subtracts the hold only for a SIGNED-IN viewer
-- who is not the offeree. An anonymous viewer cannot be told apart from a guest
-- offeree opening the link in their email, and hiding the buy button from that
-- person would strand the very buyer the hold exists for. So an anonymous
-- walk-up still sees the seat and is refused at checkout by the gate below,
-- with a message that names the waitlist.
--
-- join_event_waitlist gets the same hold, because it refuses a join while a
-- seat is free. A signed-in walk-up shown "Sold out, join the waitlist" by the
-- availability read would otherwise be refused the join with "Tickets are still
-- available", with no way forward at all.
--
-- Battery: supabase/tests/event-waitlist-offer-hold.sql (rollback-only).

CREATE OR REPLACE FUNCTION public.waitlist_seats_held_from(p_event_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH live_offers AS (
    SELECT w.user_id, lower(w.email) AS email
    FROM public.event_waitlist w
    WHERE w.event_id = p_event_id
      AND w.removed_at IS NULL
      AND w.converted_at IS NULL
      AND w.notified_at IS NOT NULL
      AND w.notified_at > now() - INTERVAL '24 hours'
  ),
  buyer AS (
    SELECT lower(u.email) AS email FROM auth.users u WHERE u.id = p_user_id
  )
  SELECT CASE
    WHEN p_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM live_offers o
      WHERE o.user_id = p_user_id
         OR o.email = (SELECT email FROM buyer)
    ) THEN 0
    ELSE (SELECT COUNT(*)::int FROM live_offers)
  END;
$function$;

COMMENT ON FUNCTION public.waitlist_seats_held_from(uuid, uuid) IS
  'Seats held by live waitlist offers (notified < 24h, not converted, not removed) that p_user_id may NOT take. 0 when p_user_id is itself a live offeree. Uncapped: callers cap it at what is free.';

-- Internal to the gate and the availability read. It reveals whether a given
-- user holds an offer, so nobody outside the definer functions calls it.
REVOKE ALL ON FUNCTION public.waitlist_seats_held_from(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_seats_held_from(uuid, uuid) TO service_role;


-- reserve_event_ticket: the live definition as of 2026-09-25, plus step (d).
-- It runs as the invoker (service_role, from create-checkout and
-- guest-ticket-checkout), which holds EXECUTE on the helper above.
CREATE OR REPLACE FUNCTION public.reserve_event_ticket(p_event_id uuid, p_ticket_type_id uuid, p_user_id uuid, p_quantity integer DEFAULT 1, p_stripe_session_id text DEFAULT NULL::text, p_answers jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket_type event_ticket_types;
  v_sold integer;
  v_ticket_id uuid;
  v_code text;
  v_attempts integer := 0;
  v_held integer;
  v_free integer;
BEGIN
  -- (a) Clean up stale pending tickets for this type (>15 min old).
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE ticket_type_id = p_ticket_type_id
    AND status = 'pending'
    AND created_at < now() - INTERVAL '15 minutes';

  -- (b) Cancel any existing PENDING ticket for this user+event (abandoned
  --     checkout / Retry Checkout). Explicitly scoped to 'pending': a
  --     'reserved' hold is an organiser promise, not an abandoned checkout,
  --     and must survive this sweep.
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE event_id = p_event_id
    AND user_id = p_user_id
    AND status = 'pending';

  SELECT * INTO v_ticket_type
  FROM event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket type not found or inactive';
  END IF;

  IF v_ticket_type.sale_start IS NOT NULL AND now() < v_ticket_type.sale_start THEN
    RAISE EXCEPTION 'Tickets not on sale yet';
  END IF;
  IF v_ticket_type.sale_end IS NOT NULL AND now() > v_ticket_type.sale_end THEN
    RAISE EXCEPTION 'Ticket sales have ended';
  END IF;

  PERFORM public.validate_ticket_answers(p_event_id, p_answers);

  -- (c) Capacity: confirmed + checked_in + reserved + NON-STALE pending.
  --     A reserved hold occupies a seat exactly like a confirmed one.
  IF v_ticket_type.capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_sold
    FROM event_tickets
    WHERE ticket_type_id = p_ticket_type_id
      AND status IN ('pending', 'confirmed', 'checked_in', 'reserved')
      AND (status <> 'pending' OR created_at > now() - INTERVAL '15 minutes');

    IF v_sold + p_quantity > v_ticket_type.capacity THEN
      RAISE EXCEPTION 'Sold out - only % tickets remaining', v_ticket_type.capacity - v_sold;
    END IF;
  END IF;

  -- (d) A live waitlist offer holds its seat against everyone but the person
  --     it was offered to. Event-level, the same unit the drain offers in.
  --     event_free_seats NULL means unbounded, which nothing can hold.
  --     The message keeps "Sold out" so routeReserveError still maps it to 409
  --     and carries the text to the buyer.
  v_held := public.waitlist_seats_held_from(p_event_id, p_user_id);
  IF v_held > 0 THEN
    v_free := public.event_free_seats(p_event_id);
    IF v_free IS NOT NULL AND v_free - LEAST(v_free, v_held) < p_quantity THEN
      RAISE EXCEPTION 'Sold out - this spot is being held for someone on the waitlist. Join the waitlist to be offered the next one.';
    END IF;
  END IF;

  LOOP
    v_code := generate_ticket_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM event_tickets WHERE ticket_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique ticket code';
    END IF;
  END LOOP;

  INSERT INTO event_tickets (
    event_id, ticket_type_id, user_id, status, price_cents, quantity,
    stripe_checkout_session_id, ticket_code, custom_answers
  ) VALUES (
    p_event_id, p_ticket_type_id, p_user_id, 'pending',
    v_ticket_type.price_cents * p_quantity, p_quantity,
    p_stripe_session_id, v_code, COALESCE(p_answers, '{}'::jsonb)
  )
  RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$function$;


-- get_event_ticket_availability: the live definition as of 2026-09-25, plus a
-- hold for a signed-in viewer who is not the offeree. 'remaining' is capped at
-- the event's unheld free seats; 'sold' is untouched, because other readers
-- use it as a count of tickets and a held seat is not a sold one.
CREATE OR REPLACE FUNCTION public.get_event_ticket_availability(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_viewer uuid := auth.uid();
  v_held   integer := 0;
  v_free   integer;
  v_unheld integer;
BEGIN
  IF v_viewer IS NOT NULL THEN
    v_held := public.waitlist_seats_held_from(p_event_id, v_viewer);
    IF v_held > 0 THEN
      v_free := public.event_free_seats(p_event_id);
      IF v_free IS NOT NULL THEN
        v_unheld := v_free - LEAST(v_free, v_held);
      END IF;
    END IF;
  END IF;

  SELECT jsonb_agg(row_data) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'ticket_type_id', tt.id,
      'capacity', tt.capacity,
      'sold', COALESCE(s.sold_qty, 0),
      'remaining', CASE WHEN tt.capacity IS NULL THEN v_unheld
                        ELSE LEAST(
                          GREATEST(0, tt.capacity - COALESCE(s.sold_qty, 0)),
                          COALESCE(v_unheld, GREATEST(0, tt.capacity - COALESCE(s.sold_qty, 0)))
                        ) END
    ) AS row_data
    FROM event_ticket_types tt
    LEFT JOIN (
      SELECT ticket_type_id, SUM(quantity) AS sold_qty
      FROM event_tickets
      WHERE event_id = p_event_id
        AND status IN ('pending', 'confirmed', 'checked_in', 'reserved')
        AND (status <> 'pending' OR created_at > now() - INTERVAL '15 minutes')
      GROUP BY ticket_type_id
    ) s ON s.ticket_type_id = tt.id
    WHERE tt.event_id = p_event_id AND tt.is_active = true
  ) sub;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;


-- join_event_waitlist: the live definition as of 2026-09-25, with the free-seat
-- check made hold-aware (see the comment at the check).
CREATE OR REPLACE FUNCTION public.join_event_waitlist(p_event_id uuid, p_email text, p_name text DEFAULT NULL::text, p_quantity integer DEFAULT 1, p_ticket_type_id uuid DEFAULT NULL::uuid, p_source text DEFAULT 'app'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event    events;
  v_email    text := lower(trim(coalesce(p_email, '')));
  v_free     integer;
  v_user_id  uuid := auth.uid();
  v_existing public.event_waitlist;
  v_id       uuid;
  v_position integer;
  v_already  boolean := false;
BEGIN
  IF position('@' in v_email) < 2 OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 10';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  IF COALESCE(v_event.is_ticketed, false) = false THEN
    -- Free events already auto-waitlist through event_registrations. Sending
    -- them here would create a second, invisible queue for the same event.
    RAISE EXCEPTION 'This event is not ticketed - register for it instead';
  END IF;
  IF v_event.status <> 'published' THEN
    RAISE EXCEPTION 'Event is not open';
  END IF;
  IF COALESCE(v_event.date_end, v_event.date_start) < now() THEN
    RAISE EXCEPTION 'This event has already happened';
  END IF;

  -- Only a genuinely full event takes a waitlist. Otherwise the honest answer
  -- is "there are seats, buy one", and a queue behind an open door is a bug
  -- that reads as a feature.
  --
  --  A seat held by someone else's live offer is not open to this person, so
  --  it does not count as free here. Without this, a signed-in walk-up is told
  --  "Sold out, join the waitlist" by get_event_ticket_availability and then
  --  refused the join with "Tickets are still available": a dead end.
  v_free := public.event_free_seats(p_event_id);
  IF v_free IS NOT NULL AND v_free > 0 THEN
    v_free := v_free - LEAST(v_free, public.waitlist_seats_held_from(p_event_id, v_user_id));
  END IF;
  IF v_free IS NULL OR v_free > 0 THEN
    RAISE EXCEPTION 'Tickets are still available for this event';
  END IF;

  -- Someone holding a live ticket is not waiting for one. Covers the
  -- held-spot invitee who lands on a page that says sold out BECAUSE of them.
  IF EXISTS (
    SELECT 1 FROM event_tickets t
    WHERE t.event_id = p_event_id
      AND t.status IN ('pending', 'confirmed', 'checked_in', 'reserved')
      AND (
        (v_user_id IS NOT NULL AND t.user_id = v_user_id)
        OR t.user_id = public.get_auth_user_id_by_email(v_email)
      )
  ) THEN
    RAISE EXCEPTION 'You already have a ticket for this event';
  END IF;

  SELECT * INTO v_existing
  FROM public.event_waitlist w
  WHERE w.event_id = p_event_id
    AND lower(w.email) = v_email
    AND w.removed_at IS NULL
    AND w.converted_at IS NULL;

  v_already := FOUND;

  IF v_already THEN
    -- Keep their original created_at (their place), refresh the details they
    -- may have corrected, and adopt the account if they have since signed in.
    UPDATE public.event_waitlist
    SET name           = COALESCE(NULLIF(trim(coalesce(p_name, '')), ''), name),
        quantity       = p_quantity,
        ticket_type_id = COALESCE(p_ticket_type_id, ticket_type_id),
        user_id        = COALESCE(user_id, v_user_id)
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.event_waitlist (
      event_id, ticket_type_id, user_id, email, name, quantity, source
    ) VALUES (
      p_event_id,
      p_ticket_type_id,
      v_user_id,
      v_email,
      NULLIF(trim(coalesce(p_name, '')), ''),
      p_quantity,
      CASE WHEN p_source = 'public' THEN 'public' ELSE 'app' END
    )
    RETURNING id INTO v_id;
  END IF;

  SELECT COUNT(*)::int INTO v_position
  FROM public.event_waitlist w
  WHERE w.event_id = p_event_id
    AND w.removed_at IS NULL
    AND w.converted_at IS NULL
    AND w.created_at <= (SELECT created_at FROM public.event_waitlist WHERE id = v_id);

  RETURN jsonb_build_object(
    'id', v_id,
    'position', v_position,
    'already_waiting', v_already
  );
END;
$function$;
