-- =====================================================================
-- UTC-pin the check-in / walk-in day-window triggers (floating-local fix)
-- =====================================================================
-- Origin: 2026-06-08 audit (verified live against project tjutlbzekfouwsiaplbr).
--
-- Since the 2026-05-25 floating-local cutover, events.date_start stores the
-- host's WALL-CLOCK time stamped verbatim as UTC (e.g. "4:30pm" -> 16:30:00Z),
-- and events.timezone is NULL for every event. The FE reads this back UTC-pinned.
--
-- The three day-window triggers still computed the event's calendar day as
-- `(date_start AT TIME ZONE 'Australia/Sydney')::date`. For an afternoon/evening
-- event the +10h Sydney shift rolls the date forward one day, so the trigger
-- thinks the event is "tomorrow" on its real day and REJECTS the check-in.
-- The FE shows check-in open (UTC-pinned) while the DB rejects it -> a 1-day
-- FE/DB seam. Verified live: 5 future events at wall-hour >= 14 affected
-- (Trinity Beach 9-Jun, Whites Hill 13-Jun, Broken Head + Mordialloc 14-Jun,
-- Orleigh Park 21-Jun), ~66 registrants at risk of an unrecordable check-in.
--
-- THE FIX-DIRECTION TRAP (verified against all 5 events this session):
--   * (date_start AT TIME ZONE 'Australia/Sydney')::date  -> +1 day (WRONG)
--   * (date_start AT TIME ZONE collective.timezone)::date -> +1 day (WRONG, same roll)
--   * (date_start AT TIME ZONE 'UTC')::date               -> correct wall date
-- The "obvious" per-event-tz fix (which the dead event_effective_timezone()
-- helper and the 2026-05-12 migration comments invite) is ALSO wrong.
--
-- Correct model = HYBRID:
--   event calendar day = (date_start AT TIME ZONE 'UTC')::date   -- the stored wall date
--   "today"            = (now() AT TIME ZONE collective.timezone)::date  -- real today, in the event's locale
-- "today" must stay in the collective's real zone, NOT UTC: using UTC for
-- "today" too would block every MORNING east-coast check-in (e.g. an 8am
-- Brisbane event reads as 22:00Z the prior day, so UTC-today lags one day and
-- the FUTURE guard would fire). The collective-zone "today" is also the best
-- DB proxy for the checker-in's local day (they are physically at the event).
--
-- This migration changes ONLY the date computation in the three functions.
-- All other logic (service_role bypass, attended-direction gate, FUTURE block,
-- EVENT-DAY allow, PAST leader/admin gate, walk-in future blocks) is preserved
-- verbatim. LEFT JOIN + COALESCE keeps events with a NULL collective_id working.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. enforce_event_day_check_in_window (event_registrations BEFORE UPDATE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_event_day_check_in_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  event_date_local   date;
  today_local        date;
  event_collective   uuid;
  event_tz           text;
  is_attended_in     boolean;
  is_attended_out    boolean;
  is_leader_or_admin boolean;
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

  -- Floating-local: event calendar day = stored wall-clock day (UTC-pin).
  -- "today" = real today in the event's collective timezone.
  SELECT (e.date_start AT TIME ZONE 'UTC')::date,
         e.collective_id,
         COALESCE(c.timezone, 'Australia/Sydney')
    INTO event_date_local, event_collective, event_tz
    FROM public.events e
    LEFT JOIN public.collectives c ON c.id = e.collective_id
   WHERE e.id = NEW.event_id;

  IF event_date_local IS NULL THEN
    RAISE EXCEPTION 'Event not found for event_registrations.event_id=%', NEW.event_id
      USING ERRCODE = '23514';
  END IF;

  today_local := (now() AT TIME ZONE event_tz)::date;

  -- FUTURE: never allow check-in before the event happens (the 9-May fix).
  IF event_date_local > today_local THEN
    RAISE EXCEPTION
      'Check-in is not available before the day of the event. Event date: %, today: %.',
      event_date_local, today_local
      USING ERRCODE = '23514',
            HINT = 'Wait until the event date to check attendees in.';
  END IF;

  -- EVENT DAY: open to anyone (self check-in + leaders), unchanged.
  IF event_date_local = today_local THEN
    RETURN NEW;
  END IF;

  -- PAST: leader/admin always allowed; self check-in stays day-of only.
  is_leader_or_admin :=
        public.is_collective_leader_or_above(auth.uid(), event_collective)
     OR public.is_admin_or_staff(auth.uid());

  IF NOT is_leader_or_admin THEN
    RAISE EXCEPTION
      'Post-event check-in is available to event leaders and admins only.'
      USING ERRCODE = '23514',
            HINT = 'Ask your event leader to record this attendance.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2. enforce_walk_in_day_window (event_walk_ins BEFORE INSERT)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_walk_in_day_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  event_date_local date;
  today_local      date;
  event_tz         text;
BEGIN
  -- service_role bypass (covers public_form path + emergency back-fills).
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT (e.date_start AT TIME ZONE 'UTC')::date,
         COALESCE(c.timezone, 'Australia/Sydney')
    INTO event_date_local, event_tz
    FROM public.events e
    LEFT JOIN public.collectives c ON c.id = e.collective_id
   WHERE e.id = NEW.event_id;

  today_local := (now() AT TIME ZONE event_tz)::date;

  -- FUTURE: blocked.
  IF event_date_local > today_local THEN
    RAISE EXCEPTION 'Walk-ins cannot be recorded before the day of the event'
      USING ERRCODE = '22023';
  END IF;

  -- PAST and EVENT DAY: open. RLS gates leader role.
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. enforce_walk_in_mutation_window (event_walk_ins BEFORE DELETE OR UPDATE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_walk_in_mutation_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  event_date_local date;
  today_local      date;
  event_tz         text;
  ref_event_id     uuid;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  ref_event_id := COALESCE(NEW.event_id, OLD.event_id);

  SELECT (e.date_start AT TIME ZONE 'UTC')::date,
         COALESCE(c.timezone, 'Australia/Sydney')
    INTO event_date_local, event_tz
    FROM public.events e
    LEFT JOIN public.collectives c ON c.id = e.collective_id
   WHERE e.id = ref_event_id;

  today_local := (now() AT TIME ZONE event_tz)::date;

  IF event_date_local > today_local THEN
    RAISE EXCEPTION 'Walk-ins for a future event cannot be modified'
      USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
