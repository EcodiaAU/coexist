-- 2026-10-19 (lane J750, task a3e88dc2; board 7fc10cdb)
--
-- A member who checks themselves in at a sign-ups-closed (or externally
-- booked) event is recorded as attended on the event day, and is refused
-- visibly on any other day. Until now every such check-in was silently
-- written as 'waitlisted' while the app showed "You're checked in!".
--
-- Two defects, one trigger:
--
-- 1. An UPSERT is judged as a fresh claim, so it demotes the seat it is
--    editing. Every self check-in path (useCheckIn self branch, useCodeCheckIn,
--    both offline replays) is an upsert ON CONFLICT (event_id, user_id). Postgres
--    runs the BEFORE INSERT trigger on the proposed row first and copies what it
--    changed into EXCLUDED, which the DO UPDATE then writes over the existing
--    row. The proposed row has no OLD, so the "already holds its seat" exit
--    below never ran for it: on a closed event a REGISTERED member who tapped
--    check-in lost their seat to 'waitlisted', on any day, and an already
--    checked-in member whose check-in was replayed (a timed-out request
--    re-queued offline) was moved from 'attended' to 'waitlisted'. Neither
--    BEFORE UPDATE trigger noticed, because the row they saw was already
--    'waitlisted'. The same exit now runs for an INSERT whose row already
--    holds a seat, which is the edit the upsert is about to become.
--
-- 2. The freeze treated a self check-in as a registration. A walk-up, a
--    waitlisted or a cancelled member checking in on the day of a closed event
--    was demoted to 'waitlisted'. Physical presence is the ground truth the
--    freeze already defers to for leaders, and on an event that is NOT closed a
--    direct 'attended' write is a door walk-in and ungated. So a non-privileged
--    'attended' write on a closed or externally booked event is now admitted on
--    the event day, and refused with the same 23514 messages as
--    enforce_event_day_check_in_window on any other day. The date guard has to
--    live here: an INSERT never reaches that BEFORE UPDATE trigger. The day
--    arithmetic is copied from it verbatim (floating-local event day, today in
--    the collective's timezone).
--
--    The externally booked branch gets the same rule on purpose. Riverfest
--    (249c67d9, booked on Humanitix at the time) holds six rows whose
--    checked_in_at equals registered_at to the millisecond, the signature of
--    the self check-in upsert, now 'registered': demoted, then promoted back by
--    hand. Checking in at the event is attendance, not a seat sale.
--
-- Unchanged: a fresh 'registered' claim on a closed or externally booked event
-- is still waitlisted, a self-promote out of the waitlist on a closed event is
-- still refused, leaders and staff stay exempt, and ticketed events still
-- return before any of this.
--
-- Evidence (rolled-back matched pair on prod, owned participant 1f8aeab6 in the
-- inactive Test collective): before, C1-C10 all landed 'waitlisted' (walk-up,
-- registered, waitlisted, cancelled and attended rows, today, tomorrow and
-- yesterday, closed and external); control K3 (open event walk-up) 'attended'.
-- Merri Mornings 2026-10-04 (070d8540, closed) held 21 'waitlisted' and 1
-- 'cancelled' row with checked_in_at = registered_at when this was written.
--
-- The body is the live pg_get_functiondef as of 2026-10-19 (after
-- 20261019040000) with only the marked parts changed. Rollback: re-apply that
-- body (stored in the ledger row's rollback column).

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
  v_event_day    date;   -- ADDED 2026-10-19 (a3e88dc2)
  v_today        date;   -- ADDED 2026-10-19 (a3e88dc2)
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

  -- ADDED 2026-10-19 (a3e88dc2). The same exit for an UPSERT. INSERT ... ON
  -- CONFLICT DO UPDATE runs this trigger on the proposed row BEFORE it knows
  -- about the conflict, and whatever is changed here is copied into EXCLUDED
  -- and written over the existing row. Judging a seat-holder's upsert as a
  -- fresh claim therefore demoted the seat itself (a registered member's self
  -- check-in on a closed event landed 'waitlisted'). When the row it collides
  -- with already holds a seat, pass the proposed row through unchanged: the DO
  -- UPDATE then reaches the UPDATE exit above, and enforce_event_day_check_in_window
  -- still guards the date. A plain INSERT that collides fails on the unique
  -- key, so passing it through changes nothing for it.
  IF TG_OP = 'INSERT' AND EXISTS (
       SELECT 1 FROM event_registrations x
       WHERE x.event_id = NEW.event_id
         AND x.user_id  = NEW.user_id
         AND x.status IN ('registered', 'attended')
     ) THEN
    RETURN NEW;
  END IF;

  -- CHANGED 2026-10-19 (a3e88dc2): also reads the event day and today in the
  -- collective's timezone, exactly as enforce_event_day_check_in_window does.
  SELECT e.capacity, e.is_ticketed, e.registrations_closed, e.collective_id,
         NULLIF(btrim(COALESCE(e.external_registration_url, '')), ''),
         (e.date_start AT TIME ZONE 'UTC')::date,
         (now() AT TIME ZONE COALESCE(c.timezone, 'Australia/Sydney'))::date
    INTO event_capacity, v_is_ticketed, v_closed, v_collective, v_external,
         v_event_day, v_today
  FROM events e
  LEFT JOIN collectives c ON c.id = e.collective_id
  WHERE e.id = NEW.event_id;

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
  -- CHANGED 2026-10-19: every leader tier, assist_leader included.
  --
  -- Registrations frozen. Nobody who is not already in the going set may enter
  -- it, by any status and any path, INDEPENDENT of the count, so a cancellation
  -- cannot reopen a seat and the promotion in handle_registration_cancel cannot
  -- land. Staff are exempt: a leader recording a door walk-in is physical
  -- ground truth and outranks a registration policy, and service_role /
  -- postgres keeps the manual-repair door open.
  -- CHANGED 2026-10-19: every leader tier, assist_leader included.
  --
  -- CHANGED 2026-10-19 (a3e88dc2): the two branches were identical, so they are
  -- one, and a member's OWN check-in ('attended') is no longer a registration:
  -- on the event day it is admitted, as a door walk-in is on an open event; on
  -- any other day it is refused with the window trigger's own messages, never
  -- written as 'waitlisted' behind a success screen.
  IF v_external IS NOT NULL OR v_closed IS TRUE THEN
    v_privileged := auth.role() IS NULL
                 OR auth.role() = 'service_role'
                 OR public.is_collective_leader_or_above(auth.uid(), v_collective)
                 OR public.is_collective_staff(auth.uid(), v_collective)
                 OR public.is_admin_or_staff(auth.uid());
    IF v_privileged THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'attended' THEN
      IF v_event_day > v_today THEN
        RAISE EXCEPTION
          'Check-in is not available before the day of the event. Event date: %, today: %.',
          v_event_day, v_today
          USING ERRCODE = '23514',
                HINT = 'Wait until the event date to check attendees in.';
      END IF;
      IF v_event_day < v_today THEN
        RAISE EXCEPTION
          'Post-event check-in is available to event leaders and admins only.'
          USING ERRCODE = '23514',
                HINT = 'Ask your event leader to record this attendance.';
      END IF;
      RETURN NEW;
    END IF;

    NEW.status := 'waitlisted';
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
$function$
;
