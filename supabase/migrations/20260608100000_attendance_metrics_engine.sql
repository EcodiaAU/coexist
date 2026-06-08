-- =====================================================================
-- Attendance + retention metrics engine
-- =====================================================================
-- Origin: Tate 2026-06-08, post Co-Exist team meeting. "Stop trying to do
-- branded reports and just nail the actual capability of surfacing metrics.
-- Literally all it is is different SQL queries, different scopes (time and
-- collectives) and different math on and between metrics. We need to surface
-- how many attendances at collective x's events between y and z dates and how
-- many of those returned once, twice, 4 times etc."
--
-- This is the canonical attendance/retention engine. One SECURITY DEFINER
-- function, scoped by (collective_ids[], from, to), returns a flat jsonb of
-- metrics. Callable two ways:
--   * app RPC  -> supabase.rpc('coexist_attendance_metrics', {...})  (admin UI)
--   * raw SQL  -> EcodiaOS via the Management API for ad-hoc questions
--
-- "Attendance" = event_registrations(status='attended') + event_walk_ins.
-- Person identity (for unique + retention):
--   registered -> user_id
--   walk-in    -> linked_user_id, else lower(email), else a per-row id
-- Event day uses the floating-local model: (date_start AT TIME ZONE 'UTC')::date
-- (the host wall-clock day), matching enforce_event_day_check_in_window.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.coexist_attendance_metrics(
  p_collective_ids uuid[] DEFAULT NULL,
  p_from           date   DEFAULT NULL,
  p_to             date   DEFAULT NULL
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
  -- Admin/staff only (the data carries user_id + walk-in PII). service_role and
  -- direct postgres (auth.role() null, e.g. Management API) bypass for EcodiaOS.
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
      AND (e.date_start AT TIME ZONE 'UTC')::date >= v_from
      AND (e.date_start AT TIME ZONE 'UTC')::date <= v_to
  ),
  -- one row per (person, event) attendance, tagged by source + collective
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
  -- people who attended one of the scope's collectives BEFORE the window
  -- (used for new-vs-returning relative to this scope)
  prior AS (
    SELECT DISTINCT pk FROM (
      SELECT r.user_id::text AS pk
      FROM public.event_registrations r
      JOIN public.events e ON e.id = r.event_id
      WHERE r.status='attended' AND r.user_id IS NOT NULL
        AND e.status IN ('published','completed')
        AND (p_collective_ids IS NULL OR e.collective_id = ANY(p_collective_ids))
        AND (e.date_start AT TIME ZONE 'UTC')::date < v_from
      UNION ALL
      SELECT COALESCE(w.linked_user_id::text, lower(NULLIF(w.email,'')), 'walkin:'||w.id::text)
      FROM public.event_walk_ins w
      JOIN public.events e ON e.id = w.event_id
      WHERE e.status IN ('published','completed')
        AND (p_collective_ids IS NULL OR e.collective_id = ANY(p_collective_ids))
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
    -- Follow-through: of everyone who registered for scoped events, how many
    -- actually signed in. 'registered' rows = signed up but not attended;
    -- 'attended' rows = signed up AND came. Walk-ins are excluded (no rego).
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
    -- avg over events that actually ran (in scope) vs over events that drew at
    -- least one attendee. The latter is usually the number execs mean.
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

REVOKE ALL ON FUNCTION public.coexist_attendance_metrics(uuid[], date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.coexist_attendance_metrics(uuid[], date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.coexist_attendance_metrics(uuid[], date, date) IS
  'Canonical attendance + retention metrics engine. Scope = (collective_ids[], from, to). Admin-only. Returns flat jsonb. Tate 2026-06-08.';
