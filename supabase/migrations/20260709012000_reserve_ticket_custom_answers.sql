-- =====================================================================
-- Persist + validate custom question answers at ticket reserve time
-- =====================================================================
-- Origin: Tate 2026-07-09. Answers to per-event custom questions are written
-- at the single canonical paid-path write point (reserve_event_ticket), and a
-- shared validator enforces required questions so the gate is server-side, not
-- just client-side. Free paths (claim/grant) call the same validator + write
-- custom_answers in their own inserts (edge-fn units).
--
-- reserve_event_ticket gains a trailing p_answers jsonb DEFAULT NULL: named
-- callers that omit it stay valid (default applies), so existing checkout calls
-- do not break. Shape: { "<question_id>": string | string[] | boolean | number }.
-- =====================================================================

-- Shared required-answer validator. RAISEs (check_violation) on a missing or
-- empty answer to an active required question. A boolean/number answer counts
-- as answered (only string-empty and array-empty are treated as missing).
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
       OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '')
       OR (jsonb_typeof(v) = 'array'  AND jsonb_array_length(v) = 0)
    THEN
      RAISE EXCEPTION 'Missing required answer: %', q.prompt USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$$;

-- Drop the old 5-arg signature so we cleanly replace (not overload) it.
DROP FUNCTION IF EXISTS public.reserve_event_ticket(uuid, uuid, uuid, integer, text);

CREATE FUNCTION public.reserve_event_ticket(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_user_id uuid,
  p_quantity integer DEFAULT 1,
  p_stripe_session_id text DEFAULT NULL,
  p_answers jsonb DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_ticket_type event_ticket_types;
  v_sold integer;
  v_ticket_id uuid;
  v_code text;
  v_attempts integer := 0;
BEGIN
  -- Lock the ticket type row
  SELECT * INTO v_ticket_type
  FROM event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket type not found or inactive';
  END IF;

  -- Sale window
  IF v_ticket_type.sale_start IS NOT NULL AND now() < v_ticket_type.sale_start THEN
    RAISE EXCEPTION 'Tickets not on sale yet';
  END IF;
  IF v_ticket_type.sale_end IS NOT NULL AND now() > v_ticket_type.sale_end THEN
    RAISE EXCEPTION 'Ticket sales have ended';
  END IF;

  -- Required custom-question gate (server-side, before capacity burn)
  PERFORM public.validate_ticket_answers(p_event_id, p_answers);

  -- Capacity (confirmed + pending, not cancelled/refunded)
  IF v_ticket_type.capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_sold
    FROM event_tickets
    WHERE ticket_type_id = p_ticket_type_id
      AND status IN ('pending', 'confirmed', 'checked_in');

    IF v_sold + p_quantity > v_ticket_type.capacity THEN
      RAISE EXCEPTION 'Sold out - only % tickets remaining', v_ticket_type.capacity - v_sold;
    END IF;
  END IF;

  -- Unique ticket code
  LOOP
    v_code := generate_ticket_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM event_tickets WHERE ticket_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique ticket code';
    END IF;
  END LOOP;

  INSERT INTO event_tickets (
    event_id, ticket_type_id, user_id, status, price_cents, quantity,
    stripe_checkout_session_id, ticket_code, custom_answers
  ) VALUES (
    p_event_id, p_ticket_type_id, p_user_id, 'pending',
    v_ticket_type.price_cents * p_quantity, p_quantity,
    p_stripe_session_id, v_code, COALESCE(p_answers, '{}'::jsonb)
  )
  RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$ LANGUAGE plpgsql;
