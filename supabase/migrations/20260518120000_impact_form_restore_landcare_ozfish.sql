-- Impact-form survey: restore Landcare (q2) + OzFish (q3) as explicit
-- conditional questions, gated by q1 (Did another group attend?) = Yes.
--
-- 20260518100000_impact_form_questions_leave_blank_ux.sql removed q2 + q3
-- from per_activity ordering to nuke the "they still show before I click
-- Yes" complaint, but that was the wrong fix: those two cells map directly
-- to sheet col 8 (Which Landcare Group) and col 9 (Which OzFish group),
-- which the excel-sync index.ts buildExcelRow path reads as the PRIMARY
-- source (legacy q1_name regex is the FALLBACK at lines 487-498).
--
-- Correct fix: keep the explicit q2 + q3 questions, but gate visibility
-- via show_if so they only render when the leader clicks Yes on q1.
-- isQuestionVisible() in survey-questions-utils.ts already filters by
-- show_if, and log-impact.tsx already seeds default_value 'No' for q1,
-- so render-path math is: q1 default 'No' -> q2/q3 show_if 'Yes' -> hidden
-- until the leader explicitly clicks Yes. The "still showing" bug Tate
-- saw was an old TestFlight build (1.8.9 pre-isQuestionVisible). The
-- web build via Vercel auto-deploy already had the filter.
--
-- Per-activity ordering: q1, q1_name, q2, q3 cluster together at the top
-- (q1_name + q2 + q3 all conditional on q1=Yes), then activity-specific
-- main stat, then q6/q7 cluster, then common closing.

DO $$
DECLARE
  canonical jsonb := jsonb_build_object(
    'q1',  jsonb_build_object(
      'id','q1','text','Did another group attend?','type','yes_no','required',true,
      'default_value','No'),
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
      'id','q9','text','Any issues?','type','free_text','required',true,
      'placeholder','No / describe','text_multiline',true,'default_value','No'),
    'q10', jsonb_build_object(
      'id','q10','text','Use the first aid kit?','type','yes_no','required',true),
    'q11', jsonb_build_object(
      'id','q11','text','Highlights','type','free_text','required',true,
      'placeholder','No / describe','text_multiline',true,'default_value','No'),
    'q12', jsonb_build_object(
      'id','q12','text','Images uploaded to OneDrive?','type','yes_no','required',true),
    'q13', jsonb_build_object(
      'id','q13','text','Videos uploaded to Google Drive?','type','yes_no','required',true),
    'q14', jsonb_build_object(
      'id','q14','text','Grant project','type','free_text','required',true,
      'placeholder','No / project name','text_multiline',false,'default_value','No'),
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
