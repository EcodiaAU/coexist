-- Prevent duplicate synthetic events (created by excel-sync) for the same
-- collective + date + title combination.
--
-- Synthetic events are created by the from-excel sync path and identified by
-- their deterministic UUID v5 (formsIdToUuid uses the FORMS_NAMESPACE_UUID
-- namespace). UUID v5 has version digit '5' at position 15 of the canonical
-- UUID string (1-indexed), i.e. position 14 (0-indexed) in JavaScript.
-- SQL: substring(id::text from 15 for 1) = '5'.
--
-- This index does NOT affect app-created events (UUID v4, version digit = '4').
-- Users may legitimately create two events with the same title on the same day
-- (e.g. morning and afternoon sessions) - those are v4 UUIDs and are excluded
-- from this constraint.
--
-- The index covers collective_id + date (truncated from date_start) + lower(trim(title))
-- so that re-running the sync with the same namespace always produces an
-- idempotent upsert rather than a constraint violation (the upsert uses
-- onConflict: 'id', which hits the primary key, not this index). The index
-- makes a second synthetic event for the same collective/date/title
-- structurally impossible even if the existence guard or findMatchingAppEvent
-- miss a case.
--
-- Root cause this index guards against (fork_mp138va4_fe0506 + fork_mp14bxww_0103ed):
-- The May 2026 re-sync created 179 duplicate synthetic events because
-- findMatchingAppEvent previously excluded all v5 UUIDs from its candidate
-- pool, preventing it from matching March-imported synthetics. The root cause
-- is fixed (findMatchingAppEvent now includes synthetics as candidates), but
-- this DB-level index provides a structural backstop layer.
--
-- UUID version digit position verification:
--   SELECT id, substring(id::text from 15 for 1) as version_digit
--   FROM events WHERE substring(id::text from 15 for 1) = '5' LIMIT 5;
-- Should return only synthetic events. App events return '4'.
--
-- Origin: Co-Exist excel-sync unification 2026-05-11, fork_mp14bxww_0103ed.

CREATE UNIQUE INDEX IF NOT EXISTS events_synthetic_dedup
  ON events (collective_id, (date_start::date), lower(trim(title)))
  WHERE substring(id::text from 15 for 1) = '5';
