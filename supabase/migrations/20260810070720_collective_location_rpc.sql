-- ============================================================================
-- Collective location_point updates via PostgREST silently fail
-- ----------------------------------------------------------------------------
-- Same limitation as events (see 20260501030409_event_location_rpc.sql):
-- PostgREST cannot cast a WKT/EWKT text value into a geography(Point,4326)
-- column on INSERT/UPDATE, so location_point comes back NULL. That meant a
-- newly created collective had no coordinate and silently never pinned on the
-- explore-page Collectives map (the client fell back to a hardcoded slug->coord
-- table in src/lib/geo.ts, which only covered the seeded cities). This RPC
-- accepts plain lat/lng floats and uses ST_MakePoint to write the geography
-- correctly, letting the admin "create collective" form persist the coordinate
-- picked in its Region autocomplete. SECURITY INVOKER: the caller (admin) must
-- already pass the collectives UPDATE RLS policy, same as the rename flow.
-- NOTE: collectives has no updated_at column, so (unlike events) we do not touch it.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_collective_location(
  p_collective_id uuid,
  p_lat           double precision,
  p_lng           double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    UPDATE collectives
       SET location_point = NULL
     WHERE id = p_collective_id;
  ELSE
    UPDATE collectives
       SET location_point = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
     WHERE id = p_collective_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_collective_location(uuid, double precision, double precision) TO authenticated;
