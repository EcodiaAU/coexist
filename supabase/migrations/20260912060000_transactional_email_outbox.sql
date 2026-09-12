-- ---------------------------------------------------------------------------
-- transactional_email_outbox - a durable record of every transactional email
-- we INTEND to send, so a failed send can be retried instead of vanishing.
--
-- WHY THIS EXISTS. Seven people paid AU$70 for the Murbpook Outback Campout
-- between 2026-08-19T19:32Z and 2026-08-25T23:36Z and never received a ticket
-- confirmation. Nothing threw: all 15 tickets on that event are `confirmed`,
-- Stripe got its 200, and the money is recorded correctly. The email leg alone
-- failed, because supabase-js does not attach an Authorization header to a
-- server-to-server functions.invoke, so every server-initiated send-email call
-- was rejected 401 (fixed 2026-08-26 in f99bd578). Platform-wide, resend_events
-- records ZERO ticket_confirmation deliveries on 08-20, 08-21, 08-22, 08-23 and
-- 08-24 while 27-79 other emails a day went out fine, which is the signature of
-- a path-specific failure rather than an outage.
--
-- THE 401 IS ALREADY FIXED. What this migration fixes is the reason the 401 was
-- able to cost anyone their email at all, which is a defect of shape and will
-- outlive that particular bug:
--
--   1. THE SEND RESULT WAS DISCARDED. stripe-webhook awaited sendTemplateEmail
--      and threw away its {ok, suppressed} return, so a failure reached a
--      console nobody reads and no row anywhere recorded it.
--
--   2. THE RETRY PATH WAS STRUCTURALLY BLOCKED, which is the deeper half and
--      the reason "check the return value" is not the fix. The handler's
--      idempotency guard was `if (ticket.status !== 'pending') break`, and the
--      status flip to 'confirmed' happened BEFORE the send. So the first
--      delivery consumed the idempotency token for the whole handler: every
--      subsequent Stripe retry, and every manual replay, read 'confirmed' and
--      returned before it ever reached the email. A per-order guard cannot
--      resume a per-step failure.
--
--   3. NOTHING RECONCILED. No query could answer "who paid and was never
--      told", so the gap was found by a human reading Resend's dashboard.
--
-- The outbox answers all three. The row is the durable intent AND the
-- cross-actor claim, so idempotency now lives at the granularity of the SEND
-- rather than the order, and a retry that finds the ticket already confirmed
-- still finds the email still owed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transactional_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The cross-actor claim. '<template>:<subject_id>', e.g.
  -- 'ticket_confirmation:<ticket_uuid>'. UNIQUE is what makes a duplicate
  -- webhook delivery, a manual replay and the reconciliation sweep all
  -- converge on ONE row and therefore one send.
  dedupe_key text NOT NULL UNIQUE,

  -- send-email template key ("type" in its payload).
  template text NOT NULL,

  -- Addressing. user_id is preferred: it makes send-email run its real
  -- production path (notification preferences, marketing opt-out, suppression
  -- list). to_email is only for a recipient with no account.
  user_id uuid,
  to_email text,

  -- Rides along as the Resend `ticket_id` tag, which is how resend-webhook maps
  -- an asynchronous bounce back to the ticket it belongs to.
  ticket_id uuid,

  -- Intent, never rendered content. Content is derived at SEND time on
  -- purpose: a guest magic link minted at enqueue time can be dead by the time
  -- a retry drains, and an event's title or address can change in between.
  context jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- pending    -> owed, will be attempted
  -- sent       -> Resend accepted it (terminal)
  -- suppressed -> we deliberately declined to send (terminal, NEVER retried:
  --               opt-out, preference off, admin-disabled template, dead
  --               address). Retrying a deliberate non-send is how a
  --               suppression becomes an infinite loop.
  -- failed     -> attempts exhausted (terminal, and the thing to alarm on)
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','suppressed','failed')),

  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),

  -- Drainer lease, so two concurrent drains cannot both send one row.
  claimed_at timestamptz,

  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.transactional_email_outbox IS
  'Durable intent for every transactional email. A row is created BEFORE the send is attempted, so a send that fails is owed rather than lost. dedupe_key is the cross-actor claim: webhook, drainer, reconciliation sweep and operator tool all converge on one row.';

-- The drainer''s only hot query: pending rows that are due.
CREATE INDEX IF NOT EXISTS transactional_email_outbox_due_idx
  ON public.transactional_email_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS transactional_email_outbox_ticket_idx
  ON public.transactional_email_outbox (ticket_id)
  WHERE ticket_id IS NOT NULL;

-- Operator surface: what is stuck, and what gave up.
CREATE INDEX IF NOT EXISTS transactional_email_outbox_status_idx
  ON public.transactional_email_outbox (status, created_at DESC);

ALTER TABLE public.transactional_email_outbox ENABLE ROW LEVEL SECURITY;

-- No anon or member policy at all. This table names who is owed which email
-- and carries addresses; it is service_role-only by construction, matching the
-- 2026-09-05 lock-anon-writers pass. RLS enabled with zero policies denies
-- every non-service caller.
REVOKE ALL ON TABLE public.transactional_email_outbox FROM anon;
REVOKE ALL ON TABLE public.transactional_email_outbox FROM authenticated;
GRANT ALL ON TABLE public.transactional_email_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.touch_transactional_email_outbox()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_transactional_email_outbox_touch ON public.transactional_email_outbox;
CREATE TRIGGER trg_transactional_email_outbox_touch
  BEFORE UPDATE ON public.transactional_email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.touch_transactional_email_outbox();

-- ---------------------------------------------------------------------------
-- 1. enqueue - the claim. Called by stripe-webhook BEFORE it flips ticket
--    status, and by the reconciliation sweep.
--
-- ON CONFLICT DO NOTHING plus a fallback SELECT means the SECOND caller gets
-- the FIRST caller's row id rather than an error or a second row. That is what
-- makes a duplicate Stripe delivery safe without the caller having to reason
-- about ordering.
--
-- It deliberately does NOT resurrect a terminal row. A row already 'sent' stays
-- sent (so a retry cannot double-send) and one already 'suppressed' stays
-- suppressed (so a retry cannot override a member's opt-out).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_transactional_email(
  p_dedupe_key text,
  p_template text,
  p_user_id uuid DEFAULT NULL,
  p_to_email text DEFAULT NULL,
  p_ticket_id uuid DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_dedupe_key IS NULL OR length(trim(p_dedupe_key)) = 0 THEN
    RAISE EXCEPTION 'enqueue_transactional_email: dedupe_key is required';
  END IF;
  IF p_user_id IS NULL AND (p_to_email IS NULL OR length(trim(p_to_email)) = 0) THEN
    RAISE EXCEPTION 'enqueue_transactional_email: need a user_id or a to_email';
  END IF;

  INSERT INTO public.transactional_email_outbox
    (dedupe_key, template, user_id, to_email, ticket_id, context)
  VALUES
    (p_dedupe_key, p_template, p_user_id, nullif(trim(p_to_email), ''), p_ticket_id,
     coalesce(p_context, '{}'::jsonb))
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.transactional_email_outbox
    WHERE dedupe_key = p_dedupe_key;
  END IF;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. claim a batch - FOR UPDATE SKIP LOCKED so concurrent drains partition the
--    work instead of fighting over it. attempts is incremented AT CLAIM TIME,
--    not at settle time: a worker that dies mid-send has still burned an
--    attempt, which is what stops a row that reliably kills its drainer from
--    looping forever.
--
-- The 5-minute lease reclaim is the other half of that: a claimed row whose
-- worker never came back becomes eligible again, so a crash costs one attempt
-- and five minutes rather than the email.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_transactional_email_batch(p_limit int DEFAULT 25)
RETURNS SETOF public.transactional_email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.transactional_email_outbox o
     SET claimed_at = now(),
         attempts = o.attempts + 1
   WHERE o.id IN (
     SELECT c.id
       FROM public.transactional_email_outbox c
      WHERE c.status = 'pending'
        AND c.next_attempt_at <= now()
        AND (c.claimed_at IS NULL OR c.claimed_at < now() - interval '5 minutes')
      ORDER BY c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT greatest(1, least(coalesce(p_limit, 25), 200))
   )
  RETURNING o.*;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. settle - record what actually happened.
--
-- 'suppressed' is TERMINAL. send-email answers HTTP 200 with success:false for
-- a deliberate non-send (preference off, opt-out, admin-disabled template,
-- suppressed address). Treating that as a failure to retry is how a member who
-- asked not to be emailed gets emailed every five minutes forever; treating it
-- as a success is how a real 401 certifies healthy. It is its own outcome.
--
-- A retryable failure leaves status 'pending' and pushes next_attempt_at out on
-- an exponential backoff (1m, 4m, 9m, 16m, 25m, capped 1h), until max_attempts
-- is spent and the row goes 'failed' for a human to look at.
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
  v_final text;
BEGIN
  IF p_outcome NOT IN ('sent','suppressed','retry') THEN
    RAISE EXCEPTION 'settle_transactional_email: outcome must be sent|suppressed|retry, got %', p_outcome;
  END IF;

  SELECT attempts, max_attempts INTO v_attempts, v_max
    FROM public.transactional_email_outbox WHERE id = p_id;
  IF v_attempts IS NULL THEN
    RAISE EXCEPTION 'settle_transactional_email: no outbox row %', p_id;
  END IF;

  IF p_outcome = 'sent' THEN
    UPDATE public.transactional_email_outbox
       SET status = 'sent', sent_at = now(), claimed_at = NULL, last_error = NULL
     WHERE id = p_id;
    RETURN 'sent';
  END IF;

  IF p_outcome = 'suppressed' THEN
    UPDATE public.transactional_email_outbox
       SET status = 'suppressed', claimed_at = NULL, last_error = p_error
     WHERE id = p_id;
    RETURN 'suppressed';
  END IF;

  v_final := CASE WHEN v_attempts >= v_max THEN 'failed' ELSE 'pending' END;

  UPDATE public.transactional_email_outbox
     SET status = v_final,
         claimed_at = NULL,
         last_error = p_error,
         next_attempt_at = now()
           + least(interval '1 hour', make_interval(secs => 60 * (v_attempts * v_attempts)))
   WHERE id = p_id;

  RETURN v_final;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_transactional_email(text,text,uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_transactional_email(text,text,uuid,text,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.claim_transactional_email_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transactional_email_batch(int) TO service_role;
REVOKE ALL ON FUNCTION public.settle_transactional_email(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_transactional_email(uuid,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. THE HISTORICAL BACKFILL, and it is the most dangerous line in this file.
--
-- The reconciliation sweep below asks "which confirmed ticket has no outbox
-- row". At apply time that is EVERY confirmed ticket ever sold, because the
-- table is new. The 401 was chronic rather than a six-day window (board row
-- a7013e54 records ticket buyers going unconfirmed "for months"), so an
-- unguarded first sweep would mail hundreds of people about events that are
-- already over. Tate's instruction on 2026-09-12 was explicit: "No don't
-- send." A sweep that mass-mails on its first fire would do the exact thing he
-- refused, mechanically, at 2am.
--
-- So every ticket that is ALREADY confirmed is stamped with a TERMINAL outbox
-- row now, before the sweep can ever run. The sweep is then structurally
-- incapable of reaching anyone who bought before this migration: the claim
-- already exists and ON CONFLICT DO NOTHING refuses to replace it.
--
-- Same gesture, and the same reasoning, as migration 20260826090000 stamping
-- already-refunded tickets so the new refund path could not mail people about
-- refunds weeks gone.
--
-- Deliberately NOT backfilled: tickets in 'pending' or 'reserved'. Those are
-- live, unpaid rows. Someone who pays one of them TOMORROW must get a real
-- confirmation, so claiming them now would silently re-open the original bug
-- for the next buyer.
--
-- To re-enable one deliberately (an operator decision, per ticket, never in
-- bulk): DELETE the row from transactional_email_outbox for that dedupe_key,
-- or set status='pending', next_attempt_at=now().
-- ---------------------------------------------------------------------------
INSERT INTO public.transactional_email_outbox
  (dedupe_key, template, user_id, ticket_id, context, status, attempts, sent_at, last_error)
SELECT
  'ticket_confirmation:' || t.id::text,
  'ticket_confirmation',
  t.user_id,
  t.id,
  jsonb_build_object('event_id', t.event_id, 'backfill', true),
  'suppressed',
  0,
  NULL,
  'pre_outbox_backfill: ticket predates the outbox; claimed terminal so the reconciliation sweep cannot retroactively email historical buyers (Tate 2026-09-12: do not send)'
FROM public.event_tickets t
WHERE t.status = 'confirmed'
ON CONFLICT (dedupe_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. reconcile - the standing answer to "who paid and was never told".
--
-- This is the belt that does not depend on the webhook having behaved. It
-- looks at PAID STATE (a confirmed ticket) and asks whether an email was ever
-- owed for it, and enqueues one if not. So a confirmation is now recoverable
-- from any failure mode, including ones we have not met yet: a Stripe delivery
-- that never arrived at all, a function cold-start timeout, a deploy mid-write,
-- an outage in Resend.
--
-- Belt two on top of the backfill: only tickets for events that have NOT ended
-- are considered. A confirmation for a finished event helps nobody and reads as
-- spam, so even a mistakenly-cleared claim cannot mail about the past.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_ticket_confirmation_outbox(
  p_limit int DEFAULT 200,
  p_dry_run boolean DEFAULT false
)
RETURNS TABLE (ticket_id uuid, user_id uuid, event_id uuid, enqueued boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.id, t.user_id, t.event_id
      FROM public.event_tickets t
      JOIN public.events e ON e.id = t.event_id
     WHERE t.status = 'confirmed'
       AND t.user_id IS NOT NULL
       -- the event has not ended (date_end, else start + 2h), matching the
       -- eligibility rule promote_free_event_waitlist already uses
       AND coalesce(e.date_end, e.date_start + interval '2 hours') > now()
       AND NOT EXISTS (
         SELECT 1 FROM public.transactional_email_outbox o
          WHERE o.dedupe_key = 'ticket_confirmation:' || t.id::text
       )
     ORDER BY t.created_at
     LIMIT greatest(1, least(coalesce(p_limit, 200), 1000))
  LOOP
    IF p_dry_run THEN
      RETURN QUERY SELECT r.id, r.user_id, r.event_id, false;
    ELSE
      PERFORM public.enqueue_transactional_email(
        'ticket_confirmation:' || r.id::text,
        'ticket_confirmation',
        r.user_id,
        NULL,
        r.id,
        jsonb_build_object('event_id', r.event_id, 'source', 'reconcile')
      );
      RETURN QUERY SELECT r.id, r.user_id, r.event_id, true;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_ticket_confirmation_outbox(int,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_ticket_confirmation_outbox(int,boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. pg_cron entrypoint -> the drainer edge function. Emails live in an edge
--    function because the database cannot send one. Same shape as
--    cron_free_waitlist_promote.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_transactional_email_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/transactional-email-drain';
  svc_key  text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || svc_key),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_transactional_email_drain() FROM PUBLIC, anon, authenticated;

-- Job scheduled at apply time (idempotent):
--   SELECT cron.schedule('transactional-email-drain', '*/5 * * * *',
--                        'SELECT public.cron_transactional_email_drain()');

-- ---------------------------------------------------------------------------
-- 7. claim ONE row by id - what the webhook's inline attempt uses.
--
-- The webhook still tries to send immediately, because a buyer should have
-- their ticket in seconds rather than on the next cron tick. That makes TWO
-- senders for one email, so the claim has to be decided by Postgres rather
-- than by either process: one conditional UPDATE, and whoever gets the row
-- sends. The loser gets zero rows back and does nothing.
--
-- Same shape as the refund claim in _shared/ticket-email-resend.ts, which
-- learned it the hard way.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_transactional_email(p_id uuid)
RETURNS SETOF public.transactional_email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.transactional_email_outbox o
     SET claimed_at = now(),
         attempts = o.attempts + 1
   WHERE o.id = p_id
     AND o.status = 'pending'
     AND (o.claimed_at IS NULL OR o.claimed_at < now() - interval '5 minutes')
  RETURNING o.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_transactional_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transactional_email(uuid) TO service_role;
