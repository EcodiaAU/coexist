-- Marketing-site hybrid CMS: admin-editable copy + team + partners.
-- Mirrors the app_settings staff-write pattern (migration 064) but gated on the
-- CURRENT user_role enum (staff = manager | admin). Anon may read published
-- content (the marketing site); only manager/admin may write (the /admin/site
-- editor in the app).

-- Shared updated_at trigger
create or replace function public.cms_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── site_content: key/value singletons (hero copy, story, mission, etc.) ──
create table if not exists public.site_content (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- ── team_members ──
create table if not exists public.team_members (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  role_title   text,
  bio          text,
  photo_url    text,
  team_group   text not null default 'core',     -- board | core | leader
  sort_order   int  not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── partners ──
create table if not exists public.partners (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  logo_url     text,
  url          text,
  sort_order   int  not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.site_content enable row level security;
alter table public.team_members enable row level security;
alter table public.partners     enable row level security;

-- Anon read (site_content all; team/partners published only)
drop policy if exists "site_content public read" on public.site_content;
create policy "site_content public read" on public.site_content for select using (true);

drop policy if exists "team_members public read" on public.team_members;
create policy "team_members public read" on public.team_members for select using (is_published);

drop policy if exists "partners public read" on public.partners;
create policy "partners public read" on public.partners for select using (is_published);

-- Staff write (manager | admin), mirroring app_settings_staff_write on the
-- current user_role enum.
do $$
declare t text;
begin
  foreach t in array array['site_content','team_members','partners'] loop
    execute format($f$
      drop policy if exists "%1$s staff write" on public.%1$I;
      create policy "%1$s staff write" on public.%1$I for all to authenticated
        using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','admin')))
        with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','admin')));
    $f$, t);
  end loop;
end $$;

create trigger trg_site_content_updated before update on public.site_content
  for each row execute function public.cms_set_updated_at();
create trigger trg_team_members_updated before update on public.team_members
  for each row execute function public.cms_set_updated_at();
create trigger trg_partners_updated before update on public.partners
  for each row execute function public.cms_set_updated_at();

-- Grants (RLS still gates row visibility/writes)
grant select on public.site_content, public.team_members, public.partners to anon;
grant select, insert, update, delete on public.site_content, public.team_members, public.partners to authenticated;
