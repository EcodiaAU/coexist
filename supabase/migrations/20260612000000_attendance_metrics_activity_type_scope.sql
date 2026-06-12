-- =====================================================================
-- Attendance metrics: add activity_type scope + classify Wild Mountain
-- events as camp_out
-- =====================================================================
-- Origin: Tate 2026-06-12. Two asks rolled into one migration because they
-- share the same fault surface (admin Insights filter not behaving as
-- advertised).
--
-- Ask 1 - "make sure Myall Park and Wild Mountain events are classed as
-- campouts in the co-exist database". DB probe found one Brisbane
-- "Wild Mountains Campout" carrying activity_type='other', and two
-- Northern Rivers "Wild Mountain[s] Retreat" carrying activity_type=
-- 'retreat'. Myall Park Outback Campout was already 'camp_out'. Flip the
-- three stragglers so the camp_out scope actually reflects reality.
--
-- Ask 2 - "the attendances and returned attendances numbers on the admin
-- insights page actually change when changing scopes". The Insights page
-- has three filters (date, collective, activity). Today the RPC
-- coexist_attendance_metrics is signed
--   (p_collective_ids uuid[], p_from date, p_to date)
-- so the activity_type dropdown is ornamental for every attendance,
-- recurrence, sign-in and registrations number. Adding p_activity_types
-- as a fourth scope arg, applied at scoped_events and at the prior-window
-- comparison, closes the gap.
--
-- Migration is idempotent: data update uses targeted IDs (UPDATE-IF-MATCH);
-- function is dropped-and-recreated with the new signature so callers using
-- positional args fail loudly rather than silently picking up the old one.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reclassify Myall Park + Wild Mountain events as campouts
-- ---------------------------------------------------------------------

UPDATE public.events
SET activity_type = 'camp_out'
WHERE id IN (
  'dfb68818-0cc0-58cf-845c-3f944d34170c',  -- Brisbane "Wild Mountains Campout" (was 'other')
  '4120c667-7c36-4eed-afe9-ef11ad514f23',  -- Northern Rivers "Wild Mountain Retreat" (was 'retreat')
  '836d6fc3-9dc3-4c44-9091-343a7f6f5326'   -- Northern Rivers "Wild Mountains Retreat" (was 'retreat')
)
AND activity_type <> 'camp_out';

-- Defensive catch-all: any future Myall Park or Wild Mountain* event that
-- isn't already a camp_out gets re-tagged. Narrow ILIKE so we don't
-- accidentally re-tag unrelated events ("wild" in any other context is
-- not in scope).
UPDATE public.events
SET activity_type = 'camp_out'
WHERE activity_type <> 'camp_out'
  AND (
        title ILIKE '%Myall Park%'
     OR title ILIKE '%Wild Mountain%'
     OR title ILIKE '%Wild Mountains%'
  );

-- ---------------------------------------------------------------------
-- 2. coexist_attendance_metrics: add activity_type scope
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.coexist_attendance_metrics(uuid[], date, date);

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
  per_person AS (
    SELECT pk, count(DISTINCT event_id) AS n
    FROM att GROUP BY pk
  ),
  -- prior-window cohort: people who attended an event of the SAME scope
  -- (collective + activity_type) before v_from. Without the activity_type
  -- filter here, narrowing to camp_out events would mis-label people as
  -- "returning" if they had ever attended any clean_up etc, even though
  -- this is their first camp_out.
  prior AS (
    SELECT DISTINCT pk FROM (
      SELECT r.user_id::text AS pk
      FROM public.event_registrations r
      JOIN public.events e ON e.id = r.event_id
      WHERE r.status='attended' AND r.user_id IS NOT NULL
        AND e.status IN ('published','completed')
        AND (p_collective_ids IS NULL OR e.collective_id = ANY(p_collective_ids))
        AND (p_activity_types IS NULL OR e.activity_type = ANY(p_activity_types))
        AND (e.date_start AT TIME ZONE 'UTC')::date < v_from
      UNION ALL
      SELECT COALESCE(w.linked_user_id::text, lower(NULLIF(w.email,'')), 'walkin:'||w.id::text)
      FROM public.event_walk_ins w
      JOIN public.events e ON e.id = w.event_id
      WHERE e.status IN ('published','completed')
        AND (p_collective_ids IS NULL OR e.collective_id = ANY(p_collective_ids))
        AND (p_activity_types IS NULL OR e.activity_type = ANY(p_activity_types))
        AND (e.date_start AT TIME ZONE 'UTC')::date < v_from
    ) q
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
    'new_attendees',     (SELECT count(*) FROM per_person pp WHERE pp.pk NOT IN (SELECT pk FROM prior)),
    'returning_attendees',(SELECT count(*) FROM per_person pp WHERE pp.pk IN (SELECT pk FROM prior)),
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
  'Canonical attendance + retention metrics engine. Scope = (collective_ids[], from, to, activity_types[]). Admin-only. Returns flat jsonb. Tate 2026-06-08, activity_type scope added 2026-06-12.';
