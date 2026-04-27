-- Remove the umbrella "Australia" collective.
--
-- Background: previously, events shared between multiple local collectives
-- (e.g. Myall Park + Wild Mountains) were dumped onto a national umbrella
-- collective. That model is replaced by the multi-host attribution introduced
-- in 20260427000000_event_hosts_view.sql — events now have a primary host
-- collective plus accepted collaborators, and impact is shared across all
-- hosts.
--
-- This migration:
--   1. Finds the umbrella collective by name (case-insensitive 'australia').
--   2. For each event currently primary-hosted on it, promotes the earliest
--      accepted collaborator to primary host. Events with no collaborators
--      are left alone (admin will reassign manually) — the migration logs
--      their IDs as a notice instead of failing.
--   3. Removes any collaborator rows still pointing at the umbrella.
--   4. Deletes the umbrella collective row itself.
--
-- The migration is idempotent: re-running it after the collective has been
-- deleted is a no-op.

do $$
declare
  v_aus_id uuid;
  v_event record;
  v_new_primary uuid;
  v_orphan_count int := 0;
  v_orphans uuid[] := array[]::uuid[];
begin
  -- 1. Locate the umbrella collective. There should be exactly one.
  select id into v_aus_id
  from public.collectives
  where lower(name) = 'australia'
     or lower(name) like 'australia collective%'
     or lower(slug) = 'australia'
  limit 1;

  if v_aus_id is null then
    raise notice 'No Australia collective found — nothing to do.';
    return;
  end if;

  raise notice 'Removing umbrella collective %', v_aus_id;

  -- 2. Reassign primary host on each event currently owned by it.
  for v_event in
    select id from public.events where collective_id = v_aus_id
  loop
    -- Pick the earliest accepted collaborator (deterministic by created_at)
    select cec.collective_id
      into v_new_primary
      from public.collective_event_collaborators cec
     where cec.event_id = v_event.id
       and cec.status = 'accepted'
       and cec.collective_id <> v_aus_id
     order by cec.created_at asc, cec.id asc
     limit 1;

    if v_new_primary is null then
      v_orphan_count := v_orphan_count + 1;
      v_orphans := v_orphans || v_event.id;
      raise notice 'Event % has no collaborators — leaving primary unchanged. Reassign manually.', v_event.id;
      continue;
    end if;

    -- Promote: events.collective_id = new primary, drop the new primary's
    -- own collaborator row (it's the host now).
    update public.events
       set collective_id = v_new_primary
     where id = v_event.id;

    delete from public.collective_event_collaborators
     where event_id = v_event.id
       and collective_id = v_new_primary;

    raise notice 'Event %: primary host reassigned to %', v_event.id, v_new_primary;
  end loop;

  -- 3. Drop any leftover collaborator rows pointing at the umbrella, plus
  --    invitation rows. Other tables (collective_members etc.) cascade via
  --    their FK with ON DELETE CASCADE; if any do not, the delete below will
  --    surface them as a constraint violation rather than silently leaking.
  delete from public.collective_event_collaborators
   where collective_id = v_aus_id
      or invited_by_collective_id = v_aus_id;

  delete from public.event_invites
   where collective_id = v_aus_id;

  -- 4. Finally drop the umbrella collective. If FK constraints from other
  --    tables (events still pointing at it, members, chat) block the delete,
  --    we want to know — fail loudly rather than orphaning rows.
  if v_orphan_count = 0 then
    delete from public.collectives where id = v_aus_id;
    raise notice 'Australia collective % deleted.', v_aus_id;
  else
    raise notice
      'Skipping collective delete: % event(s) without collaborators still '
      'reference it. Reassign these manually then re-run this migration: %',
      v_orphan_count, v_orphans;
  end if;
end $$;
