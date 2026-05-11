-- =============================================================================
-- Platform impact baseline + get_platform_impact_stats() RPC
--
-- Worker 1 of the 1.8.5 baseline wave (fork_mp0odofn_8f8109).
--
-- PURPOSE:
--   Every surface that shows aggregate impact numbers must return
--   BASELINE_2022_2025 + LIVE_2026 so historical impact is never lost.
--
-- BASELINE VALUES (Tate-stated, 2026-01-01):
--   attendees   5,500    (verbatim)
--   trees       35,000   (verbatim)
--   rubbish_kg  4,900    (verbatim: "4.9t"; corrects previous value of 4,794)
--   hours       11,000   (carried from existing app_settings row)
--   events      340      (carried from existing app_settings row -- FLAG for Tate)
--
-- ESTIMATED BASELINES (derived from historical sheet sums 2022-2025;
--   Tate to confirm/correct):
--   collectives    11
--   beach_cleanups 141  (61 from 2024 + 80 from 2025)
--   tree_plantings  32  (10 from 2024 + 22 from 2025)
--   nature_hikes    85  (31 from 2024 + 54 from 2025)
--
-- RULE: Per-collective scoped queries (get_collective_stats) are NOT touched.
--       Baseline is global only.
-- =============================================================================

-- ── 1. Upsert baseline rows in app_settings ─────────────────────────────────

-- Correct rubbish baseline: 4794 → 4900 (Tate verbatim "4.9t")
INSERT INTO app_settings (key, value)
VALUES ('impact_baseline_rubbish_kg', '{"count": 4900}')
ON CONFLICT (key) DO UPDATE SET value = '{"count": 4900}';

-- Add missing estimated baselines
INSERT INTO app_settings (key, value)
VALUES ('impact_baseline_collectives', '{"count": 11}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO app_settings (key, value)
VALUES ('impact_baseline_beach_cleanups', '{"count": 141}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO app_settings (key, value)
VALUES ('impact_baseline_tree_plantings', '{"count": 32}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO app_settings (key, value)
VALUES ('impact_baseline_nature_hikes', '{"count": 85}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- ── 2. Create get_platform_impact_stats() RPC ────────────────────────────────
--
-- Returns a single jsonb row with:
--   - headline totals  (baseline + live_2026)
--   - event-type breakdowns
--   - live_* and baseline_* fields for auditability
--
-- Collectives: GREATEST(live_active, baseline) because this is an
--   ever-active count, not additive (collectives don't "disappear" into history).
--
-- Per-collective scoped queries MUST NOT call this function.

CREATE OR REPLACE FUNCTION get_platform_impact_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  -- baselines (read from app_settings; fall back to hardcoded values)
  b_attendees      int;
  b_trees          int;
  b_rubbish_kg     numeric;
  b_events         int;
  b_hours          numeric;
  b_collectives    int;
  b_beach_cleanups int;
  b_tree_plantings int;
  b_nature_hikes   int;

  -- live 2026 aggregates
  l_attendees      bigint;
  l_trees          bigint;
  l_rubbish_kg     numeric;
  l_events         bigint;
  l_hours          numeric;
  l_collectives    bigint;
  l_beach_cleanups bigint;
  l_tree_plantings bigint;
  l_nature_hikes   bigint;
BEGIN
  -- ── Read baselines from app_settings ──────────────────────────────────────
  SELECT COALESCE(((value->>'count'))::int, 5500)
    INTO b_attendees FROM app_settings WHERE key = 'impact_baseline_attendees';
  b_attendees := COALESCE(b_attendees, 5500);

  SELECT COALESCE(((value->>'count'))::int, 35000)
    INTO b_trees FROM app_settings WHERE key = 'impact_baseline_trees';
  b_trees := COALESCE(b_trees, 35000);

  SELECT COALESCE(((value->>'count'))::numeric, 4900)
    INTO b_rubbish_kg FROM app_settings WHERE key = 'impact_baseline_rubbish_kg';
  b_rubbish_kg := COALESCE(b_rubbish_kg, 4900);

  SELECT COALESCE(((value->>'count'))::int, 340)
    INTO b_events FROM app_settings WHERE key = 'impact_baseline_events';
  b_events := COALESCE(b_events, 340);

  SELECT COALESCE(((value->>'count'))::numeric, 11000)
    INTO b_hours FROM app_settings WHERE key = 'impact_baseline_hours';
  b_hours := COALESCE(b_hours, 11000);

  SELECT COALESCE(((value->>'count'))::int, 11)
    INTO b_collectives FROM app_settings WHERE key = 'impact_baseline_collectives';
  b_collectives := COALESCE(b_collectives, 11);

  SELECT COALESCE(((value->>'count'))::int, 141)
    INTO b_beach_cleanups FROM app_settings WHERE key = 'impact_baseline_beach_cleanups';
  b_beach_cleanups := COALESCE(b_beach_cleanups, 141);

  SELECT COALESCE(((value->>'count'))::int, 32)
    INTO b_tree_plantings FROM app_settings WHERE key = 'impact_baseline_tree_plantings';
  b_tree_plantings := COALESCE(b_tree_plantings, 32);

  SELECT COALESCE(((value->>'count'))::int, 85)
    INTO b_nature_hikes FROM app_settings WHERE key = 'impact_baseline_nature_hikes';
  b_nature_hikes := COALESCE(b_nature_hikes, 85);

  -- ── Live 2026 impact rows (non-legacy, post-baseline) ─────────────────────
  SELECT
    COALESCE(SUM(ei.attendees),     0),
    COALESCE(SUM(ei.trees_planted), 0),
    COALESCE(SUM(ei.rubbish_kg),    0),
    COALESCE(SUM(ei.hours_total),   0)
  INTO l_attendees, l_trees, l_rubbish_kg, l_hours
  FROM event_impact ei
  JOIN events e ON e.id = ei.event_id
  WHERE e.date_start >= '2026-01-01'
    AND e.status IN ('published', 'completed')
    AND e.date_start < NOW()
    AND (ei.notes IS NULL OR ei.notes NOT LIKE 'Legacy import:%');

  -- ── Live 2026 event count ─────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO l_events
  FROM events
  WHERE date_start >= '2026-01-01'
    AND status IN ('published', 'completed')
    AND date_start < NOW();

  -- ── Live active collectives (exclude national placeholder) ─────────────────
  SELECT COUNT(*)
  INTO l_collectives
  FROM collectives
  WHERE is_active = true
    AND (is_national IS NULL OR is_national = false);

  -- ── Live 2026 event-type counts ───────────────────────────────────────────
  SELECT COUNT(*)
  INTO l_beach_cleanups
  FROM events
  WHERE date_start >= '2026-01-01'
    AND status IN ('published', 'completed')
    AND date_start < NOW()
    AND activity_type IN ('clean_up', 'shore_cleanup');

  SELECT COUNT(*)
  INTO l_tree_plantings
  FROM events
  WHERE date_start >= '2026-01-01'
    AND status IN ('published', 'completed')
    AND date_start < NOW()
    AND activity_type = 'tree_planting';

  SELECT COUNT(*)
  INTO l_nature_hikes
  FROM events
  WHERE date_start >= '2026-01-01'
    AND status IN ('published', 'completed')
    AND date_start < NOW()
    AND activity_type IN ('nature_hike', 'nature_walk');

  -- ── Return combined totals ────────────────────────────────────────────────
  RETURN jsonb_build_object(
    -- headline totals (baseline + live_2026)
    'attendees',          l_attendees + b_attendees,
    'trees_planted',      l_trees + b_trees,
    'rubbish_kg',         ROUND((l_rubbish_kg + b_rubbish_kg)::numeric, 1),
    'events_held',        l_events + b_events,
    'volunteer_hours',    ROUND((l_hours + b_hours)::numeric, 0),
    -- collectives: ever-active, not additive
    'collectives',        GREATEST(l_collectives, b_collectives::bigint),
    -- event-type totals (baseline + live_2026)
    'beach_cleanups',     l_beach_cleanups + b_beach_cleanups,
    'tree_plantings',     l_tree_plantings + b_tree_plantings,
    'nature_hikes',       l_nature_hikes + b_nature_hikes,
    -- audit fields: live_2026 raw values
    'live_attendees',     l_attendees,
    'live_trees',         l_trees,
    'live_rubbish_kg',    ROUND(l_rubbish_kg::numeric, 1),
    'live_events',        l_events,
    'live_hours',         ROUND(l_hours::numeric, 0),
    'live_collectives',   l_collectives,
    -- audit fields: baseline raw values
    'baseline_attendees',      b_attendees,
    'baseline_trees',          b_trees,
    'baseline_rubbish_kg',     b_rubbish_kg,
    'baseline_events',         b_events,
    'baseline_as_of',          '2026-01-01'
  );
END;
$$;

-- ── 3. Grant execute to anon + authenticated ─────────────────────────────────
GRANT EXECUTE ON FUNCTION get_platform_impact_stats() TO anon, authenticated;
