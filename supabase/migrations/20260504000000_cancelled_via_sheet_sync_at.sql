-- cancelled_via_sheet_sync_at: stamp set by excel-sync from-excel reconciliation
-- when a migrated-collective event is found in the DB but absent from the sheet.
--
-- Why: Tate, 4 May 2026 - sheet is canonical. If a leader deletes a row in the
-- "Post Event Review" sheet (e.g. removes the OCCA placeholder we left), the DB
-- needs to follow. The reconciliation pass at the tail of syncFromExcel finds
-- migrated-collective events that did not appear in the sheet during this run,
-- marks them status='cancelled', and stamps this column. We do NOT cascade-
-- delete event_impact / event_registrations - those stay for historical
-- accountability. A leader can manually un-cancel via the app if the deletion
-- was a mistake.
--
-- Doctrine: ~/ecodiaos/patterns/excel-sync-collectives-migration.md
-- Doctrine: ~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cancelled_via_sheet_sync_at timestamptz;

COMMENT ON COLUMN public.events.cancelled_via_sheet_sync_at IS
  'Set by excel-sync from-excel reconciliation when this event is in the DB but absent from the canonical sheet during a sync run. Status is flipped to cancelled alongside the stamp. Distinguishes sheet-driven cancellations from leader-driven ones (NULL).';

CREATE INDEX IF NOT EXISTS events_cancelled_via_sheet_sync_at_idx
  ON public.events (cancelled_via_sheet_sync_at)
  WHERE cancelled_via_sheet_sync_at IS NOT NULL;
