-- Feel Good + Do Good (Kurt Jones framing, 2026-08-27).
--
-- Two content surfaces the app has never had:
--   FEEL GOOD -> public.support_resources     mental-health + crisis support lines
--   DO GOOD   -> public.do_good_organisations other orgs whose opportunities our
--                members can go and take up
--
-- Both are CMS-shaped and follow the marketing_cms precedent exactly: anon reads
-- published rows only, manager|admin writes, cms_set_updated_at on update.
--
-- Deliberately NOT reusing public.organisations (that is the tenant table and
-- holds exactly one row, Co-Exist itself) or public.partners (commercial
-- sponsors whose logos sit on the partners page). A conservation org we point
-- members at is neither of those things.

-- ---------------------------------------------------------------- FEEL GOOD
create table if not exists public.support_resources (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  tagline       text,
  -- Dial string. Stored human-readable ("13 11 14"); the client strips spaces
  -- for the tel: href so the displayed number and the dialled number cannot
  -- drift apart in two hand-maintained fields.
  phone         text,
  phone_note    text,
  sms_number    text,
  url           text,
  hours         text,
  -- crisis | counselling | youth | identity | first_nations | family | general
  category      text not null default 'general',
  -- Crisis lines pin to the top of the page regardless of sort_order.
  is_crisis     boolean not null default false,
  sort_order    integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------ DO GOOD
create table if not exists public.do_good_organisations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  blurb         text,
  logo_url      text,
  url           text,
  -- What a member can actually DO there. This is the point of the page, so it
  -- is a first-class column rather than a sentence buried in the blurb.
  opportunity   text,
  -- conservation | wildlife | marine | climate | community | first_nations | youth
  category      text not null default 'conservation',
  -- Free text: "Sunshine Coast, QLD" / "Nationwide" / "Online".
  location      text,
  sort_order    integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists support_resources_published_idx
  on public.support_resources (is_published, is_crisis desc, sort_order);
create index if not exists do_good_organisations_published_idx
  on public.do_good_organisations (is_published, sort_order);

alter table public.support_resources      enable row level security;
alter table public.do_good_organisations  enable row level security;

drop policy if exists "support_resources public read" on public.support_resources;
create policy "support_resources public read" on public.support_resources
  for select using (is_published);

drop policy if exists "do_good_organisations public read" on public.do_good_organisations;
create policy "do_good_organisations public read" on public.do_good_organisations
  for select using (is_published);

do $$
declare t text;
begin
  foreach t in array array['support_resources','do_good_organisations'] loop
    execute format($f$
      drop policy if exists "%1$s staff write" on public.%1$I;
      create policy "%1$s staff write" on public.%1$I for all to authenticated
        using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','admin')))
        with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','admin')));
    $f$, t);
  end loop;
end $$;

drop trigger if exists trg_support_resources_updated on public.support_resources;
create trigger trg_support_resources_updated before update on public.support_resources
  for each row execute function public.cms_set_updated_at();

drop trigger if exists trg_do_good_organisations_updated on public.do_good_organisations;
create trigger trg_do_good_organisations_updated before update on public.do_good_organisations
  for each row execute function public.cms_set_updated_at();

grant select on public.support_resources, public.do_good_organisations to anon;
grant select, insert, update, delete on public.support_resources, public.do_good_organisations to authenticated;
