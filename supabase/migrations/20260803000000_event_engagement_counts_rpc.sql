-- Canonical per-event engagement counts for admin surfaces.
--
-- The admin events dashboard (use-admin-events.ts) used to fetch every
-- matching event_registrations row and tally them client-side with
-- countByField. PostgREST caps a response at 1000 rows (db-max-rows), and
-- there are 2081 rows with status IN ('registered','attended') across all
-- events, so the batched fetch silently truncated: any event whose rows fell
-- past the 1000-row boundary read 0. The "Outback Conservation Campout
-- (Myall Park)" event showed 0/30 while it had 26 real registrations. Same
-- latent flaw applied to the attended-only and walk-in tallies that power the
-- average-attendance card.
--
-- Counting server-side here means no row cap can truncate it. Returns one row
-- per requested event id (0 for events with no matching rows). security
-- invoker so the caller's RLS on event_registrations / event_walk_ins still
-- applies exactly as it did for the direct client reads (admins and collective
-- staff see all; see registrations_select_visible / _own_or_leader). Mirrors
-- the get_collective_counts fix (20260714020000) for the same 1000-cap class.

create or replace function get_event_engagement_counts(event_ids uuid[])
returns table (
  event_id              uuid,
  registered_count      integer,
  attended_count        integer,
  walkin_attended_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id as event_id,
    coalesce(r.registered_count, 0)::integer,
    coalesce(r.attended_count, 0)::integer,
    coalesce(w.walkin_attended_count, 0)::integer
  from unnest(event_ids) as e(id)
  left join (
    select
      er.event_id,
      count(*) filter (where er.status in ('registered', 'attended')) as registered_count,
      count(*) filter (where er.status = 'attended')                  as attended_count
    from event_registrations er
    where er.event_id = any(event_ids)
    group by er.event_id
  ) r on r.event_id = e.id
  left join (
    select wi.event_id, count(*) as walkin_attended_count
    from event_walk_ins wi
    where wi.event_id = any(event_ids) and wi.status = 'attended'
    group by wi.event_id
  ) w on w.event_id = e.id;
$$;

grant execute on function get_event_engagement_counts(uuid[]) to authenticated;
