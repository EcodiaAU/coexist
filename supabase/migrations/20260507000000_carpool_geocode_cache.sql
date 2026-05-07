-- Migration: 20260507000000_carpool_geocode_cache.sql
--
-- Geocode cache for carpool-create-widget edge function.
-- Avoids hammering OSM Nominatim's 1-req/sec usage policy. 90d TTL
-- enforced at read-time (cached_at >= now() - 90 days).
--
-- Origin: 7 May 2026, fork_mouu2eqy_b0ba8b. Tate-reported bug: carpool widget
--   created with departure_point_text="Kawana" but departure_lat/lng null.
--   Root cause: edge function had no server-side geocoding.

CREATE TABLE IF NOT EXISTS carpool_geocode_cache (
  text_normalized text PRIMARY KEY,
  lat             numeric NOT NULL,
  lng             numeric NOT NULL,
  display_name    text,
  cached_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carpool_geocode_cache_cached_at
  ON carpool_geocode_cache (cached_at);

-- RLS: service-role only. The edge function uses SUPABASE_SERVICE_ROLE_KEY
-- so it bypasses RLS; we still enable it for defence-in-depth so that no
-- authenticated user can query/mutate the cache directly.
ALTER TABLE carpool_geocode_cache ENABLE ROW LEVEL SECURITY;
-- (no policies = no access for authenticated/anon roles)
