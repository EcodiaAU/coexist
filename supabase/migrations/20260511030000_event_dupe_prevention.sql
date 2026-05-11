-- ============================================================
-- Event duplicate prevention layer
-- 2026-05-11 | fork fork_mp0oo9cz_626123
-- ============================================================
-- Context: The sheet-sync import path (syncFromExcel) has produced
-- duplicate events on at least 3 occasions in 7 days (most recently
-- 11 May 2026). As of migration time, 171 dupe groups exist on the
-- (collective_id, date_start::date, lower(title)) tuple.
--
-- Strategy: Partial unique index covering only rows created on or
-- after 2026-05-12 (the day AFTER this migration runs). This
-- grandfathers the 171 legacy dupe groups so the index builds
-- without conflict, while preventing any new imports from ever
-- producing a duplicate. Once the legacy dupes are cleaned, the
-- WHERE clause can be dropped to make the constraint universal.
--
-- Layers (see ~/ecodiaos/patterns/coexist-event-dupe-prevention-layered.md):
--   1. This DB constraint (index name: uq_events_collective_date_title_new)
--   2. Application-layer ON CONFLICT DO NOTHING in syncFromExcel (Worker B)
--   3. Daily cron monitor via event_dupe_suspect view (cron: coexist-dupe-suspect-check)
-- ============================================================

-- ----------------------------------------------------------------
-- LAYER 1: Partial unique index
-- Covers all rows inserted from 2026-05-12 onwards.
-- Pre-existing rows (the 171 legacy dupe groups, all created before
-- this migration) are excluded by the WHERE clause.
-- ----------------------------------------------------------------
-- Note: date_start::date is VOLATILE (timezone-dependent). Use timezone('UTC', date_start)
-- cast via CAST(...AS date) — both the function and the cast are IMMUTABLE in PostgreSQL
-- and consistently extract the UTC calendar date regardless of session timezone.
-- CONCURRENTLY removed: Supabase Management API runs inside a transaction context
-- which does not support CONCURRENTLY. Safe to run without it on a small table.
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_collective_date_title_new
  ON public.events (collective_id, CAST(timezone('UTC', date_start) AS date), lower(title))
  WHERE created_at >= '2026-05-12 00:00:00+00';

COMMENT ON INDEX public.uq_events_collective_date_title_new IS
  'Partial unique constraint preventing duplicate events by (collective, event_date, title_lower). '
  'Covers rows created >= 2026-05-12 only; legacy dupes predating this migration are grandfathered. '
  'Drop WHERE clause and recreate as full index once legacy dupes are cleaned. '
  'Cross-ref: ~/ecodiaos/patterns/coexist-event-dupe-prevention-layered.md';

-- ----------------------------------------------------------------
-- LAYER 3: Monitoring view  event_dupe_suspect
-- Shows all pairs that share (collective_id, date_start::date,
-- lower(title)). Covers both legacy and new rows so the daily
-- monitor catches any breach of the spirit of the constraint.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW public.event_dupe_suspect AS
SELECT
  e.collective_id,
  CAST(timezone('UTC', e.date_start) AS date) AS event_date,
  lower(e.title)                        AS title_lower,
  count(*)                              AS dupe_count,
  array_agg(e.id ORDER BY e.created_at) AS event_ids,
  min(e.created_at)                     AS earliest_created_at,
  max(e.created_at)                     AS latest_created_at
FROM public.events e
GROUP BY e.collective_id, (e.date_start AT TIME ZONE 'UTC')::date, lower(e.title)
HAVING count(*) > 1;

COMMENT ON VIEW public.event_dupe_suspect IS
  'All (collective, date, title_lower) groups with more than one event row. '
  'Queried daily by cron task coexist-dupe-suspect-check. '
  'A count > 0 after 2026-05-12 indicates the unique index was bypassed or '
  'a legacy row was touched in a way that created a new duplicate. '
  'Cross-ref: ~/ecodiaos/patterns/coexist-event-dupe-prevention-layered.md';
