-- Schedule from-excel sync every 30 minutes using pg_cron + pg_net
-- Runs entirely within Supabase - no VPS dependency

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a function that calls the excel-sync Edge Function
CREATE OR REPLACE FUNCTION public.cron_excel_from_sync() RETURNS void AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/excel-sync?direction=from-excel';
  svc_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: every 30 minutes
SELECT cron.schedule(
  'excel-from-sync',
  '*/30 * * * *',
  $$SELECT public.cron_excel_from_sync()$$
);
