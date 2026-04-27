-- Multi-host event attribution.
--
-- Background: events that previously got dumped onto an "Australia" umbrella
-- collective (because they were shared between multiple local collectives like
-- Myall Park + Wild Mountains) now use multi-host attribution instead. The
-- primary host stays on events.collective_id; co-hosts are
-- collective_event_collaborators rows with status='accepted'.
--
-- Rule: each event's impact is shared equally across all hosts. The full
-- per-event impact is still stored once on event_impact (only one survey per
-- event), but per-collective rollups multiply by the share so totals add up
-- to the national figure (no double counting).
--
-- This migration introduces:
--   1. event_hosts view: one row per (event_id, collective_id) with an exact
--      fractional share (numerator/denominator) so consumers can do exact
--      integer rounding without ever showing fractional units.
--   2. event_host_count(event_id) helper: returns total host count.

-- ── event_hosts view ──────────────────────────────────────────────────
-- Returns one row per host. The primary collective always appears with
-- host_index=0; co-hosts get host_index >= 1 ordered by their collaborator
-- row creation time (deterministic across reads).

create or replace view public.event_hosts as
with hosts as (
  select
    e.id           as event_id,
    e.collective_id as collective_id,
    0::int          as host_index,
    e.created_at    as host_added_at
  from public.events e
  union all
  select
    cec.event_id,
    cec.collective_id,
    -- host_index is assigned per-event by created_at order, starting from 1
    row_number() over (
      partition by cec.event_id
      order by cec.created_at, cec.id
    )::int as host_index,
    cec.created_at as host_added_at
  from public.collective_event_collaborators cec
  where cec.status = 'accepted'
    -- Defensive: never duplicate the primary host if it somehow ended up in
    -- collaborators too. Primary always wins host_index=0.
    and not exists (
      select 1 from public.events e2
      where e2.id = cec.event_id
        and e2.collective_id = cec.collective_id
    )
),
counted as (
  select
    event_id,
    collective_id,
    host_index,
    host_added_at,
    count(*) over (partition by event_id) as host_count
  from hosts
)
select
  event_id,
  collective_id,
  host_index,
  host_count,
  host_added_at
from counted;

comment on view public.event_hosts is
  'One row per host collective for an event. host_index=0 is the primary '
  'host (events.collective_id). host_count is the total number of hosts. '
  'Per-collective rollups should aggregate via this view and apply integer '
  'rounding so per-collective totals sum back to the national total.';

-- Allow read access to the view at the same level as the underlying tables.
-- RLS on events / collective_event_collaborators is enforced; the view
-- inherits those policies (security_invoker behaviour on PG 15+).
alter view public.event_hosts set (security_invoker = true);
grant select on public.event_hosts to authenticated, anon;

-- ── event_host_count helper ──────────────────────────────────────────
create or replace function public.event_host_count(p_event_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select host_count from public.event_hosts where event_id = p_event_id limit 1),
    1
  );
$$;

comment on function public.event_host_count(uuid) is
  'Total host count for an event (primary + accepted collaborators). Returns 1 '
  'if the event has no collaborator rows.';
