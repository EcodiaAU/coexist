-- ============================================================================
-- 20260905000100: pin search_path on every vault-reading function that lacked
-- one, and stop the two excel sync crons carrying the service_role key as a
-- plaintext literal in their own body.
--
-- Origin: found 2026-09-05 by the Co-Exist anon SECURITY DEFINER audit.
-- Board row: 98dad934
-- Sibling: 20260905000000_revoke_anon_execute_cron_entrypoints.sql
--
-- THE PLAINTEXT KEY. cron_excel_from_sync and cron_excel_to_sync declared
--   svc_key text := '<service_role JWT literal>';
-- instead of reading vault.decrypted_secrets the way their five siblings do.
-- A function body is not a secret store: prosrc is world-readable through the
-- catalog to every role that can reach pg_proc, it lands in every pg_dump and
-- every schema diff, and it survives in the catalog long after the key is
-- rotated. This migration replaces both bodies with the vault read its siblings
-- already use, so the literal stops being stored in the database at all.
-- The key itself still needs rotating, because it was stored in plaintext for
-- as long as those bodies existed. That is a multi-consumer credential on the
-- client's project and is boarded for a human decision, not done here.
--
-- WHY pg_temp IS LISTED LAST. Postgres searches pg_temp FIRST when the setting
-- does not name it, so "SET search_path = public" alone still leaves a
-- SECURITY DEFINER body resolving unqualified names against a caller-created
-- temp object. Naming pg_temp explicitly at the end is what actually closes
-- that. Three functions already pinned in this database (event_digest_run,
-- event_reengagement_run, collective_event_invite_run) use the shorter
-- search_path=public form and are correspondingly under-hardened; they are left
-- alone here so this migration stays inside the audit's scope.
--
-- The revoke in the sibling migration is not disturbed: CREATE OR REPLACE
-- preserves the existing ACL and ownership.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_excel_from_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/excel-sync?direction=from-excel';
  svc_key  text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cron_excel_to_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/excel-sync?direction=to-excel';
  svc_key  text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$fn$;

-- cron_excel_to_sync was SECURITY INVOKER. pg_cron runs it as postgres, which
-- can read the vault either way, but it is promoted to DEFINER here so both
-- halves of the excel pair behave identically and neither depends on the
-- calling role holding vault access.

ALTER FUNCTION public.cron_carpool_archive_sweep()        SET search_path = public, pg_temp;
ALTER FUNCTION public.cron_event_day_notify()             SET search_path = public, pg_temp;
ALTER FUNCTION public.cron_event_post_impact_log_invite() SET search_path = public, pg_temp;
ALTER FUNCTION public.cron_event_post_photo_invite()      SET search_path = public, pg_temp;
ALTER FUNCTION public.cron_event_post_survey_invite()     SET search_path = public, pg_temp;
ALTER FUNCTION public.cron_stats_drift_check()            SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_chat_mention_push()          SET search_path = public, pg_temp;

-- Re-assert the sibling revoke for the two replaced functions. CREATE OR REPLACE
-- preserves the ACL, so this is belt-and-braces and is a no-op on production;
-- it matters on a fresh db reset where this file may run before the grants
-- settle.
REVOKE EXECUTE ON FUNCTION public.cron_excel_from_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_excel_to_sync()   FROM PUBLIC, anon, authenticated;
