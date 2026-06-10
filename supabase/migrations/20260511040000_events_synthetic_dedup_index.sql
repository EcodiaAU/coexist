-- Prevent duplicate synthetic events (created by excel-sync) for the same
-- collective + date + normalised title combination.
--
-- Synthetic events are created by the from-excel sync path and identified by
-- their deterministic UUID v5 (formsIdToUuid uses the FORMS_NAMESPACE_UUID
-- namespace). UUID v5 has version digit '5' at position 15 of the canonical
-- UUID string. SQL: substring(id::text from 15 for 1) = '5'.
--
-- This index does NOT affect app-created events (UUID v4). Users may
-- legitimately create two events with the same title on the same day (e.g.
-- morning and afternoon sessions) - those are v4 UUIDs and excluded.
--
-- Normalisation: matches excel-sync's normaliseTitle() in
-- supabase/functions/excel-sync/index.ts - lowercase, strip everything except
-- alnum, collapse to empty. "Beach Clean Up", "beach-cleanup", and
-- "BeachCleanup" all collapse to "beachcleanup" and are treated as the same
-- event. Tighter than the original lower(trim(title)) form so the DB index
-- aligns with the application's matching logic.
--
-- PG17 IMMUTABLE-safety:
--   - date_start is timestamptz; ((... AT TIME ZONE 'UTC')::date) is immutable
--     because TIME ZONE is a literal, removing the session-TZ dependency.
--   - title COLLATE "C" forces a deterministic, locale-free collation so
--     lower(trim(...)) is immutable regardless of the database's en_US.UTF-8
--     default collation.
--   - regexp_replace with literal pattern + literal flags is immutable.
--
-- Origin: Co-Exist excel-sync unification 2026-05-11. Tightened from the
-- lower(trim(title))-only form on 2026-05-13 during the dedup cleanup
-- (152 v5 dupes reconciled to canonical-UUID rows; audit table
-- _audit_excel_dedup_20260513 preserved for posterity).

CREATE UNIQUE INDEX IF NOT EXISTS events_synthetic_dedup
  ON events (
    collective_id,
    ((date_start AT TIME ZONE 'UTC')::date),
    regexp_replace(lower(trim(title COLLATE "C")), '[^a-z0-9]+', '', 'g')
  )
  WHERE substring(id::text from 15 for 1) = '5';
