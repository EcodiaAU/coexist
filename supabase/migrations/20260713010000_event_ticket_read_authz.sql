-- event_tickets read authz: the fence and the gate disagreed, and the UI lied.
--
-- THE BUG (verified against prod, 2026-07-13, authenticated-role tx):
--   Angelica's ADMIN account reads 10+ event_tickets rows for the 7 Aug Outback
--   campout. Her PARTICIPANT account reads ZERO for the same event, while
--   reading all 11 event_registrations rows. No error, no permission message.
--
--   RLS on public.event_tickets (from 20260331130000_event_ticketing.sql) had
--   exactly two SELECT policies:
--     tickets_select_own   -> user_id = auth.uid()
--     tickets_select_admin -> profiles.role in ('admin','national_leader')
--
--   So a MANAGER, a collective LEADER / co_leader / assist_leader, and every
--   ordinary participant read zero ticket rows for an event they are entitled
--   to see. useEventRoster (src/hooks/use-events.ts) builds the leader event-day
--   roster by selecting event_tickets client-side; that select silently returned
--   [] for anyone who was not admin or national_leader, so on a TICKETED event
--   every registrant fell into the "no ticket / not attending" bucket. The data
--   was always fine. The read was fenced out, and the UI rendered the absence as
--   fact. That is the client's "the attendees are not showing in the app".
--
--   The authz asymmetry is the tell: revoke-event-ticket, grant-event-ticket and
--   the admin ticket UI all gate on role manager|admin, but the RLS policy only
--   ever admitted admin|national_leader. A manager passed every gate and still
--   read nothing.
--
-- THE FIX (two layers, neither of which widens the fence to "any authenticated"):
--   1. A third SELECT policy admitting the people who actually run the event:
--      staff of the event's owning collective (leader / co_leader / assist_leader
--      via is_collective_staff) plus national staff (is_admin_or_staff, which
--      already covers national_leader + manager + admin). The policy and the
--      manager|admin edge-function gate now agree.
--   2. get_event_ticket_states(): a SECURITY DEFINER read path for the roster,
--      so who-is-going never again depends on an RLS select of a PII-bearing
--      table. Staff get every ticket state (they need refunded / cancelled to
--      explain a no-show). Everyone else gets ONLY the valid ticket rows, and
--      only (user_id, status): no ticket code, no price, no payment intent, no
--      contact detail. Attendance without PII.
--
-- Applied direct-idempotent via the Management API query endpoint.
-- Origin: EcodiaOS probe on Angelica's roster report, 2026-07-13.

-- ---------------------------------------------------------------------
-- 1. RLS: event staff can read their own event's tickets
-- ---------------------------------------------------------------------
drop policy if exists tickets_select_event_staff on public.event_tickets;
create policy tickets_select_event_staff on public.event_tickets
  for select to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_tickets.event_id
        and (
          public.is_collective_staff(auth.uid(), e.collective_id)
          or public.is_admin_or_staff(auth.uid())
        )
    )
  );

-- ---------------------------------------------------------------------
-- 2. Roster read path: SECURITY DEFINER, entitlement-shaped
-- ---------------------------------------------------------------------
-- Returns:
--   { "is_staff": bool, "tickets": [ { "user_id": uuid, "status": text }, ... ] }
--
-- is_staff = collective staff of the owning collective, or national staff.
-- Non-staff callers see only 'confirmed' / 'checked_in' rows, which is the same
-- fact the registration list already exposes (who is coming). They never see
-- refunded / cancelled states, ticket codes, prices, payment intents or any
-- profile column.
create or replace function public.get_event_ticket_states(p_event_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public'
as $$
declare
  v_collective uuid;
  v_is_staff   boolean;
  v_tickets    jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select collective_id into v_collective from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  v_is_staff := public.is_collective_staff(auth.uid(), v_collective)
             or public.is_admin_or_staff(auth.uid());

  select coalesce(
    jsonb_agg(jsonb_build_object('user_id', t.user_id, 'status', t.status)),
    '[]'::jsonb
  )
  into v_tickets
  from public.event_tickets t
  where t.event_id = p_event_id
    and (v_is_staff or t.status in ('confirmed', 'checked_in'));

  return jsonb_build_object('is_staff', v_is_staff, 'tickets', v_tickets);
end;
$$;

revoke all on function public.get_event_ticket_states(uuid) from public, anon;
grant execute on function public.get_event_ticket_states(uuid) to authenticated, service_role;
