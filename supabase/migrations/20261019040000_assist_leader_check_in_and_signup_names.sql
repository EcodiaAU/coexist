-- 2026-10-19 (Jess Ditchfield via Tate, lane J750)
--
-- 1. An assist leader can check people in after the event day, and on a
--    sign-ups-closed or externally booked event, exactly as a leader or
--    co-leader can.
--
--    Jess asked whether a Brisbane leader could not be signed in at the North
--    Stradbroke Island trip "because he's an assistant leader". On the day,
--    no: the block was that he had unregistered, and that was a client rule
--    (fixed in the app the same day). But two triggers DID treat the tiers
--    differently, because they asked is_collective_leader_or_above(), which
--    counts leader and co_leader and leaves assist_leader out:
--      - enforce_event_day_check_in_window refused an assist leader's
--        post-event check-in with 23514, while the event-day page told them
--        "leaders keep full control after the event";
--      - handle_event_registration treated an assist leader's door check-in on
--        a sign-ups-closed (or externally booked) event as an untrusted claim
--        and demoted it to 'waitlisted', which the page reported as success.
--    Proven before this migration with a rolled-back pair as the QA fixture
--    seated assist_leader: past-event check-in ERR 23514, closed-event check-in
--    landed 'waitlisted'. Controls (the participant's own self check-in) were
--    refused and waitlisted, and must stay so.
--
--    is_collective_staff() (leader, co_leader, assist_leader, active seat) is
--    ADDED beside the existing checks; nothing is removed, so no caller loses
--    access. is_collective_leader_or_above() itself is NOT changed: it backs
--    18 policies (event create/edit, impact logging and more) whose tiering is
--    a Co-Exist product decision, not a sign-in fix.
--
-- 2. handle_new_user copies first_name and last_name from sign-up metadata.
--    Last name is now mandatory on the sign-up form, which sends both halves
--    as user metadata. Copying them here lands them in the same transaction
--    that creates the profile. NULLIF keeps an older bundle (no name fields)
--    writing NULL, exactly as before.
--
-- Each body below is the live pg_get_functiondef as of 2026-10-19 with only
-- the marked lines changed.

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
  -- CHANGED 2026-10-19: every leader tier, assist_leader included.
  is_leader_or_admin :=
        public.is_collective_leader_or_above(auth.uid(), event_collective)
     OR public.is_collective_staff(auth.uid(), event_collective)
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
  -- CHANGED 2026-10-19: every leader tier, assist_leader included.
  IF v_external IS NOT NULL THEN
    v_privileged := auth.role() IS NULL
                 OR auth.role() = 'service_role'
                 OR public.is_collective_leader_or_above(auth.uid(), v_collective)
                 OR public.is_collective_staff(auth.uid(), v_collective)
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
  -- CHANGED 2026-10-19: every leader tier, assist_leader included.
  IF v_closed IS TRUE THEN
    v_privileged := auth.role() IS NULL
                 OR auth.role() = 'service_role'
                 OR public.is_collective_leader_or_above(auth.uid(), v_collective)
                 OR public.is_collective_staff(auth.uid(), v_collective)
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CHANGED 2026-10-19: first_name / last_name from sign-up metadata.
  INSERT INTO public.profiles (id, display_name, first_name, last_name, avatar_url, date_of_birth)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULLIF(btrim(NEW.raw_user_meta_data->>'first_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'last_name'), ''),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN NEW.raw_user_meta_data->>'date_of_birth' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'date_of_birth')::date
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$function$;
