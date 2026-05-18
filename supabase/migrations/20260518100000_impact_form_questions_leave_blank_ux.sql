-- Impact-form survey question v4 - 2026-05-18 night.
--
-- Restructured per Tate's directives:
--
-- 1. q1 is now a yes_no question "Did another group attend?", not a free-text
--    partner-name slot. When q1=Yes the renderer reveals q1_name (required
--    partner name) and q2/q3 (optional Landcare / OzFish chapter names).
--    When q1=No the sheet automatically writes "No, just Co-Exist!" to col 7
--    and leaves cols 8/9 blank - we don't trust leaders to leave the field
--    blank or remember the exact wording.
--
-- 2. Yes/No questions are required and NON-clearable in the renderer. Once
--    picked the leader can switch between Yes and No but cannot revert to
--    blank. Forms convention has zero blanks in the required yes/no columns.
--
-- 3. Activity-specific required main stats:
--    - tree_planting: q5 (Trees) required
--    - ecosystem_restoration: q5 (Trees) required
--    - clean_up: q4 (Rubbish kg) required
--    - nature_hike: q8 (Hike/walk name) required
--    - camp_out / spotlighting / other / nature_hike: no extra requireds
--
-- 4. Free-text questions the Form pre-fills with "No" stay required +
--    default_value "No" so the leader can tap submit unchanged when there's
--    nothing to report (q9 Issues, q11 Highlights, q14 Grant).
--
-- 5. q7 "What was collected" only shows when q6 "Collect or make anything?" = Yes.
--
-- Companion to:
--   * supabase/functions/excel-sync/index.ts (readOtherGroupName +
--     otherGroupAttended handle both new yes_no q1 and legacy free-text q1)
--   * src/components/survey-questions.tsx (show_if conditional rendering)
--   * src/components/survey-questions-utils.ts (isQuestionVisible helper)
--   * src/pages/events/log-impact.tsx (canSubmitSurvey gate based on visible
--     required questions only)
--
-- Origin: Tate verbatim 2026-05-18 night - "the other group attended question
-- should be a yes/no question and if they click yes the [name] text field
-- appears... we cant trust them to leave it blank... trees planted should NOT
-- be optional for a tree planting... why tf can you clear your answer for the
-- make or collect anything... use your head".
--
-- Idempotent: re-running re-applies the canonical block for every active
-- impact-form survey. Existing survey_responses are NOT migrated - they
-- retain their legacy q1 free-text shape, which is handled by the Edge
-- Function's readOtherGroupName helper (legacy compat branch).

DO $$
DECLARE
  canonical jsonb := jsonb_build_object(
    'q1',  jsonb_build_object(
      'id','q1','text','Did another group attend?','type','yes_no','required',true,
      'description','If No, the sheet records ''No, just Co-Exist!'' automatically.',
      'default_value','No'),
    'q1_name', jsonb_build_object(
      'id','q1_name','text','Which group attended?','type','free_text','required',true,
      'description','Name the partner group that joined.',
      'placeholder','e.g. Bushcare group, Yarra Ranges Council',
      'text_multiline',false,
      'show_if',jsonb_build_object('question_id','q1','equals','Yes')),
    'q2',  jsonb_build_object(
      'id','q2','text','Which Landcare group, if any','type','free_text','required',false,
      'description','Only if a Landcare group was one of the attending groups.',
      'placeholder','e.g. Noosa Landcare','text_multiline',false,
      'show_if',jsonb_build_object('question_id','q1','equals','Yes')),
    'q3',  jsonb_build_object(
      'id','q3','text','Which OzFish group, if any','type','free_text','required',false,
      'description','Only if an OzFish group was one of the attending groups.',
      'placeholder','e.g. OzFish Sunshine Coast','text_multiline',false,
      'show_if',jsonb_build_object('question_id','q1','equals','Yes')),
    'q4',  jsonb_build_object(
      'id','q4','text','Rubbish removed (kg)','type','number','required',false,
      'description','Leave blank if none.','placeholder','e.g. 12','number_min',0),
    'q4_required', jsonb_build_object(
      'id','q4','text','Rubbish removed (kg)','type','number','required',true,
      'description','Required for clean-up events. Type 0 if none was removed.',
      'placeholder','e.g. 12','number_min',0),
    'q5',  jsonb_build_object(
      'id','q5','text','Trees planted','type','number','required',false,
      'description','Leave blank if none.','placeholder','e.g. 30','number_min',0),
    'q5_tree_planting', jsonb_build_object(
      'id','q5','text','Trees planted','type','number','required',true,
      'description','Required - the main stat for tree planting. Type 0 if none.',
      'placeholder','e.g. 30','number_min',0),
    'q5_ecosystem_restoration', jsonb_build_object(
      'id','q5','text','Trees planted','type','number','required',true,
      'description','Required - trees / native plants put in the ground. Type 0 if none.',
      'placeholder','e.g. 30','number_min',0),
    'q6',  jsonb_build_object(
      'id','q6','text','Collect or make anything?','type','yes_no','required',true,
      'description','Yes if you collected or built anything during the event.'),
    'q7',  jsonb_build_object(
      'id','q7','text','What was it, and how much?','type','free_text','required',true,
      'description','Describe what was collected or made.',
      'placeholder','e.g. 3 bee hotels','text_multiline',true,
      'show_if',jsonb_build_object('question_id','q6','equals','Yes')),
    'q8',  jsonb_build_object(
      'id','q8','text','Name of the hike or walking track','type','free_text','required',false,
      'description','Leave blank if not applicable.',
      'placeholder','e.g. Mount Cooroora summit track','text_multiline',false),
    'q8_nature_hike', jsonb_build_object(
      'id','q8','text','Name of the hike or walking track','type','free_text','required',true,
      'description','Required - the hike or walking track name.',
      'placeholder','e.g. Mount Cooroora summit track','text_multiline',false),
    'q9',  jsonb_build_object(
      'id','q9','text','Any issues to flag?','type','free_text','required',true,
      'description','Type ''No'' if everything ran smoothly, or describe any issues.',
      'placeholder','No / e.g. Track closure, weather, gear',
      'text_multiline',true,'default_value','No'),
    'q10', jsonb_build_object(
      'id','q10','text','Use the first aid kit?','type','yes_no','required',true,
      'description','Required.'),
    'q11', jsonb_build_object(
      'id','q11','text','Outstanding highlights','type','free_text','required',true,
      'description','Anything wholesome worth surfacing? Type ''No'' if there were none.',
      'placeholder','No / e.g. amazing relationship with the host group',
      'text_multiline',true,'default_value','No'),
    'q12', jsonb_build_object(
      'id','q12','text','Event images uploaded to OneDrive?','type','yes_no','required',true,
      'description','Required.'),
    'q13', jsonb_build_object(
      'id','q13','text','Event videos uploaded to Google Drive?','type','yes_no','required',true,
      'description','Required.'),
    'q14', jsonb_build_object(
      'id','q14','text','Grant project','type','free_text','required',true,
      'description','Type ''No'' if not part of a grant project, or name it.',
      'placeholder','No / e.g. Coastal Connections 2026',
      'text_multiline',false,'default_value','No'),
    'q15', jsonb_build_object(
      'id','q15','text','Posted event wrap-up on Instagram?','type','yes_no','required',true,
      'description','Required.')
  );
  -- Per-activity question ordering. Driven entirely by data; the renderer
  -- shows the array in order.
  per_activity jsonb := jsonb_build_object(
    'tree_planting',           jsonb_build_array('q1','q1_name','q2','q3','q5_tree_planting','q6','q7','q9','q10','q11','q12','q13','q14','q15'),
    'clean_up',                jsonb_build_array('q1','q1_name','q2','q3','q4_required','q6','q7','q9','q10','q11','q12','q13','q14','q15'),
    'ecosystem_restoration',   jsonb_build_array('q1','q1_name','q2','q3','q4','q5_ecosystem_restoration','q6','q7','q9','q10','q11','q12','q13','q14','q15'),
    'nature_hike',             jsonb_build_array('q1','q1_name','q2','q3','q8_nature_hike','q9','q10','q11','q12','q13','q14','q15'),
    'camp_out',                jsonb_build_array('q1','q1_name','q2','q3','q9','q10','q11','q12','q13','q14','q15'),
    'spotlighting',            jsonb_build_array('q1','q1_name','q2','q3','q9','q10','q11','q12','q13','q14','q15'),
    'other',                   jsonb_build_array('q1','q1_name','q2','q3','q4','q5','q6','q7','q8','q9','q10','q11','q12','q13','q14','q15')
  );
  s record;
  order_keys jsonb;
  new_qs jsonb;
  key text;
BEGIN
  FOR s IN
    SELECT id, activity_type FROM public.surveys
     WHERE is_impact_form = true AND status = 'active'
  LOOP
    order_keys := COALESCE(per_activity->s.activity_type, per_activity->'other');
    new_qs := '[]'::jsonb;
    FOR key IN SELECT jsonb_array_elements_text(order_keys)
    LOOP
      new_qs := new_qs || jsonb_build_array(canonical->key);
    END LOOP;

    UPDATE public.surveys SET questions = new_qs, updated_at = NOW()
     WHERE id = s.id;
  END LOOP;
END $$;
