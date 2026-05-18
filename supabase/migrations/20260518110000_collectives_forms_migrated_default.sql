-- Default new collectives to "already migrated to app-canonical" so they
-- sync app-side post-event surveys to the master sheet from day one. The
-- 14 existing collectives were flipped manually in
-- 20260518090000_flip_remaining_collectives_to_migrated.sql; this DEFAULT
-- protects new collectives created via the admin UI from accidentally
-- landing with forms_migrated_at IS NULL and silently being excluded from
-- to-excel sync (the failure mode that hid Hannah's Brisbane Norman Creek
-- Bushcare survey from 2026-05-17).
--
-- The 'Test' collective stays NULL by explicit name-check guard so test
-- events keep bypassing the sheet. Manual cleanup if a test collective
-- needs to differ.
--
-- Origin: Tate verbatim 2026-05-18 - "all of victoria, Perth, Tamworth,
-- etc should be flipped actually. I dont think anyone is going to still
-- be on forms after may".
-- Doctrine: ~/ecodiaos/patterns/excel-sync-collectives-migration.md

ALTER TABLE public.collectives
  ALTER COLUMN forms_migrated_at
  SET DEFAULT (CURRENT_DATE)::timestamptz;
