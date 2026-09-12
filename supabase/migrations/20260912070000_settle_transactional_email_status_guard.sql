-- ---------------------------------------------------------------------------
-- settle_transactional_email: refuse to move a TERMINAL row.
--
-- WHY. As shipped in 20260912060000 all three settle branches were a bare
-- `WHERE id = p_id`, with no check on the row's current status. So
-- settle(id,'retry') on a row already 'sent' flipped it back to 'pending' and
-- the drainer sent a SECOND email.
--
-- That needs no race to reach. attemptOutboxSend in stripe-webhook wraps its
-- own settle('sent') RPC inside the try block, so a LOST ACK on that call
-- (Postgres committed the update, the response never arrived) falls into the
-- catch, which settles 'retry'. The row is then 'sent' on disk and 'pending'
-- a moment later, and the next drain double-sends. The 5-minute lease reclaim
-- is a second, rarer path to the same place.
--
-- The same hole would flip a 'suppressed' row to 'pending'. That matters more
-- than the double-send: the 145 backfill rows stamped by 20260912060000 are
-- 'suppressed', and they are the only thing standing between the reconciliation
-- sweep and Tate's instruction of 2026-09-12, "No don't send". No current
-- caller reaches that path (both claim functions filter status='pending', so a
-- suppressed row can never be claimed and therefore never settled by a sender),
-- but a guard that depends on every future caller claiming first is not a
-- guard. This makes terminality a property of the row.
--
-- The migration that created these functions already reasoned this way about
-- enqueue: "It deliberately does NOT resurrect a terminal row." The claim
-- functions carry `AND status = 'pending'` for the same reason. settle was the
-- one member of the trio that did not, which is why a rule enforced in two of
-- three places still let the row move.
--
-- BEHAVIOUR CHANGE: settling a row that is no longer pending is now a no-op
-- that RETURNS THE STATUS THE ROW ACTUALLY HAS, rather than an exception. A
-- duplicate settle is a normal event on a retried delivery and must not fail
-- the Stripe webhook, so the caller learns the truth and moves on.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_transactional_email(
  p_id uuid,
  p_outcome text,
  p_error text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempts int;
  v_max int;
  v_status text;
  v_final text;
BEGIN
  IF p_outcome NOT IN ('sent','suppressed','retry') THEN
    RAISE EXCEPTION 'settle_transactional_email: outcome must be sent|suppressed|retry, got %', p_outcome;
  END IF;

  SELECT attempts, max_attempts, status INTO v_attempts, v_max, v_status
    FROM public.transactional_email_outbox WHERE id = p_id;
  IF v_attempts IS NULL THEN
    RAISE EXCEPTION 'settle_transactional_email: no outbox row %', p_id;
  END IF;

  -- TERMINAL IS TERMINAL. 'sent', 'suppressed' and 'failed' never move again.
  -- Returning the real status (rather than raising) keeps a duplicate settle
  -- from failing a Stripe delivery over an email that is already resolved.
  IF v_status <> 'pending' THEN
    RETURN v_status;
  END IF;

  IF p_outcome = 'sent' THEN
    UPDATE public.transactional_email_outbox
       SET status = 'sent', sent_at = now(), claimed_at = NULL, last_error = NULL
     WHERE id = p_id AND status = 'pending';
    RETURN 'sent';
  END IF;

  IF p_outcome = 'suppressed' THEN
    UPDATE public.transactional_email_outbox
       SET status = 'suppressed', claimed_at = NULL, last_error = p_error
     WHERE id = p_id AND status = 'pending';
    RETURN 'suppressed';
  END IF;

  v_final := CASE WHEN v_attempts >= v_max THEN 'failed' ELSE 'pending' END;

  UPDATE public.transactional_email_outbox
     SET status = v_final,
         claimed_at = NULL,
         last_error = p_error,
         next_attempt_at = now()
           + least(interval '1 hour', make_interval(secs => 60 * (v_attempts * v_attempts)))
   WHERE id = p_id AND status = 'pending';

  RETURN v_final;
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_transactional_email(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_transactional_email(uuid,text,text) TO service_role;
