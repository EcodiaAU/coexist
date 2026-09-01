-- ============================================================
-- 20260901: Outbound emergency-contact gap nudge
--
-- Co-Exist asks for an emergency contact at two points and both work: the
-- ticket-purchase gate (65646d56) and the app-open backstop dietary-gate.tsx
-- (8c848446). Both only fire when the person OPENS THE APP, so a member who
-- bought a seat and never came back was asked by nothing and chased by nobody.
--
-- Measured 2026-09-01 on event 02947960 (Wild Mountains Conservation Campout,
-- 2026-09-04): of 22 live seats, the 13 profiles touched since the gate
-- shipped carried ZERO gaps and the 9 untouched since purchase carried all 4.
-- Every one of those 4 bought before the gate existed. The rule is right; the
-- reach was missing. `event-safety-gap-nudge` is the reach.
--
-- SCOPE: events.is_ticketed = true only, which is exactly the app-open gate's
-- own eligibility. Measured the same day: with that filter, 4 upcoming events
-- / 60 seats / 6 gaps. Without it, 30 events and 279 gaps (Merri Mornings
-- alone 108 of 148), i.e. a mass-mailout to two-hour beach clean-up
-- attendees who were never asked for a contact and do not need to be.
--
-- Sibling to event-post-impact-log-invite (:09) / event-post-photo-invite
-- (:23) / event-post-survey-invite (:41) / event-day-notify (:07/22/37/52) /
-- event-reminders (every 30 min). This one runs hourly at :27, which was the
-- widest free gap in cron.job as probed 2026-09-01: :17 is taken by
-- carpool-archive-sweep, and :23 / :30 are its nearest edge-function neighbours.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Ledger: one row per (event, person, step) CLAIMED.
--
--    UNIQUE(event_id, user_id, follow_up_number) gives per-step idempotency,
--    mirroring email_reminders_sent / event_impact_log_invites_sent.
--
--    The edge function writes this row BEFORE it sends, and mails only the
--    rows its own insert returned. That inverts the order event-reminders
--    uses, on purpose: a duplicate SAFETY email teaches the member that the
--    ask is noise, while a dropped one costs a 48h wait before the next step
--    asks again. So the ledger is not a record of what was sent, it is the
--    permit to send, and the sweep is at-most-once by construction.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_safety_nudges_sent (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  follow_up_number integer NOT NULL CHECK (follow_up_number >= 0),
  sent_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, follow_up_number)
);

CREATE INDEX IF NOT EXISTS idx_event_safety_nudges_sent_event
  ON public.event_safety_nudges_sent (event_id);

CREATE INDEX IF NOT EXISTS idx_event_safety_nudges_sent_event_user
  ON public.event_safety_nudges_sent (event_id, user_id);

-- Service-role-only: written and read exclusively by the edge function under
-- the service-role key (which bypasses RLS). RLS on with no public policies so
-- an authenticated client can neither read the ledger nor forge a claim that
-- would suppress somebody's safety nudge.
ALTER TABLE public.event_safety_nudges_sent ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.event_safety_nudges_sent TO service_role;

-- ---------------------------------------------------------------------------
-- 2. pg_cron job (hourly at :27)
--
--    The cadence lives in the edge function, not here. This job only asks the
--    question every hour; the function decides whether any given person is due
--    (>= 48h since their last step, at most 3 steps, event 12h to 14d out).
--    An hourly poke against a real-time gap cannot compress the cadence.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cron_event_safety_gap_nudge() RETURNS void AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/event-safety-gap-nudge';
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

-- Unschedule any prior registration first so re-running this migration cannot
-- leave two jobs firing the same sweep an hour apart.
DO $$
BEGIN
  PERFORM cron.unschedule('event-safety-gap-nudge')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-safety-gap-nudge');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'event-safety-gap-nudge',
  '27 * * * *',
  $$SELECT public.cron_event_safety_gap_nudge()$$
);

-- ---------------------------------------------------------------------------
-- 3. Cleanup: drop ledger rows for events that are well past.
--
--    The ledger only ever answers "has this person been nudged for THIS
--    event", and an event a month gone can never be nudged again. Weekly at
--    03:20 UTC, offset from the 03:00 email_reminders_sent purge.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-safety-nudges')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-safety-nudges');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-safety-nudges',
  '20 3 * * 0',
  $$
  DELETE FROM public.event_safety_nudges_sent
  WHERE sent_at < now() - interval '30 days';
  $$
);
