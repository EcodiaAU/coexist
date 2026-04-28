-- Add events and collectives to the supabase_realtime publication so the
-- Leaflet collective map updates in realtime when events are created,
-- edited, or cancelled, and when collective metadata (cover image, region,
-- location_point) changes.
--
-- Idempotent: the DO block guards against re-adding tables that already
-- belong to the publication, so this migration is safe to re-run.
--
-- Pairs with src/hooks/use-collective-map.ts which subscribes to
-- postgres_changes on these tables.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'collectives'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.collectives;
  END IF;
END $$;
