-- =====================================================================
-- Per-activity legacy distribution helper for proportional baseline split
-- =====================================================================
-- Origin: Tate 2026-06-12 common-sense matrix-correctness probe. On the
-- admin Insights page, All Time / All Types showed 6,008.4 kg rubbish but
-- the sum across every per-activity-scoped view was 3,378.3 kg - a
-- 2,630 kg silent gap. The gap is the baseline_remainder
-- (max(0, BASELINE - sum_of_legacy_rows)) that useImpactObservations
-- only adds when no activity_type is selected.
--
-- Fix shape Tate chose: distribute the baseline_remainder across activity
-- types in proportion to the legacy-row distribution per metric. Slight
-- provenance fiction (pre-2026 unimported history is inferred to follow
-- the same shape as the imported subset) but it reconciles the math -
-- sum_across_activities == All Types view, which is the funder-friendly
-- shape grant acquittals need.
--
-- This RPC returns the legacy distribution per activity_type so the hook
-- can compute the proportional share without re-querying event_impact for
-- every event in the catalog.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.coexist_impact_legacy_by_activity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT (
       auth.role() IS NULL
    OR auth.role() = 'service_role'
    OR public.is_admin_or_staff(auth.uid())
  ) THEN
    RAISE EXCEPTION 'coexist_impact_legacy_by_activity is admin-only'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'event_count', coalesce(sum(event_count), 0),
      'attendees',   coalesce(sum(attendees),   0),
      'hours',       coalesce(sum(hours),       0),
      'trees',       coalesce(sum(trees),       0),
      'rubbish',     coalesce(sum(rubbish),     0)
    ),
    'by_activity', coalesce(jsonb_object_agg(activity_type, jsonb_build_object(
      'event_count', event_count,
      'attendees',   attendees,
      'hours',       hours,
      'trees',       trees,
      'rubbish',     rubbish
    )), '{}'::jsonb)
  )
  INTO result
  FROM (
    SELECT e.activity_type::text AS activity_type,
           count(DISTINCT ei.event_id)                       AS event_count,
           coalesce(sum(ei.attendees), 0)::int               AS attendees,
           coalesce(round(sum(ei.hours_total)::numeric, 1), 0) AS hours,
           coalesce(sum(ei.trees_planted), 0)::int           AS trees,
           coalesce(round(sum(ei.rubbish_kg)::numeric, 1), 0)  AS rubbish
    FROM public.event_impact ei
    JOIN public.events e ON e.id = ei.event_id
    WHERE e.status IN ('published','completed')
      AND ei.notes LIKE 'Legacy import:%'
    GROUP BY e.activity_type
  ) q;

  RETURN coalesce(result, jsonb_build_object('totals', '{}'::jsonb, 'by_activity', '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.coexist_impact_legacy_by_activity() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.coexist_impact_legacy_by_activity() TO authenticated, service_role;

COMMENT ON FUNCTION public.coexist_impact_legacy_by_activity() IS
  'Per-activity legacy event_impact distribution (event_count, attendees, hours, trees, rubbish) plus totals. Used by useImpactObservations to compute the proportional baseline_remainder share when an activity_type filter is active. Tate 2026-06-12.';
