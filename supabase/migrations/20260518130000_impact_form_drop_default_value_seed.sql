-- Drop the default_value seed from impact-form survey questions.
--
-- The intent of default_value was: leader sees a pre-seeded answer they
-- can override OR leave alone, and the sheet always lands a value. What
-- actually happened: log-impact.tsx seeded the literal text "No" into
-- Issues / Highlights / Grant fields on first render. Leaders saw "No"
-- sitting in the answer box as if someone else had already typed it.
--
-- Cleaner contract:
--   - Field starts blank with placeholder hint ("No / describe...").
--   - q9 / q11 / q14 are NOT required - leader can submit blank.
--   - excel-sync's freeText(q) || 'No' fallback writes "No" to the sheet
--     whenever the answer is blank. The Forms-convention "always populated"
--     guarantee survives without ever showing "No" pre-baked into the UI.
--
-- q1 (Did another group attend?) also loses its default_value 'No' seed -
-- the pre-highlighted No button looked like a stale prior selection.
-- Leader must consciously click Yes or No. canSubmitSurvey + required:true
-- enforces the click. Show_if on q1_name/q2/q3 still works because
-- answers['q1'] === undefined evaluates !== 'Yes'.
--
-- Per-activity ordering identical to migration 20260518120000.

DO $$
DECLARE
  canonical jsonb := jsonb_build_object(
    'q1',  jsonb_build_object(
      'id','q1','text','Did another group attend?','type','yes_no','required',true),
    'q1_name', jsonb_build_object(
      'id','q1_name','text','Which group?','type','free_text','required',true,
      'placeholder','e.g. Yarra Ranges Council','text_multiline',false,
      'show_if',jsonb_build_object('question_id','q1','equals','Yes')),
    'q2',  jsonb_build_object(
      'id','q2','text','Landcare group (if any)','type','free_text','required',false,
      'placeholder','e.g. Noosa Landcare','text_multiline',false,
      'show_if',jsonb_build_object('question_id','q1','equals','Yes')),
    'q3',  jsonb_build_object(
      'id','q3','text','OzFish group (if any)','type','free_text','required',false,
      'placeholder','e.g. OzFish Sunshine Coast','text_multiline',false,
      'show_if',jsonb_build_object('question_id','q1','equals','Yes')),
    'q4',  jsonb_build_object(
      'id','q4','text','Rubbish removed (kg)','type','number','required',false,
      'placeholder','e.g. 12','number_min',0),
    'q4_required', jsonb_build_object(
      'id','q4','text','Rubbish removed (kg)','type','number','required',true,
      'placeholder','e.g. 12','number_min',0),
    'q5',  jsonb_build_object(
      'id','q5','text','Trees planted','type','number','required',false,
      'placeholder','e.g. 30','number_min',0),
    'q5_required', jsonb_build_object(
      'id','q5','text','Trees planted','type','number','required',true,
      'placeholder','e.g. 30','number_min',0),
    'q6',  jsonb_build_object(
      'id','q6','text','Collect or make anything?','type','yes_no','required',true),
    'q7',  jsonb_build_object(
      'id','q7','text','What and how much?','type','free_text','required',true,
      'placeholder','e.g. 3 bee hotels','text_multiline',true,
      'show_if',jsonb_build_object('question_id','q6','equals','Yes')),
    'q8',  jsonb_build_object(
      'id','q8','text','Hike or walking track name','type','free_text','required',false,
      'placeholder','e.g. Mount Cooroora summit track','text_multiline',false),
    'q8_required', jsonb_build_object(
      'id','q8','text','Hike or walking track name','type','free_text','required',true,
      'placeholder','e.g. Mount Cooroora summit track','text_multiline',false),
    'q9',  jsonb_build_object(
      'id','q9','text','Any issues?','type','free_text','required',false,
      'placeholder','Leave blank for No, or describe...','text_multiline',true),
    'q10', jsonb_build_object(
      'id','q10','text','Use the first aid kit?','type','yes_no','required',true),
    'q11', jsonb_build_object(
      'id','q11','text','Highlights','type','free_text','required',false,
      'placeholder','Leave blank for No, or describe...','text_multiline',true),
    'q12', jsonb_build_object(
      'id','q12','text','Images uploaded to OneDrive?','type','yes_no','required',true),
    'q13', jsonb_build_object(
      'id','q13','text','Videos uploaded to Google Drive?','type','yes_no','required',true),
    'q14', jsonb_build_object(
      'id','q14','text','Grant project','type','free_text','required',false,
      'placeholder','Leave blank for No, or project name','text_multiline',false),
    'q15', jsonb_build_object(
      'id','q15','text','Posted wrap-up on Instagram?','type','yes_no','required',true)
  );
  per_activity jsonb := jsonb_build_object(
    'tree_planting',           jsonb_build_array('q1','q1_name','q2','q3','q5_required','q6','q7','q9','q10','q11','q12','q13','q14','q15'),
    'clean_up',                jsonb_build_array('q1','q1_name','q2','q3','q4_required','q6','q7','q9','q10','q11','q12','q13','q14','q15'),
    'ecosystem_restoration',   jsonb_build_array('q1','q1_name','q2','q3','q4','q5_required','q6','q7','q9','q10','q11','q12','q13','q14','q15'),
    'nature_hike',             jsonb_build_array('q1','q1_name','q2','q3','q8_required','q9','q10','q11','q12','q13','q14','q15'),
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

    UPDATE public.surveys SET questions = new_qs
     WHERE id = s.id;
  END LOOP;
END $$;
