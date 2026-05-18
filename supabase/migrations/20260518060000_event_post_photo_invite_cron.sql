-- pg_cron: hourly invocation of event-post-photo-invite edge function.
-- Mirrors carpool-archive-sweep wrapper shape.

CREATE OR REPLACE FUNCTION public.cron_event_post_photo_invite() RETURNS void AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/event-post-photo-invite';
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

DO $$
BEGIN
  PERFORM cron.unschedule('event-post-photo-invite')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-post-photo-invite');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Every hour at minute 23 to spread cron load (other crons land on 00 and 17)
SELECT cron.schedule(
  'event-post-photo-invite',
  '23 * * * *',
  $$SELECT public.cron_event_post_photo_invite()$$
);
