-- Restore Co-Exist app-vs-master-sheet stats-drift detection as a self-contained
-- Supabase job (edge function stats-drift-check + pg_cron), replacing the dark
-- EcodiaOS-side cron that lost its Microsoft Graph token when it was folded into
-- coexist-health-pass on 2026-06-08. The check had been a no-op since 2026-06-02.
--
-- The edge function (supabase/functions/stats-drift-check) reads the master
-- sheet's "OVERALL" tab TOTAL row via Graph, computes the canonical app rollup
-- (baseline + live, mirroring src/lib/impact-query.ts), diffs them at a 5%
-- threshold, and writes app_settings.stats_drift_last_run (status 'drift'|'ok',
-- the value the /admin/impact badge reads) plus app_settings.stats_drift_detected.

-- Wrapper invoked by pg_cron: posts to the edge function with the service-role
-- bearer from vault, mirroring cron_excel_from_sync / cron_excel_to_sync.
create or replace function public.cron_stats_drift_check()
returns void
language plpgsql
security definer
as $fn$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/stats-drift-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$fn$;

-- Daily at 16:00 UTC = 02:00 AEST, matching the original drift cadence.
-- cron.schedule upserts by job name, so re-running this migration is idempotent.
select cron.schedule('stats-drift-check-daily', '0 16 * * *', $j$select public.cron_stats_drift_check()$j$);
