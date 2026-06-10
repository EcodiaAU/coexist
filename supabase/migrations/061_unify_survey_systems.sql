-- ============================================================================
-- 061: Unify Survey Systems
--
-- Merges the separate post_event_survey_templates system into the main
-- surveys table. Adds activity_type to surveys and event_id to
-- survey_responses so the survey builder is the single source of truth.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add activity_type to surveys (links a survey to post-event use)
-- ---------------------------------------------------------------------------

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS activity_type text;

-- Only one survey per activity type can be the post-event survey
CREATE UNIQUE INDEX IF NOT EXISTS surveys_activity_type_unique
  ON surveys(activity_type) WHERE activity_type IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Add event_id to survey_responses (for post-event context)
-- ---------------------------------------------------------------------------

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_survey_responses_event
  ON survey_responses(event_id);

-- Replace unique constraint: old was (survey_id, user_id) which prevents
-- same user responding to same survey for different events.
-- New constraint allows per-event responses via COALESCE sentinel.
ALTER TABLE survey_responses
  DROP CONSTRAINT IF EXISTS survey_responses_survey_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_unique_response
  ON survey_responses(
    survey_id,
    user_id,
    COALESCE(event_id, '00000000-0000-0000-0000-000000000000')
  );

-- ---------------------------------------------------------------------------
-- 3. Seed: Convert post_event_survey_templates into surveys rows
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  act_type text;
  q_row   record;
  q_arr   jsonb;
  label   text;
BEGIN
  FOR act_type IN
    SELECT DISTINCT activity_type FROM post_event_survey_templates ORDER BY activity_type
  LOOP
    -- Build label from activity_type (e.g. 'tree_planting' → 'Tree Planting')
    label := initcap(replace(act_type, '_', ' '));

    -- Build questions JSONB array from template rows
    q_arr := '[]'::jsonb;
    FOR q_row IN
      SELECT * FROM post_event_survey_templates
      WHERE activity_type = act_type
      ORDER BY sort_order
    LOOP
      q_arr := q_arr || jsonb_build_object(
        'id', q_row.id::text,
        'type', q_row.question_type,
        'text', q_row.question_text,
        'required', COALESCE(q_row.is_required, false),
        'options', q_row.options,
        'placeholder', q_row.unit,
        'impact_metric', q_row.impact_metric
      );
    END LOOP;

    -- Insert survey (skip if activity_type already claimed)
    INSERT INTO surveys (title, questions, activity_type, auto_send_after_event, status, is_active)
    VALUES (
      label || ' Post-Event Survey',
      q_arr,
      act_type,
      true,
      'active',
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Mark legacy tables as deprecated
-- ---------------------------------------------------------------------------

COMMENT ON TABLE post_event_survey_templates IS
  'DEPRECATED: Use surveys table with activity_type instead. Kept for backward compatibility.';

COMMENT ON TABLE post_event_survey_responses IS
  'DEPRECATED: Use survey_responses with event_id instead. Kept for backward compatibility.';
