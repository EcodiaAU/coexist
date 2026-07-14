-- Canonical per-collective counts for admin surfaces.
--
-- The admin collectives list used to fetch every collective_members row and
-- bucket them client-side. PostgREST caps a response at 1000 rows (db-max-rows),
-- and there are 1369 active memberships, so every collective was silently
-- undercounted: Melbourne City read 270 against a true 384, Brisbane 147
-- against 200. The profile page read collectives.member_count and was right, so
-- the two surfaces disagreed.
--
-- member_count is the trigger-maintained column (trg_update_collective_member_count
-- keeps it equal to COUNT(*) WHERE status = 'active'), which makes it the single
-- canonical source. Counting server-side here means no row cap can truncate it.

create or replace function get_collective_counts()
returns table (
  collective_id uuid,
  member_count  integer,
  event_count   integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    coalesce(c.member_count, 0)::integer,
    (select count(*) from events e where e.collective_id = c.id)::integer
  from collectives c;
$$;

grant execute on function get_collective_counts() to authenticated;
