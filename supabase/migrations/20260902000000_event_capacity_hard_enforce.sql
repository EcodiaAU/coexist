-- Event capacity is a HARD limit at the write boundary, not an INSERT-only nudge.
--
-- WHAT WAS BROKEN (measured on tjutlbzekfouwsiaplbr 2026-09-02)
-- "Merri Mornings" 6208301f-b9f0-42ec-a917-8f95fc13383b carried capacity 100
-- with 149 rows at status 'registered' and ZERO at 'waitlisted'. Two causes,
-- both real, and neither is the INSERT trigger being dead (82 waitlisted rows
-- exist elsewhere in the table, so the INSERT path has been working):
--
--   1. EVERY UPDATE INTO 'registered' WAS UNGUARDED. handle_event_registration
--      was wired BEFORE INSERT only. handle_announcement_rsvp (the chat "Going"
--      button) selects events.capacity into v_event and never reads it again:
--      when a registration row already exists in any non-registered state it
--      takes an UPDATE branch, so an 'invited' row became 'registered' with no
--      capacity check at all. 484 rows on that event sit at 'invited' and 22 of
--      the 149 registered rows carry a non-null invited_at, i.e. they entered
--      the going set through exactly that door. The RLS policy
--      registrations_update_own_or_leader has no WITH CHECK clause, so the same
--      transition is reachable by a bare PostgREST PATCH.
--   2. A CAPACITY EDIT NEVER RETRO-ENFORCED. Setting capacity on an event that
--      is already over the new number left every existing row registered, and
--      nothing re-evaluated on the next write.
--
-- Also fixed here: the read-then-write race. The old count was an unlocked
-- SELECT COUNT(*), so two concurrent claims on the last seat both saw room.
--
-- WHAT THIS DOES
-- One trigger function, now BEFORE INSERT OR UPDATE, enforcing on the single
-- event that matters: a row ENTERING the 'registered' set. Over capacity the
-- seat claim is refused by demoting the row to 'waitlisted', which is the
-- product's existing designed behaviour and already has promotion and
-- notification machinery behind it. A row that is ALREADY registered is left
-- alone, so the 149 real members on Merri Mornings stay registered, editable
-- and cancellable; deciding what happens to the 49 over the line is a policy
-- call for the organiser, never a silent data mutation.
--
-- DELIBERATE NON-SCOPE (residuals, named so they are not mistaken for cover):
--   - Entry into 'attended' is NOT capacity-gated. Day-of check-in, including a
--     leader checking in a waitlisted walk-in, is an attendance decision, not a
--     registration. Pre-event that transition is already refused by
--     enforce_event_day_check_in_window.
--   - The missing WITH CHECK on registrations_update_own_or_leader is not added
--     here. This trigger closes the capacity hole underneath it either way.

-- ---------------------------------------------------------------------------
-- 1. Capacity enforcement on every path into the going set
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
  current_count  integer;
BEGIN
  -- Only a row entering the 'registered' set can consume a seat.
  IF NEW.status IS DISTINCT FROM 'registered' THEN
    RETURN NEW;
  END IF;

  -- Already holds its seat. This is an edit of some other column (check-in
  -- time, a repair), not a new claim, so it must never be demoted.
  IF TG_OP = 'UPDATE' AND OLD.status = 'registered' THEN
    RETURN NEW;
  END IF;

  SELECT capacity, is_ticketed INTO event_capacity, v_is_ticketed
  FROM events WHERE id = NEW.event_id;

  -- Ticketed events: the ticket gate owns capacity. Never auto-waitlist here.
  IF v_is_ticketed IS TRUE THEN
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

DROP TRIGGER IF EXISTS on_event_registration ON public.event_registrations;
CREATE TRIGGER on_event_registration
  BEFORE INSERT OR UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.handle_event_registration();

-- ---------------------------------------------------------------------------
-- 2. Waitlist promotion must not claim a seat that is not there
-- ---------------------------------------------------------------------------
-- The promotion is an UPDATE, so it now passes through the trigger above and is
-- demoted straight back to 'waitlisted' when the event is still over capacity
-- (which is exactly right: one cancellation off 149/100 frees nothing). The old
-- code sent "You're in!" unconditionally, so it would have told someone they had
-- a spot while their row stayed waitlisted. Read the status back and let the
-- outcome decide, rather than counting capacity a second time here.
CREATE OR REPLACE FUNCTION public.handle_registration_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_waitlisted uuid;
  promoted_status registration_status;
BEGIN
  IF OLD.status = 'registered' AND NEW.status = 'cancelled' THEN
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
-- 3. The RSVP RPC must report what actually happened
-- ---------------------------------------------------------------------------
-- It previously returned action='registered' unconditionally, which after the
-- trigger change would be a lie whenever the event is full. Read the row back
-- and report the real status so the client can say "you are on the waitlist"
-- instead of "you are going".
CREATE OR REPLACE FUNCTION public.handle_announcement_rsvp(p_event_id uuid, p_response text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event    record;
  v_existing record;
  v_status   registration_status;
  v_result   jsonb;
BEGIN
  SELECT id, title, date_start, capacity INTO v_event
  FROM events WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  SELECT * INTO v_existing
  FROM event_registrations
  WHERE event_id = p_event_id AND user_id = auth.uid();

  IF p_response = 'going' THEN
    IF v_existing IS NULL THEN
      INSERT INTO event_registrations (event_id, user_id, status, registered_at)
      VALUES (p_event_id, auth.uid(), 'registered', now());
    ELSIF v_existing.status != 'registered' THEN
      UPDATE event_registrations
      SET status = 'registered', registered_at = now()
      WHERE event_id = p_event_id AND user_id = auth.uid();
    END IF;

    DELETE FROM event_maybe_reminders
    WHERE event_id = p_event_id AND user_id = auth.uid();

    -- The capacity trigger may have demoted this to 'waitlisted'.
    SELECT status INTO v_status
    FROM event_registrations
    WHERE event_id = p_event_id AND user_id = auth.uid();

    v_result := jsonb_build_object(
      'action', CASE WHEN v_status = 'waitlisted' THEN 'waitlisted' ELSE 'registered' END,
      'status', v_status,
      'event_title', v_event.title
    );

  ELSIF p_response = 'not_going' THEN
    IF v_existing IS NOT NULL AND v_existing.status IN ('registered', 'invited', 'waitlisted') THEN
      UPDATE event_registrations
      SET status = 'cancelled'
      WHERE event_id = p_event_id AND user_id = auth.uid();
    END IF;
    DELETE FROM event_maybe_reminders
    WHERE event_id = p_event_id AND user_id = auth.uid();
    v_result := jsonb_build_object('action', 'cancelled', 'event_title', v_event.title);

  ELSIF p_response = 'maybe' THEN
    INSERT INTO event_maybe_reminders (event_id, user_id, remind_at)
    VALUES (
      p_event_id,
      auth.uid(),
      GREATEST(v_event.date_start - INTERVAL '3 days', now() + INTERVAL '1 hour')
    )
    ON CONFLICT (event_id, user_id)
    DO UPDATE SET remind_at = GREATEST(v_event.date_start - INTERVAL '3 days', now() + INTERVAL '1 hour'),
                  sent = false;
    v_result := jsonb_build_object(
      'action', 'maybe',
      'event_title', v_event.title,
      'remind_at', GREATEST(v_event.date_start - INTERVAL '3 days', now() + INTERVAL '1 hour')
    );

  ELSE
    RAISE EXCEPTION 'Invalid response: %', p_response;
  END IF;

  RETURN v_result;
END;
$function$;
