-- Multi-host attribution for get_collective_stats RPC.
--
-- Before: aggregated event_impact rows joined directly via events.collective_id,
-- so co-hosted events were credited only to the primary host and other hosts
-- got nothing.
--
-- After: aggregates via event_hosts so co-hosts are credited too, and applies
-- per-host share weighting so the per-collective totals across all hosts add
-- back to the full event total without double counting nationally.
--
-- Share rule (matches the TS shareValue() helper):
--   Each host's share of an integer value V across N hosts is FLOOR(V / N),
--   plus 1 if the host's host_index < (V mod N). The first `remainder` hosts
--   absorb the rounding so the per-host portions sum to V exactly. No
--   fractional units are ever returned.

CREATE OR REPLACE FUNCTION get_collective_stats(p_collective_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'member_count', (
      SELECT COUNT(*) FROM collective_members
      WHERE collective_id = p_collective_id AND status = 'active'
    ),
    'event_count', (
      SELECT COUNT(*) FROM event_hosts eh
      JOIN events ev ON ev.id = eh.event_id
      WHERE eh.collective_id = p_collective_id
        AND ev.status IN ('published', 'completed')
    ),
    'trees_planted', COALESCE(SUM(
      CASE WHEN ei.trees_planted IS NULL THEN 0
        ELSE FLOOR(ei.trees_planted::numeric / eh.host_count)
             + CASE WHEN eh.host_index < (ei.trees_planted::int % eh.host_count) THEN 1 ELSE 0 END
      END
    ), 0),
    'rubbish_kg', COALESCE(SUM(
      -- Decimal metric: scale to thousandths so we can apply integer share
      -- math, then scale back. Keeps the same "no fractional units shown"
      -- contract — callers round once at render time.
      CASE WHEN ei.rubbish_kg IS NULL THEN 0
        ELSE (FLOOR(ROUND(ei.rubbish_kg::numeric * 1000)::int / eh.host_count)
              + CASE WHEN eh.host_index < (ROUND(ei.rubbish_kg::numeric * 1000)::int % eh.host_count) THEN 1 ELSE 0 END
             )::numeric / 1000
      END
    ), 0),
    'coastline_cleaned_m', COALESCE(SUM(
      CASE WHEN ei.coastline_cleaned_m IS NULL THEN 0
        ELSE FLOOR(ROUND(ei.coastline_cleaned_m::numeric)::int / eh.host_count)
             + CASE WHEN eh.host_index < (ROUND(ei.coastline_cleaned_m::numeric)::int % eh.host_count) THEN 1 ELSE 0 END
      END
    ), 0),
    'hours_total', COALESCE(SUM(
      CASE WHEN ei.hours_total IS NULL THEN 0
        ELSE FLOOR(ROUND(ei.hours_total::numeric)::int / eh.host_count)
             + CASE WHEN eh.host_index < (ROUND(ei.hours_total::numeric)::int % eh.host_count) THEN 1 ELSE 0 END
      END
    ), 0),
    'area_restored_sqm', COALESCE(SUM(
      CASE WHEN ei.area_restored_sqm IS NULL THEN 0
        ELSE FLOOR(ROUND(ei.area_restored_sqm::numeric)::int / eh.host_count)
             + CASE WHEN eh.host_index < (ROUND(ei.area_restored_sqm::numeric)::int % eh.host_count) THEN 1 ELSE 0 END
      END
    ), 0),
    'native_plants', COALESCE(SUM(
      CASE WHEN ei.native_plants IS NULL THEN 0
        ELSE FLOOR(ei.native_plants::numeric / eh.host_count)
             + CASE WHEN eh.host_index < (ei.native_plants::int % eh.host_count) THEN 1 ELSE 0 END
      END
    ), 0),
    'wildlife_sightings', COALESCE(SUM(
      CASE WHEN ei.wildlife_sightings IS NULL THEN 0
        ELSE FLOOR(ei.wildlife_sightings::numeric / eh.host_count)
             + CASE WHEN eh.host_index < (ei.wildlife_sightings::int % eh.host_count) THEN 1 ELSE 0 END
      END
    ), 0),
    'invasive_weeds_pulled', COALESCE(SUM(
      CASE WHEN ei.invasive_weeds_pulled IS NULL THEN 0
        ELSE FLOOR(ei.invasive_weeds_pulled::numeric / eh.host_count)
             + CASE WHEN eh.host_index < (ei.invasive_weeds_pulled::int % eh.host_count) THEN 1 ELSE 0 END
      END
    ), 0),
    'attendance_rate', (
      WITH events_for_collective AS (
        SELECT eh2.event_id
        FROM event_hosts eh2
        JOIN events ev2 ON ev2.id = eh2.event_id
        WHERE eh2.collective_id = p_collective_id
          AND ev2.status IN ('published', 'completed')
      ),
      reg AS (
        SELECT COUNT(*)::numeric AS n
        FROM event_registrations er
        WHERE er.event_id IN (SELECT event_id FROM events_for_collective)
          AND er.status IN ('registered', 'attended')
      ),
      att AS (
        SELECT COUNT(*)::numeric AS n
        FROM event_registrations er
        WHERE er.event_id IN (SELECT event_id FROM events_for_collective)
          AND er.status = 'attended'
      )
      SELECT CASE
        WHEN (SELECT n FROM reg) = 0 THEN 0
        ELSE ROUND((SELECT n FROM att) / (SELECT n FROM reg), 2)
      END
    )
  ) INTO result
  FROM event_hosts eh
  JOIN events e ON e.id = eh.event_id
  LEFT JOIN event_impact ei ON ei.event_id = e.id
    AND (ei.notes IS NULL OR ei.notes NOT LIKE 'Legacy import:%')
  WHERE eh.collective_id = p_collective_id
    AND e.status IN ('published', 'completed');

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
