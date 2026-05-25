-- ============================================================
-- 20260525: Event push notification extensions
-- 1. Schedule event-day-notify cron (was left commented in mig 018)
-- 2. chat_messages: add event_survey_event_id column + 'event_survey' message_type
-- 3. Schedule event-post-survey-invite cron (sibling to photo-invite)
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. event-day-notify pg_cron job
--    Migration 018 left this as a NOTE comment ("Run this manually in the
--    Supabase SQL editor"). Result: 0 day-of push notifications ever sent.
--    Schedule it the same way photo-invite does, via a plpgsql wrapper.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cron_event_day_notify() RETURNS void AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/event-day-notify';
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
  PERFORM cron.unschedule('event-day-notify')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-day-notify');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Every 15 min, offset to :07/22/37/52 so it doesn't collide with the existing
-- :00 / :17 / :23 / :30 jobs (event-reminders runs */30, post-photo at :23).
SELECT cron.schedule(
  'event-day-notify',
  '7,22,37,52 * * * *',
  $$SELECT public.cron_event_day_notify()$$
);

-- ---------------------------------------------------------------------------
-- 2. chat_messages: event_survey widget plumbing
-- ---------------------------------------------------------------------------

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS event_survey_event_id uuid
    REFERENCES public.events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_event_survey_event_id
  ON public.chat_messages (event_survey_event_id)
  WHERE event_survey_event_id IS NOT NULL;

-- Extend message_type CHECK to allow 'event_survey'. Drop + recreate is the
-- safest path - the existing constraint allows: text, image, voice, video,
-- poll, announcement, system, html, carpool, event_photos.
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type = ANY (ARRAY[
    'text'::text,
    'image'::text,
    'voice'::text,
    'video'::text,
    'poll'::text,
    'announcement'::text,
    'system'::text,
    'html'::text,
    'carpool'::text,
    'event_photos'::text,
    'event_survey'::text
  ]));

-- ---------------------------------------------------------------------------
-- 3. event-post-survey-invite pg_cron job
--    Sibling to event-post-photo-invite. Hourly at minute :41 (photo at :23,
--    event-day-notify at :07/22/37/52, reminders */30 - keep load spread).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cron_event_post_survey_invite() RETURNS void AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/event-post-survey-invite';
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
  PERFORM cron.unschedule('event-post-survey-invite')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-post-survey-invite');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'event-post-survey-invite',
  '41 * * * *',
  $$SELECT public.cron_event_post_survey_invite()$$
);
