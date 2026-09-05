-- =====================================================================
-- Ticketed-event WAITLIST
-- =====================================================================
-- Origin: Jess (Jessica Ditchfield, Co-Exist community manager), 2026-09-05:
--   "with tickets being sold out does it generate a waitlist?"
--
-- It did not. FREE events have had a full waitlist since the RSVP layer was
-- built (event_registrations.status = 'waitlisted', auto-demotion in
-- handle_event_registration, usePromoteFromWaitlist + the waitlist_promoted
-- email). TICKETED events had none, by explicit design: classifyAttendance in
-- src/lib/event-capacity.ts states "Ticketed events have no RSVP waitlist: the
-- ticket is the only model", and every sold-out surface was a dead end - a
-- disabled ticket-type button in the app, a "Sold out" panel with no action on
-- the public page, a greyed row on the campout date picker.
--
-- Live at the time of writing: Murbpook Outback Campout Retreat (19 Sept 2026)
-- is 15/15 with zero waitlist. Wild Mountains 21/30 and Grampians 16/25 are
-- climbing behind it. Every person who hit that page after Murbpook filled is
-- unrecorded demand.
--
-- WHY A NEW TABLE AND NOT event_registrations (both were probed):
--   1. event_registrations.user_id is NOT NULL. Guest ticket buying is a
--      first-class path for campouts (guest-ticket-checkout), and the public
--      event page has no auth context at all. A waitlist that cannot hold an
--      anonymous email cannot serve the surface that needs it most.
--   2. Joining a waitlist must not mint an account. guest-ticket-checkout
--      creates a shell auth user by design at BUY time; doing that at INTEREST
--      time would put strangers in profiles, membership and collective counts.
--   3. classifyAttendance deliberately hides ticketed waitlisted registrations
--      as roster noise. Overloading that status would resurrect the exact ghost
--      -RSVP class that made Wild Mountains read 28 going against 26 tickets.
--
-- Additive and reversible only: one new table, four new functions, one new
-- index set, no DROP, no data mutation, no policy removal.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ONE definition of "how many seats are actually free"
-- ---------------------------------------------------------------------
-- This repo has already paid for display and gate disagreeing: until
-- 2026-08-25 the public page advertised spots for Wild Mountains while
-- reserve_event_ticket rejected the purchase as sold out. So the waitlist
-- join gate, the drain sweep and the client display all read ONE function,
-- and its arithmetic mirrors reserve_event_ticket's capacity check exactly
-- (confirmed + checked_in + reserved + NON-STALE pending), so a seat someone
-- is mid-checkout on is never offered to the queue.
--
-- Returns NULL when the event is genuinely unbounded (no event capacity and
-- no ticket-type capacity). NULL means "never sold out", not "zero free".
CREATE OR REPLACE FUNCTION public.event_free_seats(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event          events;
  v_event_free     integer;
  v_type_free      integer;
  v_bounded_types  integer;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND OR COALESCE(v_event.is_ticketed, false) = false THEN
    RETURN NULL;
  END IF;

  -- Manually flagged sold out (sold out on Eventbrite while native inventory
  -- still shows spots). Native availability will never reopen on its own, so
  -- this is hard zero: the auto-drain must not fire, and the organiser's
  -- "email everyone waiting" button is the route instead.
  IF COALESCE(v_event.event_extras ->> 'sold_out', 'false') = 'true' THEN
    RETURN 0;
  END IF;

  -- Event-level capacity against the canonical occupancy count.
  IF v_event.capacity IS NOT NULL THEN
    v_event_free := GREATEST(0, v_event.capacity - public.event_spots_taken(p_event_id));
  END IF;

  -- Per-ticket-type capacity, summed over ACTIVE, ON-SALE types only. A type
  -- whose sale window has closed cannot absorb a waitlister, so counting its
  -- headroom would offer a seat that reserve_event_ticket then refuses.
  SELECT
    COUNT(*) FILTER (WHERE tt.capacity IS NOT NULL),
    COALESCE(SUM(
      GREATEST(0, tt.capacity - COALESCE((
        SELECT SUM(t.quantity)
        FROM event_tickets t
        WHERE t.ticket_type_id = tt.id
          AND t.status IN ('pending', 'confirmed', 'checked_in', 'reserved')
          AND (t.status <> 'pending' OR t.created_at > now() - INTERVAL '15 minutes')
      ), 0))
    ) FILTER (WHERE tt.capacity IS NOT NULL), 0)
  INTO v_bounded_types, v_type_free
  FROM event_ticket_types tt
  WHERE tt.event_id = p_event_id
    AND tt.is_active = true
    AND (tt.sale_start IS NULL OR now() >= tt.sale_start)
    AND (tt.sale_end   IS NULL OR now() <= tt.sale_end);

  IF v_bounded_types = 0 THEN
    v_type_free := NULL;
  END IF;

  IF v_event_free IS NULL AND v_type_free IS NULL THEN
    RETURN NULL;  -- unbounded: this event can never be sold out
  END IF;

  RETURN LEAST(COALESCE(v_event_free, v_type_free), COALESCE(v_type_free, v_event_free));
END;
$function$;

COMMENT ON FUNCTION public.event_free_seats(uuid) IS
  'Seats a ticketed event can still sell RIGHT NOW. NULL = unbounded. Mirrors reserve_event_ticket''s inventory definition so display and gate cannot drift.';

GRANT EXECUTE ON FUNCTION public.event_free_seats(uuid) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. The queue
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_waitlist (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- Preference only, never a partition: the queue is per EVENT. All four
  -- upcoming ticketed events carry exactly one active ticket type, and a
  -- per-type queue would strand someone behind a type that never reopens.
  ticket_type_id uuid REFERENCES public.event_ticket_types(id) ON DELETE SET NULL,
  -- NULL for someone who joined from the logged-out public page. Populated
  -- when a signed-in member joins, so the app can show them their own place.
  user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email         text NOT NULL CHECK (position('@' in email) > 1 AND length(email) <= 254),
  name          text,
  quantity      integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
  source        text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'public')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Last time we told them a spot opened. Set, not incremented, so a second
  -- opening re-notifies; notify_count is the audit trail.
  notified_at   timestamptz,
  notify_count  integer NOT NULL DEFAULT 0,
  -- Stamped by the sweep once a live ticket exists for this email on this
  -- event. Gives conversion numbers without a second table.
  converted_at  timestamptz,
  -- Left voluntarily, or removed by an organiser. Never hard-deleted: the
  -- demand signal is the point of the table.
  removed_at    timestamptz,
  removed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.event_waitlist IS
  'Interest queue for SOLD-OUT ticketed events. Members and logged-out guests both land here; joining does NOT mint an account (that happens at buy time in guest-ticket-checkout).';

-- One live place in the queue per person per event. Partial, so someone who
-- left or already converted can rejoin a later reopening.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_waitlist_live_email
  ON public.event_waitlist (event_id, lower(email))
  WHERE removed_at IS NULL AND converted_at IS NULL;

-- The drain reads oldest-first among people still waiting.
CREATE INDEX IF NOT EXISTS idx_event_waitlist_waiting
  ON public.event_waitlist (event_id, created_at)
  WHERE removed_at IS NULL AND converted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_waitlist_user
  ON public.event_waitlist (user_id)
  WHERE removed_at IS NULL;

ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;

-- Reads: your own row, or event staff. Deliberately NOT public - the queue is
-- a list of names and email addresses.
DROP POLICY IF EXISTS waitlist_select_own_or_staff ON public.event_waitlist;
CREATE POLICY waitlist_select_own_or_staff ON public.event_waitlist
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_waitlist.event_id
        AND public.is_collective_staff(auth.uid(), e.collective_id)
    )
  );

-- No direct INSERT policy at all: joining goes through join_event_waitlist,
-- which is SECURITY DEFINER and enforces that the event really is sold out.
-- Without that gate an anon client could stuff the queue on any event.

-- Organisers remove someone; members leave via leave_event_waitlist.
DROP POLICY IF EXISTS waitlist_update_own_or_staff ON public.event_waitlist;
CREATE POLICY waitlist_update_own_or_staff ON public.event_waitlist
  FOR UPDATE USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_waitlist.event_id
        AND public.is_collective_staff(auth.uid(), e.collective_id)
    )
  );


-- ---------------------------------------------------------------------
-- 3. Joining
-- ---------------------------------------------------------------------
-- SECURITY DEFINER and granted to anon so the logged-out public event page
-- can call it, exactly like reserve_event_ticket and
-- get_event_ticket_availability already are.
--
-- Idempotent: a second call with the same email returns the SAME row and the
-- original position. Someone who taps twice does not lose their place, and
-- the client never has to distinguish create from already-joined.
CREATE OR REPLACE FUNCTION public.join_event_waitlist(
  p_event_id       uuid,
  p_email          text,
  p_name           text    DEFAULT NULL,
  p_quantity       integer DEFAULT 1,
  p_ticket_type_id uuid    DEFAULT NULL,
  p_source         text    DEFAULT 'app'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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
  v_free := public.event_free_seats(p_event_id);
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

GRANT EXECUTE ON FUNCTION public.join_event_waitlist(uuid, text, text, integer, uuid, text) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Leaving
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_event_waitlist(
  p_event_id uuid,
  p_email    text DEFAULT NULL
)
 RETURNS boolean
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_hit     integer;
BEGIN
  IF v_user_id IS NULL AND v_email = '' THEN
    RAISE EXCEPTION 'Sign in or pass the email you joined with';
  END IF;

  UPDATE public.event_waitlist w
  SET removed_at = now(),
      removed_by = v_user_id
  WHERE w.event_id = p_event_id
    AND w.removed_at IS NULL
    AND (
      (v_user_id IS NOT NULL AND w.user_id = v_user_id)
      OR (v_email <> '' AND lower(w.email) = v_email
          -- An anonymous caller may only remove an anonymous row. Otherwise
          -- knowing a member's address would be enough to drop their place.
          AND (v_user_id IS NOT NULL OR w.user_id IS NULL))
    );

  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RETURN v_hit > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.leave_event_waitlist(uuid, text) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. What the caller is allowed to know about their own place
-- ---------------------------------------------------------------------
-- Anonymous-safe: takes the email, returns only that person's own standing
-- plus the public sold-out state. Never enumerates the queue.
CREATE OR REPLACE FUNCTION public.my_event_waitlist_state(
  p_event_id uuid,
  p_email    text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_row     public.event_waitlist;
  v_position integer;
BEGIN
  SELECT * INTO v_row
  FROM public.event_waitlist w
  WHERE w.event_id = p_event_id
    AND w.removed_at IS NULL
    AND w.converted_at IS NULL
    AND (
      (v_user_id IS NOT NULL AND w.user_id = v_user_id)
      OR (v_email <> '' AND lower(w.email) = v_email)
    )
  ORDER BY w.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('waiting', false, 'free_seats', public.event_free_seats(p_event_id));
  END IF;

  SELECT COUNT(*)::int INTO v_position
  FROM public.event_waitlist w
  WHERE w.event_id = p_event_id
    AND w.removed_at IS NULL
    AND w.converted_at IS NULL
    AND w.created_at <= v_row.created_at;

  RETURN jsonb_build_object(
    'waiting', true,
    'id', v_row.id,
    'position', v_position,
    'quantity', v_row.quantity,
    'notified_at', v_row.notified_at,
    'free_seats', public.event_free_seats(p_event_id)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.my_event_waitlist_state(uuid, text) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. The drain: who should be told a spot opened
-- ---------------------------------------------------------------------
-- A periodic sweep rather than a hook on each freeing path, deliberately. A
-- seat comes back from refund-order, cancel_my_pending_ticket,
-- expire_stale_pending_tickets, expire_lapsed_ticket_holds, release_ticket_hold,
-- transfer, revoke, or an organiser simply raising capacity. Wiring six call
-- sites means the seventh is missed; a sweep covers all of them and self-heals
-- after any outage.
--
-- Also stamps converted_at for anyone who has since bought, so the queue does
-- not chase people who are already going and the organiser gets a real
-- conversion number.
--
-- p_force ignores availability: the "email everyone waiting" button for an
-- event that sold out on Eventbrite, where native seats never reopen and the
-- automatic path would correctly never fire.
CREATE OR REPLACE FUNCTION public.waitlist_drain_candidates(
  p_event_id uuid    DEFAULT NULL,
  p_force    boolean DEFAULT false
)
 RETURNS TABLE (
   waitlist_id uuid,
   event_id    uuid,
   event_title text,
   date_start  timestamptz,
   user_id     uuid,
   email       text,
   name        text,
   quantity    integer,
   queue_position integer,
   free_seats  integer
 )
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- (a) Retire anyone who now holds a live ticket. Idempotent.
  UPDATE public.event_waitlist w
  SET converted_at = now()
  WHERE w.converted_at IS NULL
    AND w.removed_at IS NULL
    AND (p_event_id IS NULL OR w.event_id = p_event_id)
    AND EXISTS (
      SELECT 1
      FROM event_tickets t
      JOIN auth.users u ON u.id = t.user_id
      WHERE t.event_id = w.event_id
        AND t.status IN ('pending', 'confirmed', 'checked_in', 'reserved')
        AND (t.user_id = w.user_id OR lower(u.email) = lower(w.email))
    );

  -- (b) Retire the queue on an event that has finished.
  UPDATE public.event_waitlist w
  SET removed_at = now()
  FROM events e
  WHERE e.id = w.event_id
    AND w.removed_at IS NULL
    AND w.converted_at IS NULL
    AND COALESCE(e.date_end, e.date_start) < now();

  -- (c) Oldest-first, capped at the number of seats actually free. Cap by
  --     HEAD COUNT, not summed quantity: someone asking for 2 who is offered
  --     1 free seat can still take it, and refusing to tell them would leave
  --     the seat unsold.
  --     An OUTSTANDING OFFER holds its seat. Without this the first sweep
  --     after a seat frees emails person 1, and the very next sweep emails
  --     person 2 against the same unsold seat, and so on down the queue: FIFO
  --     collapses into a blast and the earliest joiner's head start is worth
  --     nothing. An offer holds for WAITLIST_OFFER_GRACE (24h); after that the
  --     seat is considered unclaimed and passes to the next person, who is the
  --     only one who has not already had their chance.
  RETURN QUERY
  WITH avail AS (
    SELECT e.id,
           e.title,
           e.date_start,
           GREATEST(0, COALESCE(public.event_free_seats(e.id), 0) - (
             SELECT COUNT(*)::int
             FROM public.event_waitlist o
             WHERE o.event_id = e.id
               AND o.removed_at IS NULL
               AND o.converted_at IS NULL
               AND o.notified_at IS NOT NULL
               AND o.notified_at > now() - INTERVAL '24 hours'
           )) AS free
    FROM events e
    WHERE COALESCE(e.is_ticketed, false) = true
      AND e.status = 'published'
      AND COALESCE(e.date_end, e.date_start) > now()
      AND (p_event_id IS NULL OR e.id = p_event_id)
      AND EXISTS (
        SELECT 1 FROM public.event_waitlist w
        WHERE w.event_id = e.id AND w.removed_at IS NULL AND w.converted_at IS NULL
          AND w.notified_at IS NULL
      )
  ),
  ranked AS (
    SELECT w.id            AS waitlist_id,
           a.id            AS event_id,
           a.title         AS event_title,
           a.date_start,
           w.user_id,
           w.email,
           w.name,
           w.quantity,
           ROW_NUMBER() OVER (PARTITION BY a.id ORDER BY w.created_at ASC)::int AS queue_position,
           COALESCE(a.free, 0) AS free_seats
    FROM avail a
    JOIN public.event_waitlist w ON w.event_id = a.id
    WHERE w.removed_at IS NULL
      AND w.converted_at IS NULL
      AND w.notified_at IS NULL
      AND (p_force OR COALESCE(a.free, 0) > 0)
  )
  SELECT r.waitlist_id, r.event_id, r.event_title, r.date_start,
         r.user_id, r.email, r.name, r.quantity, r.queue_position, r.free_seats
  FROM ranked r
  WHERE p_force OR r.queue_position <= r.free_seats
  ORDER BY r.event_id, r.queue_position;
END;
$function$;

COMMENT ON FUNCTION public.waitlist_drain_candidates(uuid, boolean) IS
  'People who should be emailed that a spot opened. Also retires converted and past-event entries. Called by the waitlist-notify edge function every 5 minutes.';

REVOKE ALL ON FUNCTION public.waitlist_drain_candidates(uuid, boolean) FROM anon, authenticated;


-- Stamp the notification after the email actually goes out, so a send failure
-- leaves the person in the queue for the next sweep instead of silently
-- dropping them.
CREATE OR REPLACE FUNCTION public.mark_waitlist_notified(p_waitlist_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hit integer;
BEGIN
  UPDATE public.event_waitlist
  SET notified_at  = now(),
      notify_count = notify_count + 1
  WHERE id = ANY(p_waitlist_ids);
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RETURN v_hit;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_waitlist_notified(uuid[]) FROM anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. The organiser's view
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_waitlist_summary(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_collective uuid;
BEGIN
  SELECT collective_id INTO v_collective FROM events WHERE id = p_event_id;
  IF v_collective IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  IF NOT (public.is_admin_or_staff(auth.uid()) OR public.is_collective_staff(auth.uid(), v_collective)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'waiting',   COUNT(*) FILTER (WHERE removed_at IS NULL AND converted_at IS NULL),
      'notified',  COUNT(*) FILTER (WHERE removed_at IS NULL AND converted_at IS NULL AND notified_at IS NOT NULL),
      'converted', COUNT(*) FILTER (WHERE converted_at IS NOT NULL),
      'removed',   COUNT(*) FILTER (WHERE removed_at IS NOT NULL),
      'demand',    COALESCE(SUM(quantity) FILTER (WHERE removed_at IS NULL AND converted_at IS NULL), 0),
      'free_seats', public.event_free_seats(p_event_id)
    )
    FROM public.event_waitlist
    WHERE event_id = p_event_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.event_waitlist_summary(uuid) TO authenticated;
