-- =====================================================================
-- Attendance metrics: make "returning" mean something on every view,
-- and expose an explicit return_rate_pct.
-- =====================================================================
-- Origin: Tate 2026-07-15. Admin Insights "Attendance & recurrence"
-- showed "0 returning people". Kurt needs to see the return rate and
-- have it actually mean something.
--
-- Root cause: new_attendees / returning_attendees were a PRIOR-WINDOW
-- cohort - attended inside the window AND attended before v_from. On the
-- default all-collectives / all-time view p_from is NULL, floored to
-- 2000-01-01, so nobody predates the window and returning collapses to a
-- structural 0 - even though 178 people came to 2+ events. Two divergent
-- definitions of "returning" lived on the same page (the prior-window
-- RPC field, forced to 0, next to a client-side "Came back (2+ events)"
-- that read 178). See memory
-- coexist-insights-returning-zero-and-cookie-gating-2026-06-18: the open
-- decision pinned to Tate was "confirm 'came 2+ ever' is the intended
-- all-time definition". Tate 2026-07-15 confirmed it: return rate =
-- people who attended 2+ events / unique people (his hand calc:
-- 178/637 = 28%).
--
-- Fix (canonical, unconditional - NOT an all-time special case, which
-- would just create a third conflicting definition):
--   new_attendees       = people who attended exactly 1 event in-window
--   returning_attendees = people who attended 2+ events in-window
--   return_rate_pct      = round(100 * returning / unique)
-- This is self-consistent (new + returning = unique on every window),
-- matches the recurrence table exactly (returning == sum of the 2+ rows),
-- and is meaningful all-time AND for any bounded window. The prior-window
-- CTE is dropped - it was the whole source of the confusion.
--
-- Signature is unchanged, so this is a pure CREATE OR REPLACE. Idempotent.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.coexist_attendance_metrics(
  p_collective_ids uuid[]                      DEFAULT NULL,
  p_from           date                        DEFAULT NULL,
  p_to             date                        DEFAULT NULL,
  p_activity_types public.activity_type[]      DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(p_from, '2000-01-01'::date);
  v_to   date := COALESCE(p_to,   '2999-12-31'::date);
  result jsonb;
BEGIN
  IF NOT (
       auth.role() IS NULL
    OR auth.role() = 'service_role'
    OR public.is_admin_or_staff(auth.uid())
  ) THEN
    RAISE EXCEPTION 'coexist_attendance_metrics is admin-only'
      USING ERRCODE = '42501';
  END IF;

  WITH scoped_events AS (
    SELECT e.id,
           e.collective_id,
           (e.date_start AT TIME ZONE 'UTC')::date AS event_day
    FROM public.events e
    WHERE e.status IN ('published','completed')
      AND (p_collective_ids IS NULL OR e.collective_id = ANY(p_collective_ids))
      AND (p_activity_types IS NULL OR e.activity_type = ANY(p_activity_types))
      AND (e.date_start AT TIME ZONE 'UTC')::date >= v_from
      AND (e.date_start AT TIME ZONE 'UTC')::date <= v_to
  ),
  att AS (
    SELECT r.user_id::text AS pk, 'registered'::text AS src, se.id AS event_id, se.collective_id
    FROM public.event_registrations r
    JOIN scoped_events se ON se.id = r.event_id
    WHERE r.status = 'attended' AND r.user_id IS NOT NULL
    UNION ALL
    SELECT COALESCE(w.linked_user_id::text, lower(NULLIF(w.email,'')), 'walkin:'||w.id::text),
           'walkin', se.id, se.collective_id
    FROM public.event_walk_ins w
    JOIN scoped_events se ON se.id = w.event_id
  ),
  -- in-window recurrence: how many DISTINCT events each person attended
  -- inside the selected scope. This single CTE now drives new / returning
  -- / return_rate / the full recurrence table, so every "came back" number
  -- on the page ties out to the same population.
  per_person AS (
    SELECT pk, count(DISTINCT event_id) AS n
    FROM att GROUP BY pk
  ),
  per_collective AS (
    SELECT a.collective_id,
           c.name AS collective_name,
           count(DISTINCT a.event_id) AS events,
           count(*) AS attendances,
           count(DISTINCT a.pk) AS unique_attendees
    FROM att a
    LEFT JOIN public.collectives c ON c.id = a.collective_id
    GROUP BY a.collective_id, c.name
    ORDER BY count(*) DESC
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'collective_ids', to_jsonb(p_collective_ids),
      'activity_types', to_jsonb(p_activity_types),
      'from', v_from,
      'to', v_to,
      'collective_names', COALESCE((
        SELECT jsonb_agg(name ORDER BY name) FROM public.collectives
        WHERE p_collective_ids IS NOT NULL AND id = ANY(p_collective_ids)
      ), '[]'::jsonb)
    ),
    'events_in_scope',         (SELECT count(*) FROM scoped_events),
    'events_with_attendance',  (SELECT count(DISTINCT event_id) FROM att),
    'total_attendances',       (SELECT count(*) FROM att),
    'unique_attendees',        (SELECT count(*) FROM per_person),
    'registered_attendances',  (SELECT count(*) FROM att WHERE src='registered'),
    'walkin_attendances',      (SELECT count(*) FROM att WHERE src='walkin'),
    'registrations', (
      SELECT count(*) FROM public.event_registrations r
      JOIN scoped_events se ON se.id = r.event_id
      WHERE r.status IN ('registered','attended')
    ),
    'signins', (SELECT count(*) FROM att WHERE src='registered'),
    'followthrough_pct', (
      SELECT CASE WHEN reg.n = 0 THEN 0
             ELSE round(100.0 * (SELECT count(*) FROM att WHERE src='registered') / reg.n, 1) END
      FROM (
        SELECT count(*) AS n FROM public.event_registrations r
        JOIN scoped_events se ON se.id = r.event_id
        WHERE r.status IN ('registered','attended')
      ) reg
    ),
    'avg_attendance_per_event', (
      SELECT CASE WHEN count(*)=0 THEN 0
             ELSE round((SELECT count(*) FROM att)::numeric / count(*), 2) END
      FROM scoped_events
    ),
    'avg_attendance_per_active_event', (
      SELECT CASE WHEN count(DISTINCT event_id)=0 THEN 0
             ELSE round(count(*)::numeric / count(DISTINCT event_id), 2) END
      FROM att
    ),
    -- new = first-timers in this window (attended exactly 1 event);
    -- returning = came to 2+ events in this window. new + returning ==
    -- unique_attendees, always.
    'new_attendees',      (SELECT count(*) FROM per_person WHERE n=1),
    'returning_attendees',(SELECT count(*) FROM per_person WHERE n>=2),
    -- headline return rate Kurt can read at a glance: share of unique
    -- people who came back for a second event or more.
    'return_rate_pct', (
      SELECT CASE WHEN count(*)=0 THEN 0
             ELSE round(100.0 * count(*) FILTER (WHERE n>=2) / count(*)) END
      FROM per_person
    ),
    'retention', jsonb_build_object(
      'attended_1',       (SELECT count(*) FROM per_person WHERE n=1),
      'attended_2',       (SELECT count(*) FROM per_person WHERE n=2),
      'attended_3',       (SELECT count(*) FROM per_person WHERE n=3),
      'attended_4_to_5',  (SELECT count(*) FROM per_person WHERE n BETWEEN 4 AND 5),
      'attended_6_plus',  (SELECT count(*) FROM per_person WHERE n>=6),
      'avg_events_per_attendee', (SELECT COALESCE(round(avg(n),2),0) FROM per_person),
      'max_events_by_one_person',(SELECT COALESCE(max(n),0) FROM per_person)
    ),
    'per_collective', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'collective_id', collective_id,
        'name', collective_name,
        'events', events,
        'attendances', attendances,
        'unique_attendees', unique_attendees
      )) FROM per_collective
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.coexist_attendance_metrics(uuid[], date, date, public.activity_type[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.coexist_attendance_metrics(uuid[], date, date, public.activity_type[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.coexist_attendance_metrics(uuid[], date, date, public.activity_type[]) IS
  'Canonical attendance + retention metrics engine. Scope = (collective_ids[], from, to, activity_types[]). Admin-only. new/returning/return_rate are in-window (returning = attended 2+ events in scope). Tate 2026-06-08; activity_type scope 2026-06-12; in-window returning + return_rate_pct 2026-07-15.';
