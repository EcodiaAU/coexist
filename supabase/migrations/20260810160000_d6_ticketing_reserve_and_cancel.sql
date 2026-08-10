-- =====================================================================
-- D6 remediation: ticketing correctness (reserve regression + cancel RPC)
-- =====================================================================
-- Origin: Co-Exist backlog remediation program 2026-08-10, cluster D6.
-- Additive + reversible ONLY: CREATE OR REPLACE on the SAME 6-arg signature
-- (no DROP, no signature change) + one NEW owner-scoped SECURITY DEFINER RPC.
-- No table/column/policy changes, no data mutation.
--
-- FIX 1 (major, backlog:467) reserve_event_ticket July regression.
--   The 2026-07-09 rewrite (20260709012000) added custom-answer handling but
--   silently dropped the three abandoned-checkout guards the 2026-05-01 version
--   (20260501000000) carried:
--     a) stale-pending cleanup (cancel this type's pending rows older than 15m),
--     b) own-pending cancel (cancel the caller's own live pending row for this
--        event, so a Retry Checkout does not pile a second ghost hold),
--     c) stale-exclusion in the capacity SUM
--        `(status <> 'pending' OR created_at > now() - interval '15 minutes')`.
--   Without them every Retry Checkout leaves a ghost 'pending' hold that counts
--   against capacity, driving a false "Sold out" until the 5-min expire cron
--   catches up (~5-20 min window). The transfer proc (20260713000000) already
--   uses the correct capacity shape; this realigns reserve with it.
--   This CREATE OR REPLACE keeps the exact 6-arg signature, the sale-window
--   checks, validate_ticket_answers gate, and custom_answers persistence intact.
--
-- FIX 2 (major, backlog:476) cancel_my_pending_ticket owner-scoped RPC.
--   useCancelPendingTicket did a client UPDATE on event_tickets, which has only
--   SELECT policies (no UPDATE policy) so it matched 0 rows, threw no error, and
--   reported success while the ticket stayed pending. Route cancellation through
--   this SECURITY DEFINER RPC that flips ONLY the caller's own pending ticket and
--   returns whether a row actually changed, so the client can surface real
--   success/failure.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FIX 1: reserve_event_ticket - restore the abandoned-checkout guards.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_event_ticket(
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
  -- (a) Clean up stale pending tickets for this type (>15 min old).
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE ticket_type_id = p_ticket_type_id
    AND status = 'pending'
    AND created_at < now() - INTERVAL '15 minutes';

  -- (b) Cancel any existing pending ticket for this user+event (abandoned
  --     checkout / Retry Checkout), so we never pile a second ghost hold.
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE event_id = p_event_id
    AND user_id = p_user_id
    AND status = 'pending';

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

  -- (c) Capacity: confirmed + checked_in + NON-STALE pending only. A pending row
  --     older than 15 min is on its way out (cron + the cleanup above), so it
  --     must not count against capacity.
  IF v_ticket_type.capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_sold
    FROM event_tickets
    WHERE ticket_type_id = p_ticket_type_id
      AND status IN ('pending', 'confirmed', 'checked_in')
      AND (status <> 'pending' OR created_at > now() - INTERVAL '15 minutes');

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

-- ---------------------------------------------------------------------
-- FIX 2: cancel_my_pending_ticket - owner-scoped pending cancellation.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_my_pending_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Only the caller's OWN pending ticket can be cancelled here.
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_ticket_id
    AND user_id = auth.uid()
    AND status = 'pending';

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  IF v_cancelled > 0 THEN
    -- Keep registration + campout chat membership consistent (the reconciler
    -- derives them from the count of still-valid tickets), matching the
    -- revoke/expire paths. Best-effort: never fail the cancel on a reconcile hiccup.
    BEGIN
      PERFORM public.reconcile_ticket_membership(
        (SELECT event_id FROM event_tickets WHERE id = p_ticket_id),
        auth.uid()
      );
    EXCEPTION WHEN undefined_function THEN
      NULL; -- reconciler not present in this environment; ticket cancel still stands
    END;
  END IF;

  RETURN v_cancelled > 0;
END;
$$;

-- Supabase's default privileges auto-grant EXECUTE on new public functions to
-- anon/authenticated/service_role, so REVOKE FROM PUBLIC alone leaves an explicit
-- anon grant. Revoke anon too (the body already blocks a null auth.uid(), this is
-- the grant-level belt): only authenticated + service_role may execute.
REVOKE ALL ON FUNCTION public.cancel_my_pending_ticket(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_my_pending_ticket(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_pending_ticket(uuid) TO authenticated;
