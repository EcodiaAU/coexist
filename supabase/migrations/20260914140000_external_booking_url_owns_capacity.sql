-- An externally-booked event does not sell its seats in this app.
--
-- WHAT WAS BROKEN (measured on tjutlbzekfouwsiaplbr 2026-09-14)
-- An event carrying `external_registration_url` is one PHYSICAL event whose
-- tickets are sold by a partner (Humanitix, Eventbrite, the CVA volunteer
-- portal). The app ran a second, blind booking channel beside it: bare
-- registrations accumulated against the app's own `capacity` number, which
-- describes nothing the app controls.
--
-- "Riverfest: Yarra River Clean Up & Kayak" (249c67d9-810d-4fbb-96ee-9c0f95199893,
-- created by Jess, 17 Oct 2026, capacity 45, Humanitix link) read 45 registered
-- and 37 waitlisted in-app while roughly 20 people had actually booked on
-- Humanitix. The app had invented about 25 seats that do not physically exist,
-- shown "45/45 spots filled" over genuinely available partner places, and put
-- 37 more people in a queue it can never honour. 500 `invited` rows fed it:
-- the event-detail invitation branch rendered "Accept & Register" and, because
-- it ran ABOVE the external-link branch, never showed the partner link at all.
--
-- THE PREDICATE IS THE URL, NOT THE FLAG. `is_external_collaboration` means
-- "run with another org" and is true of 25 events that take their bookings
-- in-app perfectly correctly; every one of them must keep the normal RSVP
-- flow. Only a non-empty URL says the seats live somewhere else. Measured:
-- 25 events carry the flag with no URL, 6 carry a URL, 0 carry a URL without
-- the flag.
--
-- WHAT THIS DOES
-- The client no longer offers an in-app register/waitlist control on these
-- events. This migration is the half that holds when the client is not ours to
-- trust: an installed native bundle keeps running the old code for days while
-- Capgo catches up, the chat "Going" button writes event_registrations
-- directly, and RLS permits a bare PostgREST upsert. Three server paths:
--
--   1. handle_event_registration: a row ENTERING the going set on an
--      externally-booked event is demoted to 'waitlisted' rather than taking a
--      seat. This mirrors the registrations_closed freeze exactly, including
--      its staff exemption, because a leader recording a door walk-in is
--      physical ground truth and outranks a booking policy.
--   2. handle_registration_cancel: no backfill promotion on these events.
--      Guard 1 would demote the promoted row straight back anyway; skipping
--      the write keeps the queue order and the audit trail honest.
--   3. promote_free_event_waitlist: these events are never drained. This one
--      is load-bearing beyond tidiness, because that sweep EMAILS every person
--      it promotes. Riverfest's 37 waitlisted rows are held back today only by
--      the capacity count; anything that relaxed the count without this filter
--      would mail 37 people that a spot opened up, on an event where the app
--      has no spot to give.
--
-- DELIBERATE NON-SCOPE: the rows already on disk are not touched. The 45
-- registered and 37 waitlisted on Riverfest stay exactly as they are, visible
-- to their leaders. Reconciling them against the real Humanitix list is an
-- organiser decision and a member-contact decision, never a silent mutation
-- from a migration.

-- ---------------------------------------------------------------------------
-- 1. No new seat claims on an externally-booked event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_event_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  event_capacity integer;
  v_is_ticketed  boolean;
  v_closed       boolean;
  v_external     text;
  v_collective   uuid;
  v_privileged   boolean;
  current_count  integer;
BEGIN
  -- Nothing that could enter the going set (GOING_REGISTRATION_STATUSES).
  IF NEW.status NOT IN ('registered', 'attended') THEN
    RETURN NEW;
  END IF;

  -- Already holds its seat. This is an edit of some other column (check-in
  -- time, a repair), not a new claim, so it must never be demoted. 'attended'
  -- is in the set because a checked-in member is already going: an un-check-in
  -- or a repair moving attended -> registered would otherwise be read as a
  -- fresh claim and waitlisted on a full or frozen event.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('registered', 'attended') THEN
    RETURN NEW;
  END IF;

  SELECT capacity, is_ticketed, registrations_closed, collective_id,
         NULLIF(btrim(COALESCE(external_registration_url, '')), '')
    INTO event_capacity, v_is_ticketed, v_closed, v_collective, v_external
  FROM events WHERE id = NEW.event_id;

  -- Ticketed events: the ticket gate owns capacity. Never auto-waitlist here.
  -- The freeze sits AFTER this deliberately, so a ticket-derived registration
  -- can never be demoted away from the ticket that backs it.
  IF v_is_ticketed IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Externally booked: the partner owns the seats, so the app must not create
  -- one. Same staff exemption as the freeze below, for the same reason: a
  -- leader checking in somebody who booked on Humanitix and physically turned
  -- up is ground truth, and service_role / postgres keeps manual repair open.
  IF v_external IS NOT NULL THEN
    v_privileged := auth.role() IS NULL
                 OR auth.role() = 'service_role'
                 OR public.is_collective_leader_or_above(auth.uid(), v_collective)
                 OR public.is_admin_or_staff(auth.uid());
    IF NOT v_privileged THEN
      NEW.status := 'waitlisted';
    END IF;
    RETURN NEW;
  END IF;

  -- Registrations frozen. Nobody who is not already in the going set may enter
  -- it, by any status and any path, INDEPENDENT of the count, so a cancellation
  -- cannot reopen a seat and the promotion in handle_registration_cancel cannot
  -- land. Staff are exempt: a leader recording a door walk-in is physical
  -- ground truth and outranks a registration policy, and service_role /
  -- postgres keeps the manual-repair door open.
  IF v_closed IS TRUE THEN
    v_privileged := auth.role() IS NULL
                 OR auth.role() = 'service_role'
                 OR public.is_collective_leader_or_above(auth.uid(), v_collective)
                 OR public.is_admin_or_staff(auth.uid());
    IF NOT v_privileged THEN
      NEW.status := 'waitlisted';
      RETURN NEW;
    END IF;
    RETURN NEW;
  END IF;

  -- Only a row entering 'registered' consumes a seat against the numeric cap.
  -- A direct 'attended' write is a door walk-in and is deliberately ungated.
  IF NEW.status IS DISTINCT FROM 'registered' THEN
    RETURN NEW;
  END IF;

  IF event_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise seat claims for THIS event so two concurrent registrations
  -- cannot both read the same stale count and both take the last spot. An
  -- advisory transaction lock is used rather than SELECT ... FOR UPDATE on the
  -- events row so that an organiser editing the event does not block sign-ups.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text, 0));

  -- QUEUE PRIORITY (2026-09-06). On a capped event a freed seat belongs to the
  -- earliest waitlisted person, not to whoever clicks Register next. A fresh
  -- claim arriving while anyone is queued goes behind them; the sweep or the
  -- cancel-backfill then promotes strictly FIFO. The exemption is a row being
  -- promoted OUT of the waitlist (the sweep, the cancel-backfill, a leader's
  -- Promote, the day-of self-promote): that is the queue itself moving, and
  -- demoting it here would make promotion impossible.
  IF (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'waitlisted')
     AND EXISTS (
       SELECT 1 FROM event_registrations w
       WHERE w.event_id = NEW.event_id
         AND w.status = 'waitlisted'
         AND (TG_OP = 'INSERT' OR w.id <> NEW.id)
     )
  THEN
    NEW.status := 'waitlisted';
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM event_registrations
  WHERE event_id = NEW.event_id
    AND status IN ('registered', 'attended')   -- GOING_REGISTRATION_STATUSES
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF current_count >= event_capacity THEN
    NEW.status := 'waitlisted';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. A cancellation on an externally-booked event backfills nobody
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_registration_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_waitlisted uuid;
  promoted_status registration_status;
  v_closed        boolean;
  v_external      text;
BEGIN
  IF OLD.status = 'registered' AND NEW.status = 'cancelled' THEN
    -- A frozen event does not backfill, and neither does an externally-booked
    -- one: the freed row was never a real seat, so there is nothing to hand on.
    -- handle_event_registration would demote the promoted row straight back to
    -- 'waitlisted' anyway; skipping the write keeps the waitlist order and the
    -- audit trail honest.
    SELECT registrations_closed,
           NULLIF(btrim(COALESCE(external_registration_url, '')), '')
      INTO v_closed, v_external
    FROM events WHERE id = OLD.event_id;
    IF v_closed IS TRUE OR v_external IS NOT NULL THEN
      RETURN NEW;
    END IF;

    SELECT id INTO next_waitlisted
    FROM event_registrations
    WHERE event_id = OLD.event_id AND status = 'waitlisted'
    ORDER BY registered_at ASC
    LIMIT 1;

    IF next_waitlisted IS NOT NULL THEN
      UPDATE event_registrations
      SET status = 'registered'
      WHERE id = next_waitlisted;

      SELECT status INTO promoted_status
      FROM event_registrations WHERE id = next_waitlisted;

      -- Only tell them they are in if the seat actually landed.
      IF promoted_status = 'registered' THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        SELECT user_id, 'waitlist_promoted',
          'You''re in!',
          'A spot opened up for an event you were waitlisted for.',
          jsonb_build_object('event_id', OLD.event_id)
        FROM event_registrations WHERE id = next_waitlisted;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. The promotion sweep never drains an externally-booked event
-- ---------------------------------------------------------------------------
-- This is the one that sends email. Everything else here is about not taking a
-- seat; this is about not telling 37 people a seat opened up.
CREATE OR REPLACE FUNCTION public.promote_free_event_waitlist(p_limit integer DEFAULT 50)
RETURNS TABLE (
  out_event_id     uuid,
  out_user_id      uuid,
  out_display_name text,
  out_email        text,
  out_event_title  text,
  out_event_date   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event     record;
  v_row       record;
  v_landed    registration_status;
  v_promoted  integer := 0;
BEGIN
  FOR v_event IN
    SELECT e.id, e.title, e.date_start
    FROM events e
    WHERE e.is_ticketed IS NOT TRUE                    -- ticket gate owns those
      AND e.status = 'published'
      AND COALESCE(e.registrations_closed, false) = false  -- a frozen event does
          -- not drain. Load-bearing: this function runs privileged, so the
          -- freeze branch in handle_event_registration would NOT demote its
          -- flips; the filter is the only thing honouring the freeze here.
      AND NULLIF(btrim(COALESCE(e.external_registration_url, '')), '') IS NULL
          -- An externally-booked event has no seat to promote anyone INTO, and
          -- this sweep emails whoever it promotes. Same load-bearing reason as
          -- the freeze filter above: the sweep runs privileged, so the external
          -- branch in handle_event_registration would not demote its flips.
      -- Promote until the event ENDS, not until it starts: morning-of
      -- cancellations are the peak real-world moment a waitlisted person needs
      -- the seat (they are deciding whether to drive over), and day-of
      -- walk-up-from-waitlist is already sanctioned product behaviour. The 2h
      -- fallback mirrors generateIcsFile's default event length. Never promote
      -- after the event has ended: "you're in!" for a finished event is noise.
      AND COALESCE(e.date_end, e.date_start + interval '2 hours') > now()
      AND EXISTS (
        SELECT 1 FROM event_registrations r
        WHERE r.event_id = e.id AND r.status = 'waitlisted'
      )
    ORDER BY e.date_start ASC
  LOOP
    EXIT WHEN v_promoted >= p_limit;

    -- Same lock key as handle_event_registration, so a drain and a live claim
    -- on the same event serialise instead of racing.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_event.id::text, 0));

    FOR v_row IN
      SELECT r.id, r.user_id
      FROM event_registrations r
      WHERE r.event_id = v_event.id AND r.status = 'waitlisted'
      -- FIFO on registered_at (when they joined the queue), NULLS LAST so a
      -- row that never got a stamp cannot starve everyone behind it, id as the
      -- deterministic tiebreak.
      ORDER BY r.registered_at ASC NULLS LAST, r.id ASC
    LOOP
      EXIT WHEN v_promoted >= p_limit;

      UPDATE event_registrations
      SET status = 'registered'
      WHERE id = v_row.id AND status = 'waitlisted';

      -- The trigger is the arbiter: re-read what actually landed. A demotion
      -- back to 'waitlisted' means the event is full again; stop draining it.
      -- The failed flip changed nothing (status and registered_at untouched),
      -- so the person keeps their exact queue position.
      SELECT status INTO v_landed FROM event_registrations WHERE id = v_row.id;
      IF v_landed IS DISTINCT FROM 'registered' THEN
        EXIT;
      END IF;

      -- Same in-app notification shape as handle_registration_cancel, so a
      -- promotion reads identically to the member whichever path granted it.
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        v_row.user_id, 'waitlist_promoted', 'You''re in!',
        'A spot opened up for an event you were waitlisted for.',
        jsonb_build_object('event_id', v_event.id)
      );

      v_promoted := v_promoted + 1;

      RETURN QUERY
      SELECT v_event.id, v_row.user_id,
             p.display_name, p.email,
             v_event.title, v_event.date_start
      FROM profiles p WHERE p.id = v_row.user_id;
    END LOOP;
  END LOOP;
END;
$function$;

-- Cron/edge entrypoint only, unchanged from 20260906020000: an anon or member
-- caller must not be able to fire promotions (or the emails that ride on them)
-- off-schedule. CREATE OR REPLACE preserves existing grants, but these are
-- restated so the hardening travels with the function it protects.
REVOKE ALL ON FUNCTION public.promote_free_event_waitlist(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_free_event_waitlist(integer) FROM anon;
