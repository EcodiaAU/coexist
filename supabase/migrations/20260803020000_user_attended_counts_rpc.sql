-- Per-user lifetime "events attended" counts for the event-day roster.
--
-- Origin: Tate 2026-08-03. The day-of check-in roster (event-day.tsx) shows no
-- indication of how many events each attendee has been to. Leaders want to see
-- returning regulars vs first-timers at a glance ("go say hi to the newcomer").
--
-- Aggregated SERVER-SIDE (GROUP BY) so the same PostgREST 1000-row cap that bit
-- the admin events count (get_event_engagement_counts) cannot truncate a busy
-- roster's counts. SECURITY DEFINER so the count is the true lifetime total
-- (attended events span 'published' AND 'completed'; a collective leader's RLS
-- would otherwise miss a user's attendance in other collectives / completed
-- events), guarded so ONLY staff or a collective leader - the people who run
-- rosters - can read other users' attendance counts. Everyone else gets an
-- empty set (the hook then defaults every row to 0).
--
-- Returns one row per user_id that has >= 1 attended registration; callers
-- default the rest to 0.

create or replace function get_user_attended_counts(user_ids uuid[])
returns table (user_id uuid, attended_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    is_admin_or_staff(auth.uid())
    or exists (
      select 1 from collective_members cm
      where cm.user_id = auth.uid()
        and cm.role in ('assist_leader', 'co_leader', 'leader')
    )
  ) then
    return;
  end if;

  return query
    select er.user_id, count(*)::integer
    from event_registrations er
    where er.user_id = any(user_ids)
      and er.status = 'attended'
    group by er.user_id;
end;
$$;

grant execute on function get_user_attended_counts(uuid[]) to authenticated;

notify pgrst, 'reload schema';
