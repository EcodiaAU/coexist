-- ============================================================
-- 20260610010000: Codify the city tag dedupe so a fresh DB
--   restore lands in the same shape as live prod (2026-06-10).
--
-- We applied merge_email_tags() to nine city pairs by hand against
-- prod (Adelaide/Brisbane/Byron Bay/Cairns/Gold Coast/Hobart/Perth/
-- Sunshine Coast/Sydney). This migration re-runs that operation as
-- idempotent SQL so any future migration replay or seed restore
-- ends up at the same canonical-tag set.
--
-- Canonical = the bare city name (matches collectives.name and the
-- shorter chip label). Deprecated = the "<City> Collective"
-- variant. merge_email_tags() handles the assignment move plus the
-- delete and is safe to call when one side is missing (the IF guard
-- inside the DO block skips silently).
-- ============================================================

DO $$
DECLARE
  v_canon_name text;
  v_canonical_id uuid;
  v_deprecated_id uuid;
BEGIN
  FOR v_canon_name IN
    SELECT unnest(ARRAY[
      'Adelaide',
      'Brisbane',
      'Byron Bay',
      'Cairns',
      'Gold Coast',
      'Hobart',
      'Perth',
      'Sunshine Coast',
      'Sydney'
    ])
  LOOP
    SELECT id INTO v_canonical_id FROM email_tags WHERE name = v_canon_name LIMIT 1;
    SELECT id INTO v_deprecated_id FROM email_tags WHERE name = v_canon_name || ' Collective' LIMIT 1;
    IF v_canonical_id IS NOT NULL AND v_deprecated_id IS NOT NULL THEN
      PERFORM merge_email_tags(v_canonical_id, v_deprecated_id);
    END IF;
  END LOOP;
END $$;
