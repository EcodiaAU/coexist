-- excel_sync_runs: per-run heartbeat for the excel-sync Edge Function.
--
-- Why: jobid 9 (excel-from-sync) was paused on 2026-04-21 13:30 UTC and went
-- dark for 7+ days before anyone noticed. Pausing was the symptom; the gap in
-- monitoring was the cause of nobody noticing. This table is the producer side
-- of a sync-health monitor. Each Edge Function run inserts one row with run
-- metrics. Daily aggregation (in EcodiaOS) surfaces dark windows + weak-dedup
-- warnings as status_board signals.
--
-- Doctrine: ~/ecodiaos/patterns/excel-sync-collectives-migration.md
-- Doctrine: ~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md
-- Audit: ~/ecodiaos/drafts/coexist-sheet-db-audit-2026-04-29.md

CREATE TABLE IF NOT EXISTS public.excel_sync_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at        timestamptz NOT NULL DEFAULT now(),
  direction     text NOT NULL,
  event_id      uuid NULL,

  -- from-excel metrics
  from_excel_synced                      integer NULL,
  from_excel_forms_rows_synced           integer NULL,
  from_excel_skipped_no_collective       integer NULL,
  from_excel_skipped_legacy              integer NULL,
  from_excel_error_count                 integer NULL,

  -- to-excel metrics
  to_excel_appended                      integer NULL,
  to_excel_updated                       integer NULL,
  to_excel_skipped                       integer NULL,
  to_excel_skipped_duplicates            integer NULL,
  to_excel_weak_dedup_warning_count      integer NULL,
  to_excel_error_count                   integer NULL,

  -- full response payload for forensic depth
  summary       jsonb NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS excel_sync_runs_run_at_idx
  ON public.excel_sync_runs (run_at DESC);

CREATE INDEX IF NOT EXISTS excel_sync_runs_direction_idx
  ON public.excel_sync_runs (direction, run_at DESC);

-- Limit access. Service role bypasses RLS; admins (no anon access) can read for
-- the future admin-side monitoring UI if/when added.
ALTER TABLE public.excel_sync_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'excel_sync_runs'
      AND policyname = 'admin_read'
  ) THEN
    CREATE POLICY admin_read ON public.excel_sync_runs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('admin','national_leader')
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.excel_sync_runs IS
  'Per-run heartbeat for the excel-sync Edge Function. Each row = one sync run. '
  'Used to detect dark windows (no recent runs), spike in dedup warnings, or '
  'sync errors. See audit 2026-04-29.';
