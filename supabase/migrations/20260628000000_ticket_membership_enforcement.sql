-- Ticket-driven membership + registration enforcement.
--
-- One reconciler owns campout chat membership AND event_registration state per
-- (event, user), derived solely from the count of still-valid
-- (confirmed | checked_in) tickets. It is dupe-aware: it only removes a person
-- from the chat / cancels their registration when they have NO valid ticket
-- left, so cancelling one of a duplicate buyer's tickets no longer evicts them.
--
-- It fires for every event_tickets status mutation, so the Stripe webhook,
-- admin revoke (PR #58) and any manual SQL all self-heal. This supersedes
-- sync_campout_chat_membership(), which only handled the chat side and was the
-- source of the "refunded buyer still in the group chat" failure.
--
-- Origin: Tate P0 2026-06-28. Applied to prod via the Management API query
-- endpoint (the local migration history is out of sync with these files, so
-- `supabase db push` is unsafe here); this file is the canonical source and is
-- idempotent if re-run.

-- ---------------------------------------------------------------------
-- 1. Core reconciler (callable directly for backfill)
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

    insert into public.event_registrations (event_id, user_id, status, registered_at)
    values (p_event, p_user, 'registered', now())
    on conflict (event_id, user_id) do update
      set status = 'registered'
      where public.event_registrations.status not in ('attended', 'registered');
  else
    -- No valid ticket left: remove from chat + cancel the ticket-derived
    -- registration. This only runs for users who held a ticket (callers pass
    -- (event, user) drawn from event_tickets), so pure walk-in / comp
    -- registrations that never had a ticket are never touched.
    if v_channel is not null then
      delete from public.chat_channel_members
      where channel_id = v_channel and user_id = p_user;
    end if;

    update public.event_registrations
      set status = 'cancelled'
      where event_id = p_event and user_id = p_user and status <> 'cancelled';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Trigger wrapper
-- ---------------------------------------------------------------------
create or replace function public.trg_reconcile_event_ticket_state()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.reconcile_ticket_membership(new.event_id, new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_sync_campout_chat_membership on public.event_tickets;
drop trigger if exists trg_reconcile_event_ticket_state on public.event_tickets;
create trigger trg_reconcile_event_ticket_state
after insert or update of status on public.event_tickets
for each row execute function public.trg_reconcile_event_ticket_state();

-- Retire the superseded chat-only function.
drop function if exists public.sync_campout_chat_membership() cascade;

-- ---------------------------------------------------------------------
-- 3. Backfill: reconcile every (event, user) that holds any ticket, fixing
--    existing dirty state (dupe-cancelled registrations, stale chat members).
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in (select distinct event_id, user_id from public.event_tickets) loop
    perform public.reconcile_ticket_membership(r.event_id, r.user_id);
  end loop;
end;
$$;
