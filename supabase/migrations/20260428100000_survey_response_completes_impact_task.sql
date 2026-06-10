-- ============================================================================
-- 20260428100000: Survey response completes impact-form task (Issue A fix)
--
-- ISSUE (Jess Apr 28 2026): Surveys submitted via the survey link write to
-- survey_responses but do NOT create an event_impact row. The leader's
-- "Log Impact" task is gated on event_impact existing for the event, so it
-- stays pending even though the survey data is in the database.
--
-- Architectural cause: src/pages/events/post-event-survey.tsx explicitly
-- skips syncSurveyImpact() (the client-side function that copies impact-
-- tagged answers to event_impact). That function is only called from the
-- leader's log-impact.tsx path. Any survey response coming in via the link,
-- the home-banner deep link, a Microsoft-Forms cutover path, or any future
-- channel bypasses the impact derivation entirely.
--
-- FIX: Server-side trigger that mirrors syncSurveyImpact for any
-- survey_response with event_id IS NOT NULL. Idempotent and additive: never
-- clobbers leader-logged values, only fills gaps + merges custom_metrics.
--
-- The migration also backfills the same logic across existing rows so any
-- previously-stuck tasks clear immediately on deploy.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_survey_response_to_event_impact()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_questions       JSONB;
  v_question        JSONB;
  v_metric          TEXT;
  v_answer_raw      JSONB;
  v_answer_text     TEXT;
  v_value           NUMERIC;
  v_builtins        JSONB := '{}'::jsonb;
  v_custom          JSONB := '{}'::jsonb;
  v_existing_event  UUID;
BEGIN
  -- Only act when event_id is set; survey responses outside an event context
  -- (legacy/standalone surveys) have nothing to derive event-impact from.
  IF NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT questions INTO v_questions FROM surveys WHERE id = NEW.survey_id;
  IF v_questions IS NULL OR jsonb_typeof(v_questions) <> 'array' THEN
    RETURN NEW;
  END IF;

  -- Walk questions, extract impact-tagged numeric answers
  FOR v_question IN SELECT * FROM jsonb_array_elements(v_questions)
  LOOP
    v_metric := v_question->>'impact_metric';
    IF v_metric IS NULL OR v_metric = '' THEN CONTINUE; END IF;

    v_answer_raw := NEW.answers -> (v_question->>'id');
    IF v_answer_raw IS NULL OR v_answer_raw = 'null'::jsonb THEN CONTINUE; END IF;

    -- jsonb -> text -> numeric, swallowing parse errors per question
    v_answer_text := v_answer_raw #>> '{}';
    BEGIN
      v_value := v_answer_text::numeric;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF v_value IS NULL OR v_value < 0 THEN CONTINUE; END IF;

    -- Builtin columns on event_impact get assigned directly; everything
    -- else is merged into custom_metrics so the leader's admin metric defs
    -- still light up the impact dashboard.
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
    -- No prior row. Insert a minimal row so the leader's impact-form task
    -- clears. Notes flag tells the leader / admin this came from a survey
    -- response and is editable via Log Impact.
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
    -- Row exists. Never clobber leader-logged data; only fill nulls and
    -- merge custom metrics so attendees can layer extra detail without
    -- overwriting the leader's authoritative figures.
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
$$;

DROP TRIGGER IF EXISTS trg_sync_survey_response_to_event_impact ON survey_responses;

CREATE TRIGGER trg_sync_survey_response_to_event_impact
  AFTER INSERT OR UPDATE OF answers, event_id
  ON survey_responses
  FOR EACH ROW
  WHEN (NEW.event_id IS NOT NULL)
  EXECUTE FUNCTION sync_survey_response_to_event_impact();

-- ---------------------------------------------------------------------------
-- Backfill: replay the same logic over existing survey_responses so any
-- previously-stuck impact-form tasks clear on deploy.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_resp RECORD;
BEGIN
  FOR v_resp IN
    SELECT id, survey_id, user_id, event_id, answers
    FROM survey_responses
    WHERE event_id IS NOT NULL
    ORDER BY submitted_at ASC
  LOOP
    -- Re-trigger by emitting a no-op UPDATE on each row. The AFTER UPDATE
    -- fires our trigger function for each one without touching attendee
    -- data (we set updated_at to itself).
    UPDATE survey_responses
    SET updated_at = updated_at
    WHERE id = v_resp.id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Issue B alignment audit (informational; emits a NOTICE summary).
-- This does NOT mutate data; it lets the deploy log surface drift between
-- DB events, the Forms-canonical sheet, and impact-form task gating.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total_completed     INT;
  v_with_impact         INT;
  v_with_survey_resp    INT;
  v_pending_impact_task INT;
BEGIN
  SELECT COUNT(*) INTO v_total_completed
    FROM events e
    WHERE e.date_end < NOW()
      AND e.title NOT ILIKE 'test%'
      AND e.date_end > NOW() - INTERVAL '90 days';

  SELECT COUNT(*) INTO v_with_impact
    FROM events e
    WHERE e.date_end < NOW()
      AND e.title NOT ILIKE 'test%'
      AND e.date_end > NOW() - INTERVAL '90 days'
      AND EXISTS (SELECT 1 FROM event_impact ei WHERE ei.event_id = e.id);

  SELECT COUNT(*) INTO v_with_survey_resp
    FROM events e
    WHERE e.date_end < NOW()
      AND e.title NOT ILIKE 'test%'
      AND e.date_end > NOW() - INTERVAL '90 days'
      AND EXISTS (SELECT 1 FROM survey_responses sr WHERE sr.event_id = e.id);

  SELECT COUNT(*) INTO v_pending_impact_task
    FROM events e
    WHERE e.date_end < NOW()
      AND e.title NOT ILIKE 'test%'
      AND e.date_end > NOW() - INTERVAL '90 days'
      AND NOT EXISTS (SELECT 1 FROM event_impact ei WHERE ei.event_id = e.id)
      AND e.activity_type::text IN (
        SELECT activity_type FROM surveys
        WHERE is_impact_form = true AND status = 'active' AND activity_type IS NOT NULL
      );

  RAISE NOTICE 'Alignment audit (90d, non-test): completed=% with_impact=% with_survey_resp=% pending_impact_task=%',
    v_total_completed, v_with_impact, v_with_survey_resp, v_pending_impact_task;
END;
$$;

COMMENT ON FUNCTION sync_survey_response_to_event_impact() IS
  'Mirrors src/lib/survey-impact.ts::syncSurveyImpact for survey responses '
  'submitted outside the leader Log-Impact UI (post-event survey link, '
  'home-banner, Forms-cutover paths). Closes the alignment gap where '
  'survey_responses existed but event_impact did not, leaving the leader '
  'impact-form task pending. Origin: Jess feedback Apr 28 2026.';
