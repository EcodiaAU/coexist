-- =====================================================================
-- Ticketing: member self-service (refund + person-to-person transfer)
-- and the organiser "hold a spot, still prompt payment" reserve flow.
-- =====================================================================
-- Origin: Angelica / Co-Exist, 2026-08-24 (gmail thread 19fcff2ea4b8e4b9).
-- Two gaps she hit in the same week:
--   A. Refunds and ticket changes are ORGANISER-only. A ticket holder who
--      needs out has to get a human to do it.
--   B. The only comp is a FREE ticket (grant-event-ticket). There was no way
--      to hold a spot for a named person on a FULL event while still asking
--      them to pay. She hit this on her own Wild Mountains ticket and again
--      comping Max Sonderman.
--
-- Additive and reversible ONLY: one new status value, nullable columns, one
-- new table, CREATE OR REPLACE on existing functions keeping their exact
-- signatures. No DROP, no data mutation, no policy removal.
--
-- WHY A NEW STATUS AND NOT 'pending' (both were probed before choosing):
--   1. expire_stale_pending_tickets() cancels ANY 'pending' row older than
--      15 minutes, unconditionally. A hold would silently evaporate.
--   2. reserve_event_ticket step (b) cancels the caller's own live 'pending'
--      row for the event before re-reserving, and the fresh reserve then hits
--      the capacity check. An invitee paying for their own over-capacity hold
--      would be told "Sold out" - the exact bug being fixed here.
-- So a hold gets its own status and its own clock (hold_expires_at).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The 'reserved' status + hold metadata
-- ---------------------------------------------------------------------
ALTER TABLE public.event_tickets
  DROP CONSTRAINT IF EXISTS event_tickets_status_check;

ALTER TABLE public.event_tickets
  ADD CONSTRAINT event_tickets_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'confirmed'::text, 'cancelled'::text,
    'refunded'::text, 'checked_in'::text, 'reserved'::text
  ]));

ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_note   text;

COMMENT ON COLUMN public.event_tickets.hold_expires_at IS
  'For status=reserved: when the organiser hold lapses. NULL = holds until the event.';
COMMENT ON COLUMN public.event_tickets.reserved_by IS
  'For status=reserved: the organiser who held the spot (audit + who chases payment).';

CREATE INDEX IF NOT EXISTS idx_tickets_reserved_expiry
  ON public.event_tickets(hold_expires_at)
  WHERE status = 'reserved';

-- ---------------------------------------------------------------------
-- 2. Per-event self-service switches. DEFAULT FALSE ON PURPOSE.
-- ---------------------------------------------------------------------
-- The member-facing refund/transfer TERMS wording is owed by Angelica + Tate
-- and is deliberately not invented in this migration. Shipping the mechanics
-- dark (opt-in per event) is what keeps that gate honest: nothing member-facing
-- turns on until a human flips it with real terms in hand.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS self_service_refund_enabled      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS self_service_refund_cutoff_hours integer NOT NULL DEFAULT 168,
  ADD COLUMN IF NOT EXISTS self_service_transfer_enabled    boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.self_service_refund_cutoff_hours IS
  'Hours before date_start after which a member can no longer self-refund. Default 168 (7 days).';

-- ---------------------------------------------------------------------
-- 3. Capacity + occupancy: a held seat IS a taken seat
-- ---------------------------------------------------------------------
-- A reserved spot is held against capacity. If these did not count it, the
-- organiser would hold a spot and the app would immediately resell it.

CREATE OR REPLACE FUNCTION public.event_spots_taken(p_event_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_event_id AND e.is_ticketed = true
    )
    THEN COALESCE((
      SELECT SUM(quantity)::int
      FROM event_tickets
      WHERE event_id = p_event_id
        AND status IN ('confirmed', 'checked_in', 'reserved')
    ), 0)
    ELSE (
      SELECT count(*)::int
      FROM event_registrations
      WHERE event_id = p_event_id
        AND status IN ('registered', 'attended')
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_ticket_availability(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_data) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'ticket_type_id', tt.id,
      'capacity', tt.capacity,
      'sold', COALESCE(s.sold_qty, 0),
      'remaining', CASE WHEN tt.capacity IS NULL THEN NULL
                        ELSE GREATEST(0, tt.capacity - COALESCE(s.sold_qty, 0)) END
    ) AS row_data
    FROM event_ticket_types tt
    LEFT JOIN (
      SELECT ticket_type_id, SUM(quantity) AS sold_qty
      FROM event_tickets
      WHERE event_id = p_event_id
        AND status IN ('pending', 'confirmed', 'checked_in', 'reserved')
        AND (status <> 'pending' OR created_at > now() - INTERVAL '15 minutes')
      GROUP BY ticket_type_id
    ) s ON s.ticket_type_id = tt.id
    WHERE tt.event_id = p_event_id AND tt.is_active = true
  ) sub;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. reserve_event_ticket: never eat a hold, always count one
-- ---------------------------------------------------------------------
-- Same 6-arg signature. Two changes only:
--   (b) the "cancel the caller's abandoned pending row" sweep is scoped to
--       status = 'pending' explicitly, so it can never cancel a reserved hold.
--   (c) the capacity SUM counts reserved rows.
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

  -- (b) Cancel any existing PENDING ticket for this user+event (abandoned
  --     checkout / Retry Checkout). Explicitly scoped to 'pending': a
  --     'reserved' hold is an organiser promise, not an abandoned checkout,
  --     and must survive this sweep.
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE event_id = p_event_id
    AND user_id = p_user_id
    AND status = 'pending';

  SELECT * INTO v_ticket_type
  FROM event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket type not found or inactive';
  END IF;

  IF v_ticket_type.sale_start IS NOT NULL AND now() < v_ticket_type.sale_start THEN
    RAISE EXCEPTION 'Tickets not on sale yet';
  END IF;
  IF v_ticket_type.sale_end IS NOT NULL AND now() > v_ticket_type.sale_end THEN
    RAISE EXCEPTION 'Ticket sales have ended';
  END IF;

  PERFORM public.validate_ticket_answers(p_event_id, p_answers);

  -- (c) Capacity: confirmed + checked_in + reserved + NON-STALE pending.
  --     A reserved hold occupies a seat exactly like a confirmed one.
  IF v_ticket_type.capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_sold
    FROM event_tickets
    WHERE ticket_type_id = p_ticket_type_id
      AND status IN ('pending', 'confirmed', 'checked_in', 'reserved')
      AND (status <> 'pending' OR created_at > now() - INTERVAL '15 minutes');

    IF v_sold + p_quantity > v_ticket_type.capacity THEN
      RAISE EXCEPTION 'Sold out - only % tickets remaining', v_ticket_type.capacity - v_sold;
    END IF;
  END IF;

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
-- 5. transfer_event_ticket: count holds, do not move them
-- ---------------------------------------------------------------------
-- Only the sold-count changes (reserved now counts). A reserved ticket is
-- still not movable between events: the guard already requires
-- confirmed/checked_in, and an unpaid hold has no business migrating.
CREATE OR REPLACE FUNCTION public.transfer_event_ticket(
  p_ticket_id uuid,
  p_target_event_id uuid,
  p_target_ticket_type_id uuid default null,
  p_override_capacity boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ticket      public.event_tickets;
  v_target_evt  public.events;
  v_type        public.event_ticket_types;
  v_sold        integer;
  v_dupe        integer;
  v_from_event  uuid;
begin
  select * into v_ticket from public.event_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  if v_ticket.status not in ('confirmed', 'checked_in') then
    raise exception 'Only a confirmed ticket can be moved (this one is %)', v_ticket.status;
  end if;

  v_from_event := v_ticket.event_id;

  if v_from_event = p_target_event_id then
    return jsonb_build_object(
      'ok', true, 'skipped', true, 'reason', 'already_on_target_event',
      'ticket_id', v_ticket.id, 'user_id', v_ticket.user_id,
      'from_event_id', v_from_event, 'to_event_id', p_target_event_id
    );
  end if;

  select * into v_target_evt from public.events where id = p_target_event_id;
  if not found then
    raise exception 'Target event not found';
  end if;
  if coalesce(v_target_evt.is_ticketed, false) = false then
    raise exception 'Target event does not use tickets';
  end if;
  if v_target_evt.status = 'cancelled' then
    raise exception 'Target event is cancelled';
  end if;

  if p_target_ticket_type_id is not null then
    select * into v_type from public.event_ticket_types
    where id = p_target_ticket_type_id and event_id = p_target_event_id for update;
    if not found then
      raise exception 'Target ticket type does not belong to the target event';
    end if;
  else
    select * into v_type from public.event_ticket_types
    where event_id = p_target_event_id and is_active = true
    order by sort_order asc nulls last, price_cents asc limit 1 for update;
    if not found then
      raise exception 'Target event has no active ticket type';
    end if;
  end if;

  select count(*) into v_dupe
  from public.event_tickets
  where event_id = p_target_event_id
    and user_id = v_ticket.user_id
    and status in ('confirmed', 'checked_in')
    and id <> v_ticket.id;

  if v_dupe > 0 then
    return jsonb_build_object(
      'ok', true, 'skipped', true, 'reason', 'already_has_ticket_on_target',
      'ticket_id', v_ticket.id, 'user_id', v_ticket.user_id,
      'from_event_id', v_from_event, 'to_event_id', p_target_event_id
    );
  end if;

  -- Sold count now includes reserved holds on the target type.
  if v_type.capacity is not null and p_override_capacity = false then
    select coalesce(sum(quantity), 0) into v_sold
    from public.event_tickets
    where ticket_type_id = v_type.id
      and status in ('pending', 'confirmed', 'checked_in', 'reserved')
      and (status <> 'pending' or created_at > now() - interval '15 minutes');

    if v_sold + v_ticket.quantity > v_type.capacity then
      raise exception 'Target ticket type is full (% of % taken)', v_sold, v_type.capacity;
    end if;
  end if;

  update public.event_tickets
    set event_id       = p_target_event_id,
        ticket_type_id = v_type.id,
        status         = 'confirmed',
        checked_in_at  = null,
        updated_at     = now()
  where id = v_ticket.id;

  perform public.reconcile_ticket_membership(v_from_event, v_ticket.user_id);
  perform public.reconcile_ticket_membership(p_target_event_id, v_ticket.user_id);

  return jsonb_build_object(
    'ok', true, 'skipped', false,
    'ticket_id', v_ticket.id, 'user_id', v_ticket.user_id,
    'from_event_id', v_from_event, 'to_event_id', p_target_event_id,
    'to_ticket_type_id', v_type.id, 'ticket_code', v_ticket.ticket_code,
    'quantity', v_ticket.quantity, 'price_cents', v_ticket.price_cents
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Holds have their own clock
-- ---------------------------------------------------------------------
-- Deliberately NOT folded into expire_stale_pending_tickets: that function's
-- contract is the 15-minute abandoned-checkout sweep, and a hold must never be
-- subject to it.
CREATE OR REPLACE FUNCTION public.expire_lapsed_ticket_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE status = 'reserved'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_lapsed_ticket_holds() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_lapsed_ticket_holds() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_lapsed_ticket_holds() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-lapsed-ticket-holds');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'expire-lapsed-ticket-holds',
  '*/15 * * * *',
  $$select public.expire_lapsed_ticket_holds()$$
);

-- ---------------------------------------------------------------------
-- 7. Attendee export: show holds on the roster
-- ---------------------------------------------------------------------
-- reserved sorts directly after the valid tickets and ahead of pending, so an
-- organiser reading the roster sees who is holding but has not paid.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_event_attendee_export';

  IF v_def IS NOT NULL AND position('''reserved''' in v_def) = 0 THEN
    v_def := replace(
      v_def,
      'WHEN ''checked_in'' THEN 0 WHEN ''pending'' THEN 1',
      'WHEN ''checked_in'' THEN 0 WHEN ''reserved'' THEN 1 WHEN ''pending'' THEN 2'
    );
    EXECUTE v_def;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 8. Person-to-person ticket transfers
-- ---------------------------------------------------------------------
-- Distinct from transfer_event_ticket (which moves a ticket between EVENTS).
-- This moves a ticket between PEOPLE. The money never moves: the same row and
-- the same Stripe charge stay put, only user_id changes.
--
-- trg_reconcile_event_ticket_state ALREADY fires on user_id and reconciles the
-- old holder (see 20260713000000), so chat membership and registration follow
-- the ticket with no new trigger work.
CREATE TABLE IF NOT EXISTS public.event_ticket_transfers (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id     uuid NOT NULL REFERENCES public.event_tickets(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  from_user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_email      text NOT NULL,
  to_user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'claimed', 'cancelled', 'expired')),
  token         text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket ON public.event_ticket_transfers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_from   ON public.event_ticket_transfers(from_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_transfers_one_live
  ON public.event_ticket_transfers(ticket_id) WHERE status = 'pending';

ALTER TABLE public.event_ticket_transfers ENABLE ROW LEVEL SECURITY;

-- The sender can see their own offers. The TOKEN is never exposed by a client
-- read: it travels only in the emailed claim link and is validated server-side
-- (the same shape as the event_claim_tokens relocation in 20260810140000).
DROP POLICY IF EXISTS "ticket_transfers_select_own" ON public.event_ticket_transfers;
CREATE POLICY "ticket_transfers_select_own" ON public.event_ticket_transfers
  FOR SELECT TO authenticated USING (from_user_id = auth.uid());

DROP POLICY IF EXISTS "ticket_transfers_select_staff" ON public.event_ticket_transfers;
CREATE POLICY "ticket_transfers_select_staff" ON public.event_ticket_transfers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_ticket_transfers.event_id
        AND (public.is_collective_staff(auth.uid(), e.collective_id)
             OR public.is_admin_or_staff(auth.uid()))
    )
  );

-- No INSERT/UPDATE/DELETE policy: writes go through the RPCs below and the
-- self-service-ticket edge function, matching event_tickets' SELECT-only shape.

-- ---------------------------------------------------------------------
-- 9. Member-facing RPCs (owner-scoped, SECURITY DEFINER)
-- ---------------------------------------------------------------------

-- What can I actually do with this ticket right now? One server-side answer so
-- the UI never has to re-derive policy (and cannot drift from it).
CREATE OR REPLACE FUNCTION public.get_my_ticket_self_service(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket public.event_tickets;
  v_event  public.events;
  v_cutoff timestamptz;
  v_can_refund boolean := false;
  v_can_transfer boolean := false;
  v_reason text := null;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_ticket FROM event_tickets
  WHERE id = p_ticket_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_ticket.event_id;

  v_cutoff := v_event.date_start
            - make_interval(hours => COALESCE(v_event.self_service_refund_cutoff_hours, 168));

  IF v_ticket.status = 'checked_in' THEN
    v_reason := 'checked_in';
  ELSIF v_ticket.status <> 'confirmed' THEN
    v_reason := 'not_confirmed';
  ELSIF v_event.status = 'cancelled' THEN
    v_reason := 'event_cancelled';
  ELSIF v_event.date_start <= now() THEN
    v_reason := 'event_started';
  ELSE
    v_can_refund   := COALESCE(v_event.self_service_refund_enabled, false) AND now() < v_cutoff;
    v_can_transfer := COALESCE(v_event.self_service_transfer_enabled, false);
    IF NOT v_can_refund AND COALESCE(v_event.self_service_refund_enabled, false) AND now() >= v_cutoff THEN
      v_reason := 'past_refund_cutoff';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'ticket_id', v_ticket.id,
    'status', v_ticket.status,
    'price_cents', v_ticket.price_cents,
    'is_paid', (v_ticket.price_cents > 0 AND v_ticket.stripe_payment_intent_id IS NOT NULL),
    'hold_expires_at', v_ticket.hold_expires_at,
    'can_refund', v_can_refund,
    'can_transfer', v_can_transfer,
    'refund_cutoff_at', v_cutoff,
    'refund_enabled_for_event', COALESCE(v_event.self_service_refund_enabled, false),
    'transfer_enabled_for_event', COALESCE(v_event.self_service_transfer_enabled, false),
    'blocked_reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_ticket_self_service(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_ticket_self_service(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_ticket_self_service(uuid) TO authenticated;

-- Start a person-to-person transfer of MY ticket. Returns the offer + token so
-- the caller (edge function) can email the claim link.
CREATE OR REPLACE FUNCTION public.start_my_ticket_transfer(
  p_ticket_id uuid,
  p_to_email  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket public.event_tickets;
  v_event  public.events;
  v_token  text;
  v_id     uuid;
  v_email  text := lower(trim(p_to_email));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'A valid recipient email is required';
  END IF;

  SELECT * INTO v_ticket FROM event_tickets
  WHERE id = p_ticket_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF v_ticket.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed ticket can be transferred (this one is %)', v_ticket.status;
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_ticket.event_id;
  IF NOT COALESCE(v_event.self_service_transfer_enabled, false) THEN
    RAISE EXCEPTION 'Ticket transfer is not enabled for this event';
  END IF;
  IF v_event.date_start <= now() THEN
    RAISE EXCEPTION 'This event has already started';
  END IF;

  -- One live offer per ticket (also enforced by idx_ticket_transfers_one_live).
  UPDATE event_ticket_transfers
  SET status = 'cancelled'
  WHERE ticket_id = p_ticket_id AND status = 'pending';

  -- Two v4 UUIDs (64 hex chars, ~244 bits of CSPRNG entropy). NOT
  -- gen_random_bytes: pgcrypto lives in the `extensions` schema on Supabase and
  -- this function pins search_path to 'public', so the unqualified call fails at
  -- runtime (probed 2026-08-24). gen_random_uuid() is core PG, always resolvable.
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO event_ticket_transfers (ticket_id, event_id, from_user_id, to_email, token)
  VALUES (p_ticket_id, v_ticket.event_id, auth.uid(), v_email, v_token)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'transfer_id', v_id, 'token', v_token,
    'ticket_id', p_ticket_id, 'event_id', v_ticket.event_id,
    'event_title', v_event.title, 'to_email', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_my_ticket_transfer(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_my_ticket_transfer(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_my_ticket_transfer(uuid, text) TO authenticated;

-- Cancel my own outstanding transfer offer.
CREATE OR REPLACE FUNCTION public.cancel_my_ticket_transfer(p_transfer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  UPDATE event_ticket_transfers
  SET status = 'cancelled'
  WHERE id = p_transfer_id AND from_user_id = auth.uid() AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_my_ticket_transfer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_my_ticket_transfer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_ticket_transfer(uuid) TO authenticated;

-- Claim a transfer as the signed-in recipient. Token-gated, so it is safe for
-- any authenticated caller: without the emailed token nothing moves.
CREATE OR REPLACE FUNCTION public.claim_ticket_transfer(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tr     public.event_ticket_transfers;
  v_ticket public.event_tickets;
  v_dupe   integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM event_ticket_transfers
  WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This transfer link is not valid';
  END IF;
  IF v_tr.status <> 'pending' THEN
    RAISE EXCEPTION 'This transfer has already been %', v_tr.status;
  END IF;
  IF v_tr.expires_at < now() THEN
    UPDATE event_ticket_transfers SET status = 'expired' WHERE id = v_tr.id;
    RAISE EXCEPTION 'This transfer link has expired';
  END IF;
  IF v_tr.from_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot claim your own transfer';
  END IF;

  SELECT * INTO v_ticket FROM event_tickets WHERE id = v_tr.ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.status <> 'confirmed' THEN
    RAISE EXCEPTION 'That ticket is no longer transferable';
  END IF;

  -- One person, one ticket per event (mirrors the checkout duplicate guard).
  SELECT count(*) INTO v_dupe FROM event_tickets
  WHERE event_id = v_tr.event_id AND user_id = auth.uid()
    AND status IN ('confirmed', 'checked_in', 'reserved') AND id <> v_ticket.id;
  IF v_dupe > 0 THEN
    RAISE EXCEPTION 'You already have a ticket for this event';
  END IF;

  -- Move the holder. The money does not move: same row, same Stripe charge.
  -- trg_reconcile_event_ticket_state fires on user_id and reconciles BOTH the
  -- old holder (out of the campout chat) and the new one (in).
  UPDATE event_tickets
  SET user_id = auth.uid(), updated_at = now()
  WHERE id = v_ticket.id;

  UPDATE event_ticket_transfers
  SET status = 'claimed', to_user_id = auth.uid(), claimed_at = now()
  WHERE id = v_tr.id;

  RETURN jsonb_build_object(
    'ok', true, 'ticket_id', v_ticket.id, 'event_id', v_tr.event_id,
    'from_user_id', v_tr.from_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ticket_transfer(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_ticket_transfer(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_ticket_transfer(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 10. Organiser hold: reserve a spot, over capacity, payment still owed
-- ---------------------------------------------------------------------
-- Called by the reserve-event-spot edge function with the service role after it
-- has authorised the caller as manager/admin (same gate as grant-event-ticket).
CREATE OR REPLACE FUNCTION public.reserve_spot_for_user(
  p_event_id       uuid,
  p_user_id        uuid,
  p_reserved_by    uuid,
  p_hold_expires_at timestamptz DEFAULT NULL,
  p_note           text DEFAULT NULL,
  p_ticket_type_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event  public.events;
  v_type   public.event_ticket_types;
  v_exist  public.event_tickets;
  v_code   text;
  v_id     uuid;
  v_tries  integer := 0;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  IF NOT COALESCE(v_event.is_ticketed, false) THEN
    RAISE EXCEPTION 'This event does not use tickets';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'This event is cancelled';
  END IF;

  IF p_ticket_type_id IS NOT NULL THEN
    SELECT * INTO v_type FROM event_ticket_types
    WHERE id = p_ticket_type_id AND event_id = p_event_id;
  ELSE
    SELECT * INTO v_type FROM event_ticket_types
    WHERE event_id = p_event_id AND is_active = true
    ORDER BY sort_order ASC NULLS LAST, price_cents ASC LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This event has no active ticket type';
  END IF;

  -- Idempotent: an existing live ticket wins, we never double-book a person.
  SELECT * INTO v_exist FROM event_tickets
  WHERE event_id = p_event_id AND user_id = p_user_id
    AND status IN ('pending', 'confirmed', 'checked_in', 'reserved')
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    -- Refresh the hold window on an existing reservation, otherwise report back.
    IF v_exist.status = 'reserved' THEN
      UPDATE event_tickets
      SET hold_expires_at = COALESCE(p_hold_expires_at, hold_expires_at),
          reserved_note   = COALESCE(p_note, reserved_note),
          updated_at      = now()
      WHERE id = v_exist.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'status', v_exist.status,
      'ticket_id', v_exist.id, 'user_id', p_user_id,
      'price_cents', v_exist.price_cents, 'ticket_code', v_exist.ticket_code
    );
  END IF;

  -- NO capacity check. Holding a spot on a FULL event is the entire point of
  -- this function: the organiser is deliberately going over the line, exactly
  -- like grant-event-ticket already does for a free comp.
  LOOP
    v_code := generate_ticket_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM event_tickets WHERE ticket_code = v_code);
    v_tries := v_tries + 1;
    IF v_tries > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique ticket code';
    END IF;
  END LOOP;

  INSERT INTO event_tickets (
    event_id, ticket_type_id, user_id, status, price_cents, quantity,
    ticket_code, hold_expires_at, reserved_by, reserved_note, custom_answers
  ) VALUES (
    p_event_id, v_type.id, p_user_id, 'reserved', v_type.price_cents, 1,
    v_code, p_hold_expires_at, p_reserved_by, p_note, '{}'::jsonb
  )
  RETURNING id INTO v_id;

  -- DELIBERATELY NO event_registrations ROW.
  --
  -- Probed 2026-08-24: handle_event_registration() is a BEFORE INSERT trigger
  -- that rewrites ANY inserted status to 'waitlisted' once the event is at
  -- capacity. A hold is over capacity BY DESIGN, so an 'invited' row landed as
  -- 'waitlisted' and the organiser's roster read "did not get in" for the very
  -- person whose spot is being held. The opposite of the truth.
  --
  -- Registration is DERIVED from valid tickets (reconcile_ticket_membership),
  -- and a reserved hold is not a valid ticket, so the correct state for an
  -- unpaid hold is simply no registration row. The reserved TICKET is the
  -- record of the hold: event_spots_taken counts it and the attendee export
  -- lists it. When the invitee pays, the ticket flips to confirmed and the
  -- reconciler creates the registration and lifts it to 'registered' with an
  -- UPDATE, which bypasses that BEFORE INSERT trigger.

  RETURN jsonb_build_object(
    'ok', true, 'already', false, 'status', 'reserved',
    'ticket_id', v_id, 'user_id', p_user_id,
    'price_cents', v_type.price_cents, 'ticket_code', v_code,
    'hold_expires_at', p_hold_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_spot_for_user(uuid, uuid, uuid, timestamptz, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_spot_for_user(uuid, uuid, uuid, timestamptz, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_spot_for_user(uuid, uuid, uuid, timestamptz, text, uuid) TO service_role;

-- Organiser releases a hold they made (or that is no longer wanted).
CREATE OR REPLACE FUNCTION public.release_ticket_hold(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
  v_evt uuid;
  v_usr uuid;
BEGIN
  SELECT event_id, user_id INTO v_evt, v_usr FROM event_tickets WHERE id = p_ticket_id;
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_ticket_id AND status = 'reserved';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 AND v_evt IS NOT NULL THEN
    PERFORM public.reconcile_ticket_membership(v_evt, v_usr);
  END IF;
  RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.release_ticket_hold(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_ticket_hold(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ticket_hold(uuid) TO service_role;
