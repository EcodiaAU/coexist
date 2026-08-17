-- =====================================================================
-- Announcement modal (admin-authored, once-per-member pop-up)
-- 2026-08-17. Additive + reversible only.
--
-- A promotion surface separate from the Updates tab (public.updates): the
-- admin authors a single active announcement; each member sees it exactly
-- once, on the first app open after it is set. When the admin edits or
-- re-activates it, updated_at bumps and it becomes "unseen" again, so the
-- same member sees the refreshed version once more.
--
-- Design mirrors the proven updates / update_reads pair:
--   * announcement_modals    -> like public.updates (staff-managed content)
--   * announcement_modal_seen -> like public.update_reads (per-user, own-row)
--   * RLS reuses is_admin_or_staff() + has_cap('send_announcements'), the
--     same capability that already gates the Updates admin surface. No new
--     role system is introduced.
--
-- "Unseen again on edit" is keyed on updated_at (bumped by the shared
-- update_updated_at() trigger, the same one public.updates uses): a seen
-- row stores seen_version = the announcement's updated_at at dismissal, and
-- the client re-shows when seen_version < updated_at.
--
-- Only one announcement is active at a time, enforced atomically by a
-- trigger (activating one deactivates the rest).
--
-- ROLLBACK NOTES (all reversible):
--   drop table if exists public.announcement_modal_seen;
--   drop table if exists public.announcement_modals cascade;
--   drop function if exists public.announcement_modals_enforce_single_active();
-- =====================================================================

-- ---------------------------------------------------------------------
-- Content table (admin-authored)
-- ---------------------------------------------------------------------
create table if not exists public.announcement_modals (
  id          uuid primary key default uuid_generate_v4(),
  author_id   uuid references public.profiles(id) on delete set null,
  title       text not null,
  body        text not null,
  image_url   text,
  cta_label   text,
  cta_href    text,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.announcement_modals is
  'Admin-authored pop-up announcement shown once per member on app open. Separate from public.updates (the Updates tab). Only one row is_active at a time.';
comment on column public.announcement_modals.cta_href is
  'Optional CTA target: an in-app route (starts with /) or an external URL (http/https).';

-- bump updated_at on every edit (reuse the shared function public.updates uses),
-- so an edited announcement becomes unseen again for every member.
create trigger set_updated_at
  before update on public.announcement_modals
  for each row execute function public.update_updated_at();

-- Only one announcement active at a time: activating one deactivates the
-- rest. The when(NEW.is_active) guard means deactivations never re-fire the
-- trigger, so there is no recursion.
create or replace function public.announcement_modals_enforce_single_active()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.announcement_modals
    set is_active = false
    where id <> new.id and is_active = true;
  return new;
end;
$$;

create trigger announcement_modals_single_active
  after insert or update of is_active on public.announcement_modals
  for each row
  when (new.is_active)
  execute function public.announcement_modals_enforce_single_active();

-- ---------------------------------------------------------------------
-- Per-user seen tracking (own-row, mirrors public.update_reads)
-- ---------------------------------------------------------------------
create table if not exists public.announcement_modal_seen (
  id              uuid primary key default uuid_generate_v4(),
  announcement_id uuid not null references public.announcement_modals(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  seen_version    timestamptz not null,
  dismissed_at    timestamptz not null default now(),
  unique (announcement_id, user_id)
);

comment on column public.announcement_modal_seen.seen_version is
  'The announcement''s updated_at at the moment this user dismissed it. The modal re-shows when seen_version < announcement.updated_at.';

create index if not exists announcement_modal_seen_user_idx
  on public.announcement_modal_seen (user_id);

-- ---------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.announcement_modals to authenticated;
grant select, insert, update, delete on public.announcement_modal_seen to authenticated;

alter table public.announcement_modals enable row level security;
alter table public.announcement_modal_seen enable row level security;

-- Staff who can send announcements manage everything (mirrors
-- updates_manage_staff) -- WITH CHECK set explicitly, closing the
-- null-with_check hole D2 (F302) flagged on the older policies.
create policy announcement_modals_manage_staff on public.announcement_modals
  for all to authenticated
  using (is_admin_or_staff(auth.uid()) and has_cap('send_announcements'))
  with check (is_admin_or_staff(auth.uid()) and has_cap('send_announcements'));

-- Any authenticated member can read the active announcement.
create policy announcement_modals_select_active on public.announcement_modals
  for select to authenticated
  using (is_active = true);

-- Members read/write only their own seen records (mirrors update_reads_own).
create policy announcement_modal_seen_own on public.announcement_modal_seen
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
