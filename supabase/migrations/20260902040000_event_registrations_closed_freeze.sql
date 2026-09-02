-- Merri Mornings 2026-09-06 is frozen: the 149 already going stay, nobody new
-- enters the going set by any path. A numeric capacity cannot express that,
-- because 13 cancellations would drop the count under 100 and reopen joins,
-- and handle_registration_cancel would start promoting off the waitlist again.
-- The first cut of the freeze only guarded rows entering 'registered', because
-- that is the shape the RSVP paths use. Measured immediately after, on a
-- rolled-back authenticated tx: an ordinary member with NO row on the event can
-- INSERT status='attended' straight at PostgREST and land in the going set, and
-- Merri Mornings went 149 -> 150 under a freeze that read as holding.
-- registrations_insert_own's WITH CHECK is only user_id = auth.uid() and says
-- nothing about status; enforce_event_day_check_in_window is wired BEFORE UPDATE
-- so an INSERT never meets it at all. 'attended' therefore has to be inside the
-- freeze, and the leader walk-in has to stay outside it, because a person who
-- physically turned up must never be waitlisted (National Tree Day Corso Park
-- and Oyster Reef are both legitimately over capacity for exactly that reason).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS registrations_closed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.registrations_closed IS
  'Registrations frozen. Nobody who is not already in the going set may enter it, whatever the count says. Grandfathers everyone already registered or attended. Governs the bare-RSVP path only, never the ticket gate.';

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

  SELECT capacity, is_ticketed, registrations_closed, collective_id
    INTO event_capacity, v_is_ticketed, v_closed, v_collective
  FROM events WHERE id = NEW.event_id;

  -- Ticketed events: the ticket gate owns capacity. Never auto-waitlist here.
  -- The freeze sits AFTER this deliberately, so a ticket-derived registration
  -- can never be demoted away from the ticket that backs it.
  IF v_is_ticketed IS TRUE THEN
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
BEGIN
  IF OLD.status = 'registered' AND NEW.status = 'cancelled' THEN
    -- A frozen event does not backfill. handle_event_registration would demote
    -- the promoted row straight back to 'waitlisted' anyway; skipping the write
    -- keeps the waitlist order and the audit trail honest.
    SELECT registrations_closed INTO v_closed FROM events WHERE id = OLD.event_id;
    IF v_closed IS TRUE THEN
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

-- Merri Mornings, 2026-09-06, the only event this touches.
UPDATE public.events
SET registrations_closed = true
WHERE id = '6208301f-b9f0-42ec-a917-8f95fc13383b';
