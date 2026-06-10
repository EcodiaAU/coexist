-- Floating-local v2 - day-of check-in trigger fix
-- Run BEFORE the data migration at cutover.
--
-- The existing trigger (migration 20260509000000) extracts
-- event_date_local via:
--   (date_start AT TIME ZONE 'Australia/Sydney')::date
--
-- Under real-UTC encoding that worked. Under floating-local encoding
-- (date_start is wall-clock-as-UTC) it over-shifts events whose wall-
-- clock falls in the 14:00-23:59 UTC range, because viewing them via
-- AT TIME ZONE Sydney pushes the date forward by ~10-11 hours.
--
-- Example: event "9pm Sat 14 June Sydney" stored as 2026-06-14T21:00:00Z
--   Old logic: 21:00Z AT TIME ZONE Sydney = '2026-06-15T07:00:00' (Sun)
--              ::date = Sun 15 June - WRONG, host intended Sat 14
--   New logic: 21:00Z AT TIME ZONE UTC = '2026-06-14T21:00:00' (Sat)
--              ::date = Sat 14 June - matches host intent
--
-- Comparison side ("today" for the trigger) stays on Australia/Sydney
-- as a reasonable AU-centric proxy for the server-side notion of today.
-- The trigger does not know the viewer's device tz; using the host's
-- intended day (UTC-extract) on the event side and AU/Sydney for now()
-- aligns with the most common AU viewer case.

CREATE OR REPLACE FUNCTION public.enforce_event_day_check_in_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_date_local date;
  today_aest       date;
  is_attended_in   boolean;
  is_attended_out  boolean;
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  is_attended_in  := (NEW.status = 'attended' AND OLD.status IS DISTINCT FROM 'attended');
  is_attended_out := (OLD.status = 'attended' AND NEW.status IS DISTINCT FROM 'attended');

  IF NOT (is_attended_in OR is_attended_out) THEN
    RETURN NEW;
  END IF;

  -- Floating-local: events.date_start is wall-clock-as-UTC. Extract the
  -- host's wall-clock day verbatim by viewing AT TIME ZONE 'UTC'.
  SELECT (e.date_start AT TIME ZONE 'UTC')::date
    INTO event_date_local
    FROM public.events e
   WHERE e.id = NEW.event_id;

  IF event_date_local IS NULL THEN
    RAISE EXCEPTION 'Event not found for event_registrations.event_id=%', NEW.event_id
      USING ERRCODE = '23514';
  END IF;

  today_aest := (now() AT TIME ZONE 'Australia/Sydney')::date;

  IF event_date_local <> today_aest THEN
    RAISE EXCEPTION
      'Check-in is only available on the day of the event. Event date: %, today (AEST): %.',
      event_date_local, today_aest
      USING ERRCODE = '23514',
            HINT = 'Wait until the event date to check attendees in or out.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_event_day_check_in_window() IS
  'Day-of-only check-in window. Floating-local v2 2026-05-26: event date extracted AT TIME ZONE UTC to read wall-clock day verbatim. service_role bypasses.';
