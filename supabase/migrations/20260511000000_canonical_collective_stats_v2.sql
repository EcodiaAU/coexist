-- Extend get_collective_stats with leaders_current + leaders_lifetime fields.
--
-- Background: app_settings.leaders_empowered:<collective_id> was a manually-curated
-- static counter used by leader dashboard + collective impact hooks. It is stale
-- (Brisbane showed 16 while only 9 active leaders exist) and has no automated update
-- process. This migration replaces that mechanism with two live-derived fields on the
-- canonical RPC so all surfaces draw from one source.
--
-- leaders_current  = live count of active leader-role members right now
-- leaders_lifetime = distinct user_id count who have EVER held a leader role in this
--                    collective (handles re-joins without double-counting)
--
-- Consumer migration order:
--   1. This migration adds the fields (no behaviour change for existing callers)
--   2. Hooks switch from app_settings reads to rpc.leaders_lifetime
--   3. app_settings.leaders_empowered:* rows deleted after all consumers updated
--
-- DO NOT execute standalone - Tate runs this as part of the 1.8.5 bundle.

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
    'leaders_current', (
      SELECT COUNT(*) FROM collective_members
      WHERE collective_id = p_collective_id
        AND status = 'active'
        AND role IN ('leader', 'co_leader', 'assist_leader')
    ),
    'leaders_lifetime', (
      SELECT COUNT(DISTINCT user_id) FROM collective_members
      WHERE collective_id = p_collective_id
        AND role IN ('leader', 'co_leader', 'assist_leader')
    ),
    'trees_planted', COALESCE(SUM(
      CASE WHEN ei.trees_planted IS NULL THEN 0
        ELSE FLOOR(ei.trees_planted::numeric / eh.host_count)
             + CASE WHEN eh.host_index < (ei.trees_planted::int % eh.host_count) THEN 1 ELSE 0 END
      END
    ), 0),
    'rubbish_kg', COALESCE(SUM(
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
