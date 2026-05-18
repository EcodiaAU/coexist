-- Align impact-form survey questions with the Microsoft Form conventions
-- captured on the Master Impact Data Sheet across 43 May-2026 Forms rows.
--
-- TRULY OPTIONAL in Form (often blank on sheet):
--   q1 Other group attended | q2 Landcare | q3 OzFish
--   q4 Rubbish | q5 Trees | q6 Collect | q7 What & how much
--   q8 Hike/walk name
--
-- ALWAYS POPULATED in Form (0-1 blank in 43 rows, leader must answer):
--   q9 Issues, q11 Highlights, q14 Grant (free_text with "No" default - Form
--      pre-fills "No" so leader can hit submit unchanged)
--   q10 First aid, q12 OneDrive, q13 Google videos, q15 Insta (yes_no without
--      default - Form forces a conscious choice; mostly "Yes" in real data,
--      so defaulting to "No" in the app would under-report)
--
-- Companion to:
--   * supabase/functions/excel-sync/index.ts (buildExcelRow Forms-convention
--     defaults: q9/q11/q14 || 'No'; yesNo(q10/q12/q13/q15, 'No') fallback)
--   * src/components/survey-questions.tsx (Optional pill + yes/no tap-to-clear)
--   * src/pages/events/log-impact.tsx (default_value pre-fill)
--
-- Origin: Tate verbatim 2026-05-18 - "it needs to be identical to their
-- conventions and way of doing it via their form."
-- Doctrine: ~/ecodiaos/patterns/excel-sync-collectives-migration.md

DO $$
DECLARE
  canonical jsonb := jsonb_build_object(
    'q1',  jsonb_build_object(
      'id','q1','text','Other group attended','type','free_text','required',false,
      'description','Replace this if another group attended. Leave it as ''No, just Co-Exist!'' if it was just Co-Exist.',
      'placeholder','e.g. Bushcare group, school group',
      'text_multiline',false,'default_value','No, just Co-Exist!'),
    'q2',  jsonb_build_object(
      'id','q2','text','Which Landcare group','type','free_text','required',false,
      'description','If a Landcare group attended, which one? Leave blank otherwise.',
      'placeholder','e.g. Noosa Landcare','text_multiline',false),
    'q3',  jsonb_build_object(
      'id','q3','text','Which OzFish group','type','free_text','required',false,
      'description','If an OzFish group attended, which one? Leave blank otherwise.',
      'placeholder','e.g. OzFish Sunshine Coast','text_multiline',false),
    'q4',  jsonb_build_object(
      'id','q4','text','Rubbish removed (kg)','type','number','required',false,
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
