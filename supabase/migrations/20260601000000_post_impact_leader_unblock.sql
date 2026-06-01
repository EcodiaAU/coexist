-- =====================================================================
-- Leader / admin always-on post-event authority
-- =====================================================================
-- Origin: 2026-06-01, Tate verbatim P0.
--   "I cant uncheckin someone that I added as a walkin to an event after
--    the event has ended and even more important, after the event i cant
--    check someone in that was registered but that hadnt checked in."
--
-- The 2026-05-20 backfill design said `event_impact` existing finalises
-- attendance and closes the window. Real-world leader workflow proved
-- this too rigid: attendees come back days later to say "I never got
-- checked in", or a walk-in needs to be undone after impact has been
-- entered. Leaders/admins ARE the source of truth for who attended; they
-- need authority post-impact.
--
-- Decision: leader/admin get full authority over event_registrations
-- check-in / un-check-in AND event_walk_ins insert / update / delete
-- after the event day, regardless of impact_logged. The future-block on
-- both tables stays (the 2026-05-09 wrong-day fix). Self check-in (3-digit
-- code, public QR Edge Function) stays day-of only.
--
-- Stats can drift if leaders mutate post-impact; that is fine because
-- (a) source rows are the truth and aggregates re-derive, (b) the
-- alternative (locking the leader out) blocks legitimate corrections.
--
-- This migration:
--   1. Rewrites enforce_event_day_check_in_window to drop the
--      impact_logged hard-block for leader/admin past-event mutations.
--   2. Rewrites enforce_walk_in_day_window to drop the impact_logged
--      hard-block for past-event walk-in INSERTs (RLS already gates the
--      leader role).
--   3. Adds a DELETE RLS policy on event_walk_ins for leader/admin so
--      walk-ins can be undone after the event.
--   4. Adds enforce_walk_in_day_window guard on UPDATE + DELETE (future
--      mutations blocked; past mutations open for leader/admin).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. event_registrations: relax impact_logged block for leader/admin
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

  -- PAST: leader/admin always allowed. The impact_logged block from
  -- 2026-05-20 is gone (Tate 2026-06-01: leaders need post-impact
  -- authority for corrections). Self check-in (own row) stays day-of
  -- only by excluding the own-row path here.
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
$$;

COMMENT ON FUNCTION public.enforce_event_day_check_in_window() IS
  'Check-in window guard for event_registrations. Future check-in blocked '
  '(2026-05-09); event-day open to all; after the event day, open to '
  'collective leaders/admins (self check-in stays day-of). impact_logged '
  'gate dropped 2026-06-01 per Tate: leaders need post-impact authority '
  'for late-arriving corrections. service_role bypasses.';

-- ---------------------------------------------------------------------
-- 2. event_walk_ins: relax impact_logged on INSERT
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_walk_in_day_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_date_aest date;
  today_aest      date;
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

  -- PAST and EVENT DAY: open. RLS gates leader role.
  -- impact_logged block dropped 2026-06-01 per Tate.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_walk_in_day_window() IS
  'Walk-in INSERT guard for event_walk_ins. Future blocked (2026-05-09); '
  'event-day + past open. RLS gates the leader role. service_role bypass '
  'keeps the public QR Edge Function path day-of via its own date guard. '
  'impact_logged gate dropped 2026-06-01 per Tate.';

-- ---------------------------------------------------------------------
-- 3. event_walk_ins: DELETE policy for leader/admin
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS event_walk_ins_delete_leader ON public.event_walk_ins;

CREATE POLICY event_walk_ins_delete_leader
  ON public.event_walk_ins
  FOR DELETE
  USING (
    public.is_collective_staff(
      auth.uid(),
      (SELECT e.collective_id FROM public.events e WHERE e.id = event_walk_ins.event_id)
    )
    OR public.is_admin_or_staff(auth.uid())
  );

-- ---------------------------------------------------------------------
-- 4. event_walk_ins: future-block on UPDATE + DELETE
-- ---------------------------------------------------------------------
-- Without this a leader could DELETE a walk-in row for a future event and
-- skirt the future-block via a no-op cycle. Block future mutations
-- mirroring the INSERT guard; past/present open.

CREATE OR REPLACE FUNCTION public.enforce_walk_in_mutation_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_date_aest date;
  today_aest      date;
  ref_event_id    uuid;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  ref_event_id := COALESCE(NEW.event_id, OLD.event_id);

  SELECT (date_start AT TIME ZONE 'Australia/Sydney')::date
    INTO event_date_aest
    FROM events
   WHERE id = ref_event_id;

  today_aest := (now() AT TIME ZONE 'Australia/Sydney')::date;

  IF event_date_aest > today_aest THEN
    RAISE EXCEPTION 'Walk-ins for a future event cannot be modified'
      USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_walk_in_mutation_window ON public.event_walk_ins;

CREATE TRIGGER trg_enforce_walk_in_mutation_window
  BEFORE UPDATE OR DELETE ON public.event_walk_ins
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_walk_in_mutation_window();

COMMENT ON FUNCTION public.enforce_walk_in_mutation_window() IS
  'Walk-in UPDATE/DELETE guard: future events blocked (mirrors the INSERT '
  'future-block); event-day + past open for leader/admin. service_role '
  'bypass. 2026-06-01.';
