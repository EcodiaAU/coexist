-- Align impact-form survey questions with the sheet-sync mapping doctrine:
-- every question is optional, placeholders/descriptions explicitly tell the
-- leader to leave the field blank when not applicable. The Edge Function
-- excel-sync coerces "NA"/blank/"-" to empty string on the sheet via
-- isNoAnswer/freeText/numberOrBlank/yesNo so this only changes the UX side;
-- existing answers in survey_responses are untouched.
--
-- Origin: Tate verbatim 2026-05-18 - "what was it and how much, that should
-- be left blank if unanswered, not them have to put NA, and collect/make
-- anything should also be blank if unanswered, thing need to be left blank
-- like they have been on the sheet bro".
--
-- Companion to:
--   * supabase/functions/excel-sync/index.ts (buildExcelRow + freeText helpers)
--   * src/components/survey-questions.tsx (yes/no tap-to-clear + Optional pill)
-- Doctrine: ~/ecodiaos/patterns/excel-sync-collectives-migration.md

DO $$
DECLARE
  canonical jsonb := jsonb_build_object(
    'q1',  jsonb_build_object(
      'id','q1','text','Other group attended','type','free_text','required',false,
      'description','Was another group present? Leave blank if it was just Co-Exist.',
      'placeholder','e.g. Bushcare group, school group','text_multiline',false),
    'q2',  jsonb_build_object(
      'id','q2','text','Which Landcare group','type','free_text','required',false,
      'description','If a Landcare group attended, which one? Leave blank otherwise.',
      'placeholder','e.g. Noosa Landcare','text_multiline',false),
    'q3',  jsonb_build_object(
      'id','q3','text','Which OzFish group','type','free_text','required',false,
      'description','If an OzFish group attended, which one? Leave blank otherwise.',
      'placeholder','e.g. OzFish Sunshine Coast','text_multiline',false),
    'q4',  jsonb_build_object(
      'id','q4','text','Amount of rubbish removed (kg)','type','number','required',false,
      'description','Leave blank if none.','placeholder','e.g. 12','number_min',0),
    'q5',  jsonb_build_object(
      'id','q5','text','Trees planted','type','number','required',false,
      'description','Leave blank if none.','placeholder','e.g. 30','number_min',0),
    'q6',  jsonb_build_object(
      'id','q6','text','Collect or make anything?','type','yes_no','required',false,
      'description','Tap again to clear if not applicable.'),
    'q7',  jsonb_build_object(
      'id','q7','text','What was it, and how much?','type','free_text','required',false,
      'description','Only fill in if you ticked Yes above. Leave blank otherwise.',
      'placeholder','e.g. 3 bee hotels','text_multiline',true),
    'q8',  jsonb_build_object(
      'id','q8','text','Name of the hike or walking track','type','free_text','required',false,
      'description','Leave blank if not applicable.',
      'placeholder','e.g. Mount Cooroora summit track','text_multiline',false),
    'q9',  jsonb_build_object(
      'id','q9','text','Any issues to flag?','type','free_text','required',false,
      'description','Leave blank if everything ran smoothly.',
      'placeholder','e.g. Track closure, weather, gear','text_multiline',true),
    'q10', jsonb_build_object(
      'id','q10','text','Use the first aid kit?','type','yes_no','required',false,
      'description','Tap again to clear if not applicable.'),
    'q11', jsonb_build_object(
      'id','q11','text','Outstanding highlights','type','free_text','required',false,
      'description','Anything wholesome worth surfacing? Leave blank if none.',
      'placeholder','What stood out about this event','text_multiline',true),
    'q12', jsonb_build_object(
      'id','q12','text','Event images uploaded to OneDrive?','type','yes_no','required',false,
      'description','Tap again to clear if not applicable.'),
    'q13', jsonb_build_object(
      'id','q13','text','Event videos uploaded to Google Drive?','type','yes_no','required',false,
      'description','Tap again to clear if not applicable.'),
    'q14', jsonb_build_object(
      'id','q14','text','Grant project','type','free_text','required',false,
      'description','If part of a grant project, name it. Leave blank otherwise.',
      'placeholder','e.g. Coastal Connections 2026','text_multiline',false),
    'q15', jsonb_build_object(
      'id','q15','text','Posted event wrap-up on Instagram?','type','yes_no','required',false,
      'description','Tap again to clear if not applicable.')
  );
  s record;
  new_qs jsonb;
  q jsonb;
BEGIN
  FOR s IN
    SELECT id, activity_type, questions FROM public.surveys
     WHERE is_impact_form = true AND status = 'active'
  LOOP
    new_qs := '[]'::jsonb;
    FOR q IN SELECT * FROM jsonb_array_elements(s.questions)
    LOOP
      IF canonical ? (q->>'id') THEN
        new_qs := new_qs || jsonb_build_array(canonical->(q->>'id'));
      ELSE
        new_qs := new_qs || jsonb_build_array(q);
      END IF;
    END LOOP;

    UPDATE public.surveys SET questions = new_qs, updated_at = NOW()
     WHERE id = s.id;
  END LOOP;
END $$;
