-- =====================================================================
-- Collective + Event timezone awareness
-- =====================================================================
-- Origin: 2026-05-12. East-coast admins creating Perth events were
-- entering "10am" in a datetime-local picker that captures browser-local
-- time. Times got stored as if they were AEST, leaving Perth users with
-- events 2 hours early. This migration adds explicit IANA timezone
-- metadata so each collective owns its timezone, each event can override
-- (for travel/cross-state events), and the check-in-day guards honour
-- the event's actual local day instead of a hardcoded Sydney.
--
-- Approach:
--   1. collectives.timezone        text NOT NULL DEFAULT 'Australia/Sydney'
--      - Backfilled from state before the NOT NULL is enforced.
--   2. events.timezone             text NULLABLE
--      - NULL = inherit from collective. Set = per-event override.
--   3. One-shot backfill: shift WA collective events forward 2h so the
--      wall-clock time the east-coast admin originally typed lands at
--      the same wall-clock time in AWST. Per Tom: WA events have been
--      created by east-coast admins and are 2h early, so the +2h shift
--      restores intent.
--   4. Replace hardcoded 'Australia/Sydney' in the check-in-day triggers
--      with the event's effective timezone (event override > collective).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add timezone column to collectives, backfill, then enforce NOT NULL
-- ---------------------------------------------------------------------

ALTER TABLE public.collectives
  ADD COLUMN IF NOT EXISTS timezone text;

-- Backfill from state. Maps Australian state/territory abbreviations to
-- IANA zones. Any collective whose state we don't recognise falls back
-- to Australia/Sydney (matches the previous hardcoded behaviour).
UPDATE public.collectives
   SET timezone = CASE upper(coalesce(state, ''))
     WHEN 'WA'  THEN 'Australia/Perth'
     WHEN 'NT'  THEN 'Australia/Darwin'
     WHEN 'SA'  THEN 'Australia/Adelaide'
     WHEN 'QLD' THEN 'Australia/Brisbane'
     WHEN 'NSW' THEN 'Australia/Sydney'
     WHEN 'ACT' THEN 'Australia/Sydney'
     WHEN 'VIC' THEN 'Australia/Melbourne'
     WHEN 'TAS' THEN 'Australia/Hobart'
     ELSE 'Australia/Sydney'
   END
 WHERE timezone IS NULL;

ALTER TABLE public.collectives
  ALTER COLUMN timezone SET NOT NULL,
  ALTER COLUMN timezone SET DEFAULT 'Australia/Sydney';

COMMENT ON COLUMN public.collectives.timezone IS
  'IANA timezone (e.g. Australia/Perth) used as the default for events in this collective. '
  'Editable by national_leader/admin only via the admin panel.';

-- ---------------------------------------------------------------------
-- 2. Add timezone column to events (nullable = inherit collective)
-- ---------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.events.timezone IS
  'Optional per-event IANA timezone override. NULL means inherit from collectives.timezone. '
  'Set when a collective runs an event in a different timezone (travel, cross-state collab).';

-- Helper: effective timezone for an event (override > collective).
CREATE OR REPLACE FUNCTION public.event_effective_timezone(p_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(e.timezone, c.timezone, 'Australia/Sydney')
    FROM public.events e
    JOIN public.collectives c ON c.id = e.collective_id
   WHERE e.id = p_event_id;
$$;

COMMENT ON FUNCTION public.event_effective_timezone(uuid) IS
  'Resolves an event''s effective timezone: events.timezone override, else collectives.timezone, '
  'else Australia/Sydney fallback. Used by check-in-day triggers.';

-- ---------------------------------------------------------------------
-- 3. One-shot backfill: shift WA-collective events forward 2 hours.
--    Why: east-coast admins have been creating Perth events entering
--    the intended Perth wall-clock time, but the system interpreted it
--    as east-coast local. Shifting +2h restores the intent.
--    AEST is UTC+10, AWST is UTC+8 — the 2h gap is the bug magnitude.
--    Caveat: if an admin created the event while Sydney was on AEDT
--    (UTC+11, ~Oct–early Apr), the true intended drift is 3h. As of
--    2026-05-12 Sydney is on AEST so +2h is the correct value for the
--    current bug report. If we later discover events created during
--    DST window, those will need a separate +1h pass identified by
--    inspecting events.created_at against the AEDT calendar.
--    Scope: only events whose collective is now Australia/Perth and
--    whose date_start is still in the future (don't rewrite history).
-- ---------------------------------------------------------------------

DO $$
DECLARE
  shifted_count int;
BEGIN
  UPDATE public.events e
     SET date_start = e.date_start + interval '2 hours',
         date_end   = CASE WHEN e.date_end IS NULL THEN NULL
                           ELSE e.date_end + interval '2 hours'
                      END,
         updated_at = now()
   FROM public.collectives c
   WHERE e.collective_id = c.id
     AND c.timezone = 'Australia/Perth'
     AND e.date_start > now();

  GET DIAGNOSTICS shifted_count = ROW_COUNT;
  RAISE NOTICE 'Timezone backfill: shifted % future WA-collective events forward 2 hours.', shifted_count;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Rewrite check-in-day guards to use the event's effective timezone
--    instead of hardcoded Australia/Sydney.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_event_day_check_in_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_date_local date;
  today_local      date;
  event_tz         text;
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

  SELECT COALESCE(e.timezone, c.timezone, 'Australia/Sydney'),
         (e.date_start AT TIME ZONE COALESCE(e.timezone, c.timezone, 'Australia/Sydney'))::date
    INTO event_tz, event_date_local
    FROM public.events e
    JOIN public.collectives c ON c.id = e.collective_id
   WHERE e.id = NEW.event_id;

  IF event_date_local IS NULL THEN
    RAISE EXCEPTION 'Event not found for event_registrations.event_id=%', NEW.event_id
      USING ERRCODE = '23514';
  END IF;

  today_local := (now() AT TIME ZONE event_tz)::date;

  IF event_date_local <> today_local THEN
    RAISE EXCEPTION
      'Check-in is only available on the day of the event. Event date: % (%), today: %.',
      event_date_local, event_tz, today_local
      USING ERRCODE = '23514',
            HINT = 'Wait until the event date in the event''s timezone to check attendees in or out.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_event_day_check_in_window() IS
  'Prevents check-in / un-check-in unless events.date_start equals today in the event''s effective '
  'timezone (events.timezone override > collectives.timezone). service_role bypasses for manual fixes.';

CREATE OR REPLACE FUNCTION public.enforce_walk_in_day_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_date_local date;
  today_local      date;
  event_tz         text;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(e.timezone, c.timezone, 'Australia/Sydney'),
         (e.date_start AT TIME ZONE COALESCE(e.timezone, c.timezone, 'Australia/Sydney'))::date
    INTO event_tz, event_date_local
    FROM public.events e
    JOIN public.collectives c ON c.id = e.collective_id
   WHERE e.id = NEW.event_id;

  today_local := (now() AT TIME ZONE event_tz)::date;

  IF event_date_local IS DISTINCT FROM today_local THEN
    RAISE EXCEPTION 'Check-in only available on event day (% in %)', event_date_local, event_tz
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;
