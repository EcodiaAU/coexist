-- OneDrive auto-mirror for event album media.
--
-- Leaders add photos/videos to an event in the app (event_photos, bucket
-- event-photos, which already accepts video). The onedrive-mirror edge function
-- then copies each file into a per-event OneDrive folder that matches the org's
-- existing convention  Photos/<Collective>/<Event title> <DD.MM.YYYY>  on
-- ceo@coexistaus.org's OneDrive, auto-creating the folder, and stores the
-- per-event folder share link back on the event so the survey can deep-link it.
-- Origin: Tate 2026-07-27 (in-app upload -> auto OneDrive, per-event link).

-- Per-file mirror tracking (idempotency + error surface).
alter table public.event_photos add column if not exists onedrive_item_id text;
alter table public.event_photos add column if not exists onedrive_mirrored_at timestamptz;
alter table public.event_photos add column if not exists onedrive_mirror_error text;

-- Per-event folder pointer for the survey deep-link.
alter table public.events add column if not exists onedrive_folder_url text;
alter table public.events add column if not exists onedrive_folder_id text;

-- Fast lookup of the mirror backlog for the sweep.
create index if not exists event_photos_unmirrored_idx
  on public.event_photos (created_at)
  where onedrive_mirrored_at is null and archived_at is null;

-- Backstop sweep: twice hourly, mirror any unmirrored photos the instant
-- per-upload invoke missed (offline sync, transient Graph failure, backfill).
-- Uses the same Vault-secret pattern as event-reminders-30min.
select cron.schedule(
  'onedrive-mirror-sweep',
  '13,43 * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/onedrive-mirror',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"sweep": true, "limit": 100}'::jsonb
  );
  $job$
);
