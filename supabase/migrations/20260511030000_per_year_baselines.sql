-- Per-year baseline rows in app_settings.
-- These let the drift cron and fetchBaselineByYear() compare actual
-- year-by-year impact data against the master sheet without relying on
-- hardcoded constants scattered across the codebase.
--
-- Keys follow the pattern: impact_baseline_{metric}_{year}
-- Values are JSON objects with a "count" field (integer).
--
-- ON CONFLICT DO NOTHING ensures re-running this migration is safe and
-- does not overwrite values that may have been updated via the admin UI.

INSERT INTO app_settings (key, value) VALUES
  ('impact_baseline_trees_2022',     '{"count": 17300}'),
  ('impact_baseline_trees_2024',     '{"count": 3702}'),
  ('impact_baseline_trees_2025',     '{"count": 15635}'),
  ('impact_baseline_events_2025',    '{"count": 340}'),
  ('impact_baseline_attendees_2025', '{"count": 5500}'),
  ('impact_baseline_hours_2025',     '{"count": 11000}')
ON CONFLICT (key) DO NOTHING;
