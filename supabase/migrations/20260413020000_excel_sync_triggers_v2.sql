-- Excel Sync Triggers v2 - APPEND ONLY, 2026+ only
-- Only fires for events with date_start >= 2026-01-01
-- Only appends new events to Excel - never overwrites existing rows
-- Excel is the source of truth for all historical data

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_excel_sync()
RETURNS trigger AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/excel-sync';
  -- Service role key for server-side Edge Function invocation (SECURITY DEFINER only)
  svc_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
  event_id_val uuid;
  event_date date;
BEGIN
  -- Extract event_id from the changed row
  IF TG_TABLE_NAME = 'survey_responses' THEN
    event_id_val := NEW.event_id;
  ELSIF TG_TABLE_NAME = 'event_impact' THEN
    event_id_val := NEW.event_id;
  END IF;

  -- Only sync if we have an event_id
  IF event_id_val IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only sync 2026+ events - never touch historical data
  SELECT date_start::date INTO event_date
  FROM events WHERE id = event_id_val;

  IF event_date IS NULL OR event_date < '2026-01-01'::date THEN
    RETURN NEW;
  END IF;

  -- Append-only sync: the Edge Function will skip if event already in sheet
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create triggers (v1 already dropped by disable migration)
DROP TRIGGER IF EXISTS excel_sync_on_survey_response ON public.survey_responses;
CREATE TRIGGER excel_sync_on_survey_response
  AFTER INSERT OR UPDATE ON public.survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_excel_sync();

DROP TRIGGER IF EXISTS excel_sync_on_event_impact ON public.event_impact;
CREATE TRIGGER excel_sync_on_event_impact
  AFTER INSERT OR UPDATE ON public.event_impact
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_excel_sync();
