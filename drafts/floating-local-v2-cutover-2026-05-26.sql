-- Floating-local v2 forward data migration
-- Run at cutover, after Vercel promote and before releasing native builds.
--
-- Converts events.date_start / date_end from real-UTC encoding to
-- wall-clock-as-UTC encoding. Identical to the May 25 commit 2ec1c4a
-- migration, which I reverted on 2026-05-26 to unbreak production
-- after the floating-local rollout coupled-shape problem.
--
-- Formula:
--   real_utc AT TIME ZONE collective_tz = "wall-clock numbers in that tz"
--   that timestamp AT TIME ZONE 'UTC' = same numbers re-tagged as UTC
--
-- Example for an event at 9am Perth (real UTC = 2026-06-14T01:00Z,
-- collective_tz = 'Australia/Perth'):
--   01:00Z AT TIME ZONE 'Australia/Perth' = '2026-06-14T09:00:00' (timestamp)
--   '2026-06-14T09:00:00' AT TIME ZONE 'UTC' = '2026-06-14T09:00:00Z'
-- Post-migration the wall-clock value 9am is encoded as 09:00 UTC and
-- the new code displays "9:00 am" pinned to UTC.

UPDATE events e SET
  date_start = ((e.date_start AT TIME ZONE coalesce(e.timezone, c.timezone, 'Australia/Sydney'))::timestamp AT TIME ZONE 'UTC'),
  date_end = CASE
    WHEN e.date_end IS NULL THEN NULL
    ELSE ((e.date_end AT TIME ZONE coalesce(e.timezone, c.timezone, 'Australia/Sydney'))::timestamp AT TIME ZONE 'UTC')
  END
FROM collectives c
WHERE c.id = e.collective_id;

-- Verify a couple of known events afterward:
-- SELECT id, title, date_start FROM events WHERE title ILIKE '%John Forrest%' LIMIT 3;
-- Expect Perth events to show date_start values that look like "09:00 UTC" (= 9am wall-clock)
-- not "01:00 UTC" (= real moment of 9am Perth = 1am UTC).
