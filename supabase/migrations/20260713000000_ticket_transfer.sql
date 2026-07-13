-- Ticket transfer, pending-expiry cron, and reconciler hardening.
--
-- Three things ship together because they are one failure surface: an admin who
-- needs to move an attendee from event A to event B today has to refund and
-- re-buy, which drags the money back through Stripe, drops the attendee out of
-- the campout chat, and leaves their registration stranded.
--
-- 1. transfer_event_ticket(): moves an existing ticket to another event and
--    ticket type. No refund. No repurchase. The Stripe charge stays exactly
--    where it is; only the ticket's event_id / ticket_type_id move.
--
--    THE TRAP: trg_reconcile_event_ticket_state only fired on INSERT or
--    UPDATE OF status. A bare event_id UPDATE therefore reconciled NOTHING,
--    so the attendee silently stayed in the old campout chat and kept a
--    'registered' row on the old event. Fixed two ways: the trigger now also
--    fires on event_id, and its wrapper reconciles the OLD event as well as
--    the new one when the event changed. transfer_event_ticket() additionally
--    calls the reconciler explicitly for both events (idempotent).
--
-- 2. expire_stale_pending_tickets() is scheduled on pg_cron every 5 minutes.
--    It existed since 20260501000000 but was only ever called inline inside
--    reserve_event_ticket, so an abandoned checkout on an event nobody else
--    was buying into held capacity forever.
--
-- 3. reconcile_ticket_membership() now restores a cancelled registration back
--    to 'registered' explicitly (and joins the chat) whenever the user holds
--    at least one valid ticket, rather than relying on an ON CONFLICT clause.
--    Still idempotent, and still refuses to downgrade an 'attended' row.
--
-- Applied direct-idempotent via the Management API query endpoint (the local
-- migration history is out of sync with these files, so `supabase db push` is
-- unsafe on this project). This file is the canonical source.
--
-- Origin: Co-Exist / Angelica, 2026-07-13. Zayden Cressman needed to move from
-- the 7 Aug Outback campout to a Wild Mountains campout, and the whole 7 Aug
-- roster may follow.

-- ---------------------------------------------------------------------
-- 1. Reconciler: derive chat membership + registration from valid tickets
-- ---------------------------------------------------------------------
create or replace function public.reconcile_ticket_membership(p_event uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_channel uuid;
  v_valid   int;
begin
  select count(*) into v_valid
  from public.event_tickets
  where event_id = p_event
    and user_id = p_user
    and status in ('confirmed', 'checked_in');

  select id into v_channel
  from public.chat_channels
  where event_id = p_event and type = 'campout'
  limit 1;

  if v_valid > 0 then
    -- Has at least one valid ticket: ensure chat membership + active registration.
    if v_channel is not null then
      insert into public.chat_channel_members (channel_id, user_id)
      values (v_channel, p_user)
      on conflict (channel_id, user_id) do nothing;
    end if;

    -- RESTORE path. A cancelled / waitlisted / invited registration is lifted
    -- back to 'registered' the moment a valid ticket exists again. 'attended'
    -- is never downgraded (they physically turned up; that is ground truth).
    insert into public.event_registrations (event_id, user_id, status, registered_at)
    values (p_event, p_user, 'registered', now())
    on conflict (event_id, user_id) do nothing;

    update public.event_registrations
      set status = 'registered'
      where event_id = p_event
        and user_id = p_user
        and status is distinct from 'attended'
        and status is distinct from 'registered';
  else
    -- No valid ticket left: remove from chat + cancel the ticket-derived
    -- registration. This only runs for users who held a ticket (callers pass
    -- (event, user) drawn from event_tickets), so pure walk-in / comp
    -- registrations that never had a ticket are never touched.
    if v_channel is not null then
      delete from public.chat_channel_members
      where channel_id = v_channel and user_id = p_user;
    end if;

    -- 'attended' is ground truth (they physically turned up) and is never
    -- downgraded in EITHER direction, matching the restore path above. A refund
    -- of a checked-in attendee's ticket must not erase the attendance record.
    update public.event_registrations
      set status = 'cancelled'
      where event_id = p_event and user_id = p_user
        and status <> 'cancelled'
        and status <> 'attended';
  end if;
end;
$$;

-- Derived-state reconciler: server-side callers only (trigger, edge functions).
revoke execute on function public.reconcile_ticket_membership(uuid, uuid) from anon, authenticated;
grant execute on function public.reconcile_ticket_membership(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2. Trigger wrapper: now event_id-aware
-- ---------------------------------------------------------------------
create or replace function public.trg_reconcile_event_ticket_state()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- A ticket that moved event has to be reconciled on BOTH sides, or the
  -- attendee is left sitting in the old campout chat with a live registration
  -- on an event they are no longer going to.
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    perform public.reconcile_ticket_membership(old.event_id, old.user_id);
  end if;
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.reconcile_ticket_membership(old.event_id, old.user_id);
  end if;
  perform public.reconcile_ticket_membership(new.event_id, new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_reconcile_event_ticket_state on public.event_tickets;
create trigger trg_reconcile_event_ticket_state
after insert or update of status, event_id, user_id on public.event_tickets
for each row execute function public.trg_reconcile_event_ticket_state();

-- ---------------------------------------------------------------------
-- 3. transfer_event_ticket: move a ticket, keep the money
-- ---------------------------------------------------------------------
-- Returns jsonb:
--   { ok, ticket_id, user_id, from_event_id, to_event_id, to_ticket_type_id,
--     ticket_code, quantity, price_cents, skipped, reason }
-- skipped=true is a soft no-op (already on the target event, or the holder
-- already has a live ticket there); the bulk path uses it to keep going.
-- Errors are raised for hard failures (bad ticket, dead event, sold out).
create or replace function public.transfer_event_ticket(
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
  -- ---- Load + lock the ticket ----
  select * into v_ticket
  from public.event_tickets
  where id = p_ticket_id
  for update;

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

  -- ---- Target event must be a live ticketed event ----
  select * into v_target_evt
  from public.events
  where id = p_target_event_id;

  if not found then
    raise exception 'Target event not found';
  end if;
  if coalesce(v_target_evt.is_ticketed, false) = false then
    raise exception 'Target event does not use tickets';
  end if;
  if v_target_evt.status = 'cancelled' then
    raise exception 'Target event is cancelled';
  end if;

  -- ---- Resolve the target ticket type ----
  if p_target_ticket_type_id is not null then
    select * into v_type
    from public.event_ticket_types
    where id = p_target_ticket_type_id and event_id = p_target_event_id
    for update;
    if not found then
      raise exception 'Target ticket type does not belong to the target event';
    end if;
  else
    select * into v_type
    from public.event_ticket_types
    where event_id = p_target_event_id and is_active = true
    order by sort_order asc nulls last, price_cents asc
    limit 1
    for update;
    if not found then
      raise exception 'Target event has no active ticket type';
    end if;
  end if;

  -- ---- Already holding a live ticket on the target? Soft skip. ----
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

  -- ---- Capacity on the target type (admin can override) ----
  -- Same sold-count shape as reserve_event_ticket: live tickets plus pending
  -- ones still inside their 15 minute hold.
  if v_type.capacity is not null and p_override_capacity = false then
    select coalesce(sum(quantity), 0) into v_sold
    from public.event_tickets
    where ticket_type_id = v_type.id
      and status in ('pending', 'confirmed', 'checked_in')
      and (status <> 'pending' or created_at > now() - interval '15 minutes');

    if v_sold + v_ticket.quantity > v_type.capacity then
      raise exception 'Target ticket type is full (% of % taken)', v_sold, v_type.capacity;
    end if;
  end if;

  -- ---- Move it. No Stripe call, no price change: the money stays put. ----
  -- checked_in state does not travel: they have not turned up to the new event.
  update public.event_tickets
    set event_id       = p_target_event_id,
        ticket_type_id = v_type.id,
        status         = 'confirmed',
        checked_in_at  = null,
        updated_at     = now()
  where id = v_ticket.id;

  -- The trigger above already reconciles both sides; calling explicitly makes
  -- the contract of this function independent of trigger wiring. Idempotent.
  perform public.reconcile_ticket_membership(v_from_event, v_ticket.user_id);
  perform public.reconcile_ticket_membership(p_target_event_id, v_ticket.user_id);

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'ticket_id', v_ticket.id,
    'user_id', v_ticket.user_id,
    'from_event_id', v_from_event,
    'to_event_id', p_target_event_id,
    'to_ticket_type_id', v_type.id,
    'ticket_code', v_ticket.ticket_code,
    'quantity', v_ticket.quantity,
    'price_cents', v_ticket.price_cents
  );
end;
$$;

-- Manager/admin gate lives in the transfer-event-ticket edge function, which
-- calls this with the service role. No client may call it directly.
revoke execute on function public.transfer_event_ticket(uuid, uuid, uuid, boolean) from anon, authenticated;
grant execute on function public.transfer_event_ticket(uuid, uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------
-- 4. pg_cron: expire abandoned pending tickets every 5 minutes
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  perform cron.unschedule('expire-stale-pending-tickets');
exception when others then
  null; -- not scheduled yet
end;
$$;

select cron.schedule(
  'expire-stale-pending-tickets',
  '*/5 * * * *',
  $$select public.expire_stale_pending_tickets()$$
);
