-- ============================================================================
-- 063: Admin-configurable impact metric definitions
--
-- Moves the hardcoded IMPACT_METRIC_DEFS into a DB table so admins can
-- add, edit, reorder, and toggle metrics without code changes.
-- Built-in metrics map to real event_impact columns; custom metrics
-- are stored in the existing custom_metrics jsonb column.
-- ============================================================================

CREATE TABLE IF NOT EXISTS impact_metric_defs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text UNIQUE NOT NULL,
  label           text NOT NULL,
  unit            text NOT NULL DEFAULT '',
  icon            text NOT NULL DEFAULT 'leaf',
  decimal         boolean NOT NULL DEFAULT false,
  sort_order      int NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  survey_linkable boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Seed with the 8 existing built-in metrics
INSERT INTO impact_metric_defs (key, label, unit, icon, decimal, sort_order, survey_linkable) VALUES
  ('trees_planted',         'Trees Planted',         'trees',     'tree',  false, 0, true),
  ('native_plants',         'Native Plants',         'plants',    'leaf',  false, 1, true),
  ('invasive_weeds_pulled', 'Invasive Weeds Pulled', 'weeds',     'weed',  false, 2, true),
  ('rubbish_kg',            'Rubbish Collected',     'kg',        'trash', true,  3, true),
  ('area_restored_sqm',     'Area Restored',         'sqm',       'area',  true,  4, true),
  ('wildlife_sightings',    'Wildlife Sightings',    'sightings', 'eye',   false, 5, true),
  ('coastline_cleaned_m',   'Coastline Cleaned',     'm',         'wave',  true,  6, true),
  ('hours_total',           'Volunteer Hours',       'hours',     'clock', true,  7, false)
ON CONFLICT (key) DO NOTHING;

-- RLS: everyone can read, staff can write
ALTER TABLE impact_metric_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "impact_metric_defs_public_read"
  ON impact_metric_defs FOR SELECT
  USING (true);

CREATE POLICY "impact_metric_defs_staff_write"
  ON impact_metric_defs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('national_staff', 'national_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('national_staff', 'national_admin', 'super_admin')
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_impact_metric_defs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_impact_metric_defs_updated
  BEFORE UPDATE ON impact_metric_defs
  FOR EACH ROW EXECUTE FUNCTION update_impact_metric_defs_timestamp();
