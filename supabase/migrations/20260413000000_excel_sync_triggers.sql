-- Excel Sync Triggers
-- Automatically call the excel-sync Edge Function when survey_responses
-- or event_impact rows are inserted or updated.
-- Uses pg_net extension for async HTTP calls from within triggers.

-- 1. Enable pg_net
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.trigger_excel_sync()
RETURNS trigger AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/excel-sync';
  -- Service role key for server-side Edge Function invocation (SECURITY DEFINER only)
  svc_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
  event_id_val uuid;
BEGIN
  -- Extract event_id from the changed row
  IF TG_TABLE_NAME = 'survey_responses' THEN
    event_id_val := NEW.event_id;
  ELSIF TG_TABLE_NAME = 'event_impact' THEN
    event_id_val := NEW.event_id;
  END IF;

  -- Only sync if we have an event_id
  IF event_id_val IS NOT NULL THEN
    PERFORM net.http_post(
      url := edge_url || '?direction=to-excel&event_id=' || event_id_val::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body := '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Triggers on survey_responses
DROP TRIGGER IF EXISTS excel_sync_on_survey_response ON public.survey_responses;
CREATE TRIGGER excel_sync_on_survey_response
  AFTER INSERT OR UPDATE ON public.survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_excel_sync();

-- 4. Triggers on event_impact
DROP TRIGGER IF EXISTS excel_sync_on_event_impact ON public.event_impact;
CREATE TRIGGER excel_sync_on_event_impact
  AFTER INSERT OR UPDATE ON public.event_impact
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_excel_sync();
