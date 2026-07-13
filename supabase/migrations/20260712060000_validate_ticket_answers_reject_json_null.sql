-- =====================================================================
-- validate_ticket_answers: treat an explicit JSON null as a missing answer
-- =====================================================================
-- Found by the 2.0.19 regression pass (Bug 3). The required-answer gate
-- caught a MISSING key (SQL NULL), an empty string and an empty array, but a
-- key present with JSON null has jsonb_typeof = 'null' and slipped straight
-- through, so a crafted API call could skip every required question.
--
-- Not reachable from the client (TicketQuestionsModal's isBlank() treats null
-- as blank and keeps Continue disabled), so this is defence-in-depth on the
-- server gate, which is the only gate an attacker cannot bypass.
--
-- probe: validate_ticket_answers(<event>, '{"<required-id>": null}') raised
-- nothing before this migration and raises 23514 after it.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.validate_ticket_answers(p_event_id uuid, p_answers jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q record;
  v jsonb;
BEGIN
  FOR q IN
    SELECT id, prompt FROM public.event_ticket_questions
    WHERE event_id = p_event_id AND is_active = true AND required = true
  LOOP
    v := COALESCE(p_answers, '{}'::jsonb) -> (q.id::text);
    IF v IS NULL
       OR jsonb_typeof(v) = 'null'                                   -- explicit JSON null counts as unanswered
       OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '')
       OR (jsonb_typeof(v) = 'array'  AND jsonb_array_length(v) = 0)
    THEN
      RAISE EXCEPTION 'Missing required answer: %', q.prompt USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$$;
