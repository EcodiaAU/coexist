-- =====================================================================
-- Post-event check-in backfill window
-- =====================================================================
-- Origin: 2026-05-20. Jess (Co-Exist): leaders need to check people in
-- AFTER the event when attendees lost wifi at the venue, or when a
-- partner org ran a paper sign-in sheet that gets transcribed later.
--
-- The 2026-05-09 day-of guard (migration 20260509000000) was built to
-- stop a FUTURE wrong-day check-in (a BNE leader checked someone in for
-- tomorrow's event). That safety property must stay. The mistake it
-- prevents is marking attendance BEFORE the event happens.
--
-- Backfilling the PAST is the opposite and is safe: the people did show,
-- the record just could not be made in time. So we make the window
-- asymmetric:
--   - FUTURE (event AEST day > today): blocked (unchanged safety).
--   - EVENT DAY: open (unchanged).
--   - AFTER the event day: open ONLY while impact has not been logged,
--     AND only for collective leaders/admins. The act of logging impact
--     finalises attendance and closes the window.
--
-- Canonical "impact logged" signal: existence of an event_impact row for
-- the event. (events.status -> 'completed' is a best-effort side effect
-- of logging impact; the row is the source of truth.)
--
-- Decision: Tate, 2026-05-20 - lifecycle window ("until impact logged"),
-- leaders + admins only. Self check-in (3-digit code) and the public QR
-- form stay day-of only: the registrations trigger requires a leader for
-- past-day check-ins, and the public-event-check-in Edge Function keeps
-- its own day-of date guard (service_role bypasses the walk-in trigger).
--
-- service_role bypass is preserved on both triggers for Tate's emergency
-- manual fixes via Studio / service-key API.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. event_registrations: leader/admin past-day backfill until impact
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_event_day_check_in_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_date_local   date;
  today_aest         date;
  event_collective   uuid;
  is_attended_in     boolean;
  is_attended_out    boolean;
  impact_logged      boolean;
BEGIN
  -- service_role / postgres / supabase_admin bypass: manual emergency fixes.
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Constrain BOTH directions: into 'attended' (check-in) and out of
  -- 'attended' (un-check-in correction). No-ops pass through.
  is_attended_in  := (NEW.status = 'attended' AND OLD.status IS DISTINCT FROM 'attended');
  is_attended_out := (OLD.status = 'attended' AND NEW.status IS DISTINCT FROM 'attended');

  IF NOT (is_attended_in OR is_attended_out) THEN
    RETURN NEW;
  END IF;

  SELECT (e.date_start AT TIME ZONE 'Australia/Sydney')::date, e.collective_id
    INTO event_date_local, event_collective
    FROM public.events e
   WHERE e.id = NEW.event_id;

  IF event_date_local IS NULL THEN
    RAISE EXCEPTION 'Event not found for event_registrations.event_id=%', NEW.event_id
      USING ERRCODE = '23514';
  END IF;

  today_aest := (now() AT TIME ZONE 'Australia/Sydney')::date;

  -- FUTURE: never allow check-in before the event happens (the 9-May fix).
  IF event_date_local > today_aest THEN
    RAISE EXCEPTION
      'Check-in is not available before the day of the event. Event date: %, today (AEST): %.',
      event_date_local, today_aest
      USING ERRCODE = '23514',
            HINT = 'Wait until the event date to check attendees in.';
  END IF;

  -- EVENT DAY: open to anyone (self check-in + leaders), unchanged.
  IF event_date_local = today_aest THEN
    RETURN NEW;
  END IF;

  -- PAST: backfill window. Open only while impact is not yet logged AND
  -- only for collective leaders/admins (self check-in stays day-of only).
  impact_logged := EXISTS (
    SELECT 1 FROM public.event_impact ei WHERE ei.event_id = NEW.event_id
  );

  IF impact_logged THEN
    RAISE EXCEPTION
      'Check-in is closed - impact has already been logged for this event.'
      USING ERRCODE = '23514',
            HINT = 'Reopen by contacting a national admin if attendance needs to change.';
  END IF;

  -- Authority mirrors the day-of check-in authority exactly: the non-self
  -- branches of the event_registrations RLS update policy
  -- (registrations_update_own_or_leader = collective leader/co_leader OR global
  -- staff OR own row). We deliberately EXCLUDE the own-row path so participant
  -- self check-in (3-digit code) stays day-of only; backfill is leaders/admins.
  IF NOT (public.is_collective_leader_or_above(auth.uid(), event_collective)
          OR public.is_admin_or_staff(auth.uid())) THEN
    RAISE EXCEPTION
      'Post-event check-in is available to event leaders and admins only.'
      USING ERRCODE = '23514',
            HINT = 'Ask your event leader to record this attendance.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_event_day_check_in_window() IS
  'Check-in window guard for event_registrations. Future check-in blocked; '
  'event-day open to all; after the event day, open to collective leaders/admins '
  'only and only until an event_impact row exists (post-event backfill window). '
  'service_role bypasses. Origin 2026-05-09 wrong-day fix + 2026-05-20 backfill.';

-- ---------------------------------------------------------------------
-- 2. event_walk_ins: leader past-day backfill until impact
-- ---------------------------------------------------------------------
-- Leader_adhoc inserts run as the authenticated leader (RLS already
-- requires is_collective_leader_or_above). public_form inserts run as
-- service_role via the Edge Function, which keeps its own day-of date
-- guard, so the public QR form stays day-of only.

CREATE OR REPLACE FUNCTION public.enforce_walk_in_day_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_date_aest date;
  today_aest      date;
  impact_logged   boolean;
BEGIN
  -- service_role bypass (covers public_form path + emergency back-fills).
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT (date_start AT TIME ZONE 'Australia/Sydney')::date
    INTO event_date_aest
    FROM events
   WHERE id = NEW.event_id;

  today_aest := (now() AT TIME ZONE 'Australia/Sydney')::date;

  -- FUTURE: blocked.
  IF event_date_aest > today_aest THEN
    RAISE EXCEPTION 'Walk-ins cannot be recorded before the day of the event'
      USING ERRCODE = '22023';
  END IF;

  -- EVENT DAY: open (unchanged).
  IF event_date_aest = today_aest THEN
    RETURN NEW;
  END IF;

  -- PAST: open only while impact has not been logged (RLS gates leader role).
  impact_logged := EXISTS (
    SELECT 1 FROM event_impact ei WHERE ei.event_id = NEW.event_id
  );

  IF impact_logged THEN
    RAISE EXCEPTION 'Check-in is closed - impact has already been logged for this event'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_walk_in_day_window() IS
  'Walk-in window guard for event_walk_ins. Future blocked; event-day open; '
  'after the event day open until an event_impact row exists (leader backfill; '
  'RLS gates the leader role). service_role bypass keeps the public QR Edge '
  'Function path day-of only via its own date guard. 2026-05-20 backfill.';
