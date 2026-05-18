-- Flip all non-Test collectives to migrated state (forms_migrated_at = 2026-05-01).
--
-- Origin: Tate verbatim 2026-05-18 - "all of victoria, Perth, Tamworth, etc
-- should be flipped actually. I dont think anyone is going to still be on forms
-- after may". Hannah (Brisbane) had used the in-app post-event survey for the
-- Norman Creek Bushcare event on 2026-05-17 but the to-excel sync silently
-- skipped it because Brisbane.forms_migrated_at was NULL.
--
-- Effect: post-event surveys submitted via the app from these collectives now
-- flow through to the Master Impact Data Sheet via excel-sync (to-excel
-- direction). The 'Test' collective stays unmigrated so test events still
-- bypass the sheet.
--
-- This migration is idempotent + only flips collectives that are currently
-- NULL; collectives already set to an earlier date (Sunshine Coast 2026-05-04,
-- Melbourne City 2026-05-04) are untouched.
--
-- Doctrine: ~/ecodiaos/patterns/excel-sync-collectives-migration.md
-- See also: clients/coexist.md "Collective migration timeline".

UPDATE public.collectives
   SET forms_migrated_at = '2026-05-01T00:00:00+00:00'::timestamptz
 WHERE forms_migrated_at IS NULL
   AND name <> 'Test';
