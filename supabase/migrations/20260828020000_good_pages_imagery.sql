-- Feel Good / Do Good go imagery-first (Tate 2026-08-28: "full bleed images,
-- configurable by admin, not just cringe boring UI").
--
-- image_url is the per-row cover. When it is null the client falls back to a
-- CATEGORY image, so a row added by staff without a photo still renders a
-- full-bleed card instead of a grey box. focal x/y mirror the events/collectives
-- convention so a face or horizon can be kept in frame on a tall crop.

alter table public.support_resources
  add column if not exists image_url text,
  add column if not exists image_position_x integer,
  add column if not exists image_position_y integer;

alter table public.do_good_organisations
  add column if not exists image_url text,
  add column if not exists image_position_x integer,
  add column if not exists image_position_y integer;

-- Category-level fallback imagery, shared by both surfaces. Keyed by the same
-- category strings the two tables use, with a `surface` discriminator because
-- "youth" means something different on a crisis line than on a volunteering
-- listing.
create table if not exists public.good_category_images (
  id         uuid primary key default gen_random_uuid(),
  surface    text not null check (surface in ('feel_good','do_good')),
  category   text not null,
  image_url  text not null,
  updated_at timestamptz not null default now(),
  unique (surface, category)
);

alter table public.good_category_images enable row level security;

drop policy if exists "good_category_images public read" on public.good_category_images;
create policy "good_category_images public read" on public.good_category_images
  for select using (true);

drop policy if exists "good_category_images staff write" on public.good_category_images;
create policy "good_category_images staff write" on public.good_category_images
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','admin')));

drop trigger if exists trg_good_category_images_updated on public.good_category_images;
create trigger trg_good_category_images_updated before update on public.good_category_images
  for each row execute function public.cms_set_updated_at();

grant select on public.good_category_images to anon;
grant select, insert, update, delete on public.good_category_images to authenticated;
