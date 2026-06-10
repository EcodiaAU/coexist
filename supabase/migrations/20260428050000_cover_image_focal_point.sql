-- Cover image focal point columns for events + collectives.
-- v1: focal-point only (admins control object-position via x%/y% pair).
-- Default 50/50 = current centre behaviour.

alter table public.events
  add column if not exists cover_image_position_x smallint not null default 50,
  add column if not exists cover_image_position_y smallint not null default 50;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_cover_image_position_x_range'
  ) then
    alter table public.events
      add constraint events_cover_image_position_x_range
      check (cover_image_position_x between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'events_cover_image_position_y_range'
  ) then
    alter table public.events
      add constraint events_cover_image_position_y_range
      check (cover_image_position_y between 0 and 100);
  end if;
end$$;

alter table public.collectives
  add column if not exists cover_image_position_x smallint not null default 50,
  add column if not exists cover_image_position_y smallint not null default 50;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'collectives_cover_image_position_x_range'
  ) then
    alter table public.collectives
      add constraint collectives_cover_image_position_x_range
      check (cover_image_position_x between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'collectives_cover_image_position_y_range'
  ) then
    alter table public.collectives
      add constraint collectives_cover_image_position_y_range
      check (cover_image_position_y between 0 and 100);
  end if;
end$$;
