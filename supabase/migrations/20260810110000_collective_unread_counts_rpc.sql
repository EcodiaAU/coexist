-- Canonical per-collective chat unread counts for the calling user, in ONE round-trip.
--
-- useUnreadCounts (src/hooks/use-chat.ts) computed the nav-badge unread by
-- running one `count(*) head` query PER active collective membership, in a
-- Promise.all, on a 60s app-wide poll. A member of N collectives fired N
-- separate COUNT round-trips every 60 seconds, for every logged-in client
-- (N+1). This replaces that fan-out with a single set-returning function.
--
-- security INVOKER (not definer): the direct client head-counts already ran
-- under the caller's RLS on collective_members / chat_read_receipts /
-- chat_messages (a member can read their own memberships, their own read
-- receipts, and their collectives' messages). Keeping invoker preserves that
-- exact authorization surface - the function can only ever count what the
-- caller could already read - and adds no SECURITY DEFINER escalation. The
-- explicit `m.user_id = auth.uid()` mirrors the client's `.eq('user_id', uid)`
-- so co-members' rows (which the member CAN read for the member list) are not
-- counted as the caller's unread. Mirrors get_event_engagement_counts
-- (20260803000000) and get_collective_counts.
--
-- Non-destructive: pure additive CREATE FUNCTION, no schema/data change.

create or replace function public.get_collective_unread_counts()
returns table (
  collective_id uuid,
  unread_count  integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.collective_id,
    count(cm.id)::integer as unread_count
  from collective_members m
  left join chat_read_receipts r
    on  r.collective_id = m.collective_id
    and r.user_id       = auth.uid()
  left join chat_messages cm
    on  cm.collective_id = m.collective_id
    and cm.channel_id is null
    and cm.is_deleted = false
    and cm.user_id <> auth.uid()
    and (r.last_read_at is null or cm.created_at > r.last_read_at)
  where m.user_id = auth.uid()
    and m.status = 'active'
  group by m.collective_id;
$$;

grant execute on function public.get_collective_unread_counts() to authenticated;
