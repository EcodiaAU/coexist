-- ============================================================================
-- Fix: event location_point updates via PostgREST silently fail
-- ----------------------------------------------------------------------------
-- PostgREST cannot reliably cast a WKT/EWKT text value into a
-- geography(Point,4326) column on UPDATE — the column stays NULL, so editing
-- an event's pin appeared to save but reload would snap the map back to the
-- default. This RPC accepts plain lat/lng floats and uses ST_MakePoint to
-- write the geography correctly, mirroring how seed.sql populates rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_event_location(
  p_event_id uuid,
  p_lat      double precision,
  p_lng      double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    UPDATE events
       SET location_point = NULL,
           updated_at     = now()
     WHERE id = p_event_id;
  ELSE
    UPDATE events
       SET location_point = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
           updated_at     = now()
     WHERE id = p_event_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_event_location(uuid, double precision, double precision) TO authenticated;
