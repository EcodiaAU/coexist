-- ============================================================
-- 20260623: Event impact-log leader reminders
--
-- Nudges event LEADERSHIP (leader / co_leader / assist_leader of the event's
-- collective) to fill out the event's impact log after it ends, with escalating
-- follow-ups until the impact is logged.
--
-- Completion signal: existence of an `event_impact` row for the event (per-event,
-- any leader filling it stops the nudges for the whole team). Matches the
-- canonical "impact logged" signal codified in 20260520000000.
--
-- Cadence is per-(event, leader): step 0 at ~2h after end, then >=24h, >=48h,
-- >=96h real-time gaps between steps, capped at 4 nudges. The edge function
-- `event-post-impact-log-invite` reads/writes the tracking table below.
--
-- Sibling to event-post-survey-invite (:41) / event-post-photo-invite (:23) /
-- event-day-notify (:07/22/37/52). This one runs hourly at :09 to keep load
-- spread and avoid collision with the existing event-push jobs.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Tracking table: one row per (event, leader, follow_up step) actually sent.
--    UNIQUE(event_id, user_id, follow_up_number) gives idempotency per step,
--    mirroring email_reminders_sent / event_day_notifications_sent.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_impact_log_invites_sent (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  follow_up_number integer NOT NULL CHECK (follow_up_number >= 0),
  sent_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, follow_up_number)
);

CREATE INDEX IF NOT EXISTS idx_event_impact_log_invites_sent_event
  ON public.event_impact_log_invites_sent (event_id);

CREATE INDEX IF NOT EXISTS idx_event_impact_log_invites_sent_event_user
  ON public.event_impact_log_invites_sent (event_id, user_id);

-- Service-role-only table: written/read exclusively by the edge function under
-- the service-role key (which bypasses RLS). Enable RLS with no public policies
-- so authenticated clients cannot read or write the reminder ledger.
ALTER TABLE public.event_impact_log_invites_sent ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.event_impact_log_invites_sent TO service_role;

-- ---------------------------------------------------------------------------
-- 2. event-post-impact-log-invite pg_cron job (hourly at :09)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cron_event_post_impact_log_invite() RETURNS void AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/event-post-impact-log-invite';
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
  PERFORM cron.unschedule('event-post-impact-log-invite')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-post-impact-log-invite');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'event-post-impact-log-invite',
  '9 * * * *',
  $$SELECT public.cron_event_post_impact_log_invite()$$
);
