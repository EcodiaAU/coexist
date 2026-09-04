-- ============================================================================
-- 20260905000300: take the last plaintext service_role key out of the catalog.
--
-- Origin: found 2026-09-05 by the Co-Exist anon SECURITY DEFINER audit, on the
-- verification pass after 20260905000100 was applied. That migration cleared the
-- two cron_excel_* bodies, and the re-probe for a JWT literal across pg_proc
-- still returned one row, which is how this function surfaced. The count was the
-- finding, not the guess.
-- Board row: 98dad934
--
-- trigger_excel_sync is a SECURITY DEFINER trigger function that carried the
-- service_role JWT as a literal in its body, exactly as the two excel crons did.
-- It is currently attached to NO table: pg_trigger has zero non-internal rows
-- pointing at it, so it is dead code that was still storing a live credential in
-- a world-readable catalog. It is rewritten rather than dropped, because whether
-- the survey_responses and event_impact triggers should come back is a Co-Exist
-- product question and not an audit one. Behaviour is otherwise unchanged.
--
-- It also loses its browser-role grants. A function returning trigger is not
-- exposed as RPC by PostgREST, so this is defence in depth rather than a fix for
-- a reachable path.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_excel_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/excel-sync';
  svc_key  text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
  event_id_val uuid;
  event_date date;
BEGIN
  IF TG_TABLE_NAME = 'survey_responses' THEN
    event_id_val := NEW.event_id;
  ELSIF TG_TABLE_NAME = 'event_impact' THEN
    event_id_val := NEW.event_id;
  END IF;

  IF event_id_val IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only sync 2026+ events, never touch historical data.
  SELECT date_start::date INTO event_date
  FROM events WHERE id = event_id_val;

  IF event_date IS NULL OR event_date < '2026-01-01'::date THEN
    RETURN NEW;
  END IF;

  -- Append-only sync: the Edge Function skips an event already in the sheet.
  PERFORM net.http_post(
    url := edge_url || '?direction=to-excel&event_id=' || event_id_val::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );

  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.trigger_excel_sync() FROM PUBLIC, anon, authenticated;
