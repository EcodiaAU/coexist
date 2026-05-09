-- =====================================================================
-- Day-of-only check-in window guard for event_registrations
-- =====================================================================
-- Origin: 2026-05-09. A BNE leader accidentally checked someone in for
-- TOMORROW's event (Enoggera Hill Reservoir Nature Hike) at 10:10 AEST
-- 9 May. Tate manually un-checked-in the row via service_role. This
-- migration prevents recurrence by enforcing that any transition INTO
-- or OUT OF status='attended' on event_registrations is only allowed
-- when the event's date_start is TODAY in Australia/Sydney timezone.
--
-- Why a trigger and not just RLS WITH CHECK?
--   1. WITH CHECK only sees the resulting (NEW) row, not the previous
--      (OLD) state. We need to constrain BOTH directions of the
--      transition (registered -> attended AND attended -> registered)
--      symmetrically. A trigger sees OLD + NEW.
--   2. The trigger fires for every UPDATE path: leader manual check-in,
--      bulk "Mark All Present", 3-digit code self check-in, QR ticket
--      scan, offline-sync replay, and any future entry point. RLS
--      policies are scoped per-role; a trigger is universal.
--
-- service_role bypass: Tate's manual fixes (Supabase Studio admin SQL,
-- emergency conductor row-edits) MUST keep working. The trigger checks
-- auth.role() and short-circuits when running under service_role.
--
-- Tate verbatim 17:11 AEST 9 May 2026: "Sorry no option b full
-- permission. Go ahead. I release a 1.8.5 tomorrow morning with that
-- code since we haven't go you setup with the feeds to ssh release it
-- yet like EOS mobile".
-- =====================================================================

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
  -- service_role / postgres / supabase_admin bypass: Tate's manual
  -- emergency fixes via Studio admin or service-key API must keep
  -- working. These are the safety valve for any future incident.
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Direction detection. We constrain BOTH:
  --   (a) into 'attended'   = check-in
  --   (b) out of 'attended' = un-check-in (leader correction)
  -- A no-op (status unchanged) or a non-attended <-> non-attended
  -- transition is unaffected.
  is_attended_in  := (NEW.status = 'attended' AND OLD.status IS DISTINCT FROM 'attended');
  is_attended_out := (OLD.status = 'attended' AND NEW.status IS DISTINCT FROM 'attended');

  IF NOT (is_attended_in OR is_attended_out) THEN
    RETURN NEW;
  END IF;

  -- Look up the event's local-date in Australia/Sydney.
  SELECT (e.date_start AT TIME ZONE 'Australia/Sydney')::date
    INTO event_date_local
    FROM public.events e
   WHERE e.id = NEW.event_id;

  IF event_date_local IS NULL THEN
    RAISE EXCEPTION 'Event not found for event_registrations.event_id=%', NEW.event_id
      USING ERRCODE = '23514';
  END IF;

  today_aest := (now() AT TIME ZONE 'Australia/Sydney')::date;

  -- Strict equality per Tate verbatim "day-of-event" only. We use
  -- date_start (not date_end) so events that end after midnight still
  -- check-in on the start-day, matching the natural leader expectation.
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

DROP TRIGGER IF EXISTS trg_enforce_event_day_check_in ON public.event_registrations;

CREATE TRIGGER trg_enforce_event_day_check_in
  BEFORE UPDATE ON public.event_registrations
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.enforce_event_day_check_in_window();

COMMENT ON FUNCTION public.enforce_event_day_check_in_window() IS
  'Prevents check-in (status -> attended) and un-check-in (attended -> other) on event_registrations unless events.date_start equals today in Australia/Sydney. service_role bypasses for emergency manual fixes. Origin 2026-05-09 BNE wrong-day check-in incident.';
