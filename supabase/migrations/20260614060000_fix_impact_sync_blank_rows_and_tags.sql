-- Fix the impact pipeline: three bugs found 2026-06-14 from the Cotton Tree
-- "0 rubbish" report.
--
-- A) sync_survey_response_to_event_impact fired on ANY survey response with an
--    event_id, including the non-impact "How was today?" wellbeing survey
--    (is_impact_form=false). That inserted a blank event_impact row, which
--    shows 0 on the dashboard AND marks the impact-form task done so the real
--    Clean Up rubbish form never gets prompted. Fix: skip non-impact surveys.
-- B) The impact_metric tags that map survey answers to event_impact columns
--    were wiped from all surveys (a prior migration), so survey-submitted
--    impact numbers stopped syncing. Real numbers lost: Torquay 12kg,
--    Whitfords Nodes 26.1kg, Bicentennial 24kg. Fix: restore the tags
--    (q4 -> rubbish_kg, q5 -> trees_planted on the impact surveys).
-- C) Backfill the dropped numbers, and remove the one true phantom blank row
--    (Cotton Tree) so its real impact form re-opens.
--
-- Idempotent: CREATE OR REPLACE, tag set is deterministic, backfill only fills
-- nulls, delete targets a precise empty-row signature.

-- ---------------------------------------------------------------------------
-- A) Guard the sync trigger: only impact-form surveys feed event_impact.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_survey_response_to_event_impact()
RETURNS TRIGGER AS $$
DECLARE
  v_questions       JSONB;
  v_is_impact       BOOLEAN;
  v_question        JSONB;
  v_metric          TEXT;
  v_answer_raw      JSONB;
  v_answer_text     TEXT;
  v_value           NUMERIC;
  v_builtins        JSONB := '{}'::jsonb;
  v_custom          JSONB := '{}'::jsonb;
  v_existing_event  UUID;
BEGIN
  -- Survey responses outside an event context have nothing to derive from.
  IF NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT questions, is_impact_form INTO v_questions, v_is_impact
  FROM surveys WHERE id = NEW.survey_id;

  -- Only impact forms create event_impact rows. A general post-event survey
  -- ("How was today?") must never auto-create a blank impact row.
  IF NOT COALESCE(v_is_impact, false) THEN
    RETURN NEW;
  END IF;

  IF v_questions IS NULL OR jsonb_typeof(v_questions) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR v_question IN SELECT * FROM jsonb_array_elements(v_questions)
  LOOP
    v_metric := v_question->>'impact_metric';
    IF v_metric IS NULL OR v_metric = '' THEN CONTINUE; END IF;

    v_answer_raw := NEW.answers -> (v_question->>'id');
    IF v_answer_raw IS NULL OR v_answer_raw = 'null'::jsonb THEN CONTINUE; END IF;

    v_answer_text := v_answer_raw #>> '{}';
    BEGIN
      v_value := v_answer_text::numeric;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF v_value IS NULL OR v_value < 0 THEN CONTINUE; END IF;

    IF v_metric IN (
      'trees_planted','rubbish_kg','coastline_cleaned_m','hours_total',
      'area_restored_sqm','native_plants','wildlife_sightings'
    ) THEN
      v_builtins := v_builtins || jsonb_build_object(v_metric, v_value);
    ELSE
      v_custom := v_custom || jsonb_build_object(v_metric, v_value);
    END IF;
  END LOOP;

  SELECT event_id INTO v_existing_event FROM event_impact WHERE event_id = NEW.event_id;

  IF v_existing_event IS NULL THEN
    INSERT INTO event_impact (
      event_id, logged_by,
      trees_planted, rubbish_kg, coastline_cleaned_m, hours_total,
      area_restored_sqm, native_plants, wildlife_sightings,
      custom_metrics, notes
    ) VALUES (
      NEW.event_id,
      NEW.user_id,
      NULLIF(v_builtins->>'trees_planted','')::int,
      NULLIF(v_builtins->>'rubbish_kg','')::numeric,
      NULLIF(v_builtins->>'coastline_cleaned_m','')::numeric,
      NULLIF(v_builtins->>'hours_total','')::numeric,
      NULLIF(v_builtins->>'area_restored_sqm','')::numeric,
      NULLIF(v_builtins->>'native_plants','')::int,
      NULLIF(v_builtins->>'wildlife_sightings','')::int,
      v_custom || jsonb_build_object('survey_synced', true, 'auto_derived', true),
      'Auto-derived from survey response. Leader can refine via Log Impact.'
    )
    ON CONFLICT (event_id) DO NOTHING;
  ELSE
    UPDATE event_impact SET
      trees_planted         = COALESCE(trees_planted,         NULLIF(v_builtins->>'trees_planted','')::int),
      rubbish_kg            = COALESCE(rubbish_kg,            NULLIF(v_builtins->>'rubbish_kg','')::numeric),
      coastline_cleaned_m   = COALESCE(coastline_cleaned_m,   NULLIF(v_builtins->>'coastline_cleaned_m','')::numeric),
      hours_total           = COALESCE(hours_total,           NULLIF(v_builtins->>'hours_total','')::numeric),
      area_restored_sqm     = COALESCE(area_restored_sqm,     NULLIF(v_builtins->>'area_restored_sqm','')::numeric),
      native_plants         = COALESCE(native_plants,         NULLIF(v_builtins->>'native_plants','')::int),
      wildlife_sightings    = COALESCE(wildlife_sightings,    NULLIF(v_builtins->>'wildlife_sightings','')::int),
      custom_metrics        = COALESCE(custom_metrics,'{}'::jsonb) || v_custom || jsonb_build_object('survey_synced', true)
    WHERE event_id = NEW.event_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- B) Restore impact_metric tags on the impact-form surveys.
--    q4 "Rubbish removed (kg)" -> rubbish_kg ; q5 "Trees planted" -> trees_planted.
-- ---------------------------------------------------------------------------
UPDATE surveys s SET questions = (
  SELECT jsonb_agg(
    CASE
      WHEN q->>'id' = 'q4' AND (q->>'type') = 'number'
        THEN q || '{"impact_metric":"rubbish_kg"}'::jsonb
      WHEN q->>'id' = 'q5' AND (q->>'type') = 'number'
        THEN q || '{"impact_metric":"trees_planted"}'::jsonb
      ELSE q
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(s.questions) WITH ORDINALITY AS t(q, ord)
)
WHERE s.is_impact_form = true
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(s.questions) q2
    WHERE q2->>'id' IN ('q4','q5') AND q2->>'type' = 'number'
  );

-- ---------------------------------------------------------------------------
-- C) Backfill numbers dropped while the tags were missing (fill nulls only).
-- ---------------------------------------------------------------------------
UPDATE event_impact ei SET rubbish_kg = v.q4
FROM (
  SELECT DISTINCT ON (sr.event_id) sr.event_id, (sr.answers->>'q4')::numeric AS q4
  FROM survey_responses sr
  JOIN surveys s ON s.id = sr.survey_id AND s.is_impact_form = true
  WHERE sr.answers->>'q4' ~ '^[0-9]+(\.[0-9]+)?$'
  ORDER BY sr.event_id, sr.submitted_at DESC
) v
WHERE v.event_id = ei.event_id AND ei.rubbish_kg IS NULL;

UPDATE event_impact ei SET trees_planted = v.q5
FROM (
  SELECT DISTINCT ON (sr.event_id) sr.event_id, (sr.answers->>'q5')::numeric::int AS q5
  FROM survey_responses sr
  JOIN surveys s ON s.id = sr.survey_id AND s.is_impact_form = true
  WHERE sr.answers->>'q5' ~ '^[0-9]+(\.[0-9]+)?$'
  ORDER BY sr.event_id, sr.submitted_at DESC
) v
WHERE v.event_id = ei.event_id AND ei.trees_planted IS NULL;

-- ---------------------------------------------------------------------------
-- D) Remove phantom blank rows that came from a non-impact survey, so the
--    real impact form re-opens. Precise empty-row signature, no photos, and
--    only where no impact-form response exists for the event (Cotton Tree).
-- ---------------------------------------------------------------------------
DELETE FROM event_impact ei
WHERE (ei.custom_metrics->>'auto_derived') = 'true'
  AND NOT (ei.custom_metrics ? 'photos')
  AND NOT (ei.custom_metrics ? 'drawn_area')
  AND ei.rubbish_kg IS NULL AND ei.trees_planted IS NULL
  AND ei.coastline_cleaned_m IS NULL AND ei.area_restored_sqm IS NULL
  AND ei.native_plants IS NULL AND ei.wildlife_sightings IS NULL
  AND ei.invasive_weeds_pulled IS NULL AND COALESCE(ei.leaders_trained,0) = 0
  AND ei.attendees IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM survey_responses sr
    JOIN surveys s ON s.id = sr.survey_id AND s.is_impact_form = true
    WHERE sr.event_id = ei.event_id
  );
