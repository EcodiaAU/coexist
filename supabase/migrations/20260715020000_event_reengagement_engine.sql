-- =====================================================================
-- Event re-engagement engine: close the re-attendance loop.
-- =====================================================================
-- Origin: Tate 2026-07-15 "get returning attendances up ... figure out
-- mechanics and strategies to get people to come back".
--
-- Diagnosis (live coexist DB 2026-07-15):
--   * attendance = event_registrations checked in (status='attended' or
--     checked_in_at set). 567 distinct attendees, ~31% ever return
--     (matches admin Insights return_rate_pct ~28%).
--   * median time-to-return 14 days; 88% of ALL returns land within 30
--     days of the prior event, ~98% within 60. The 30-day window after an
--     event is decisive: miss it and they are gone.
--   * 148 people are in the win-back window RIGHT NOW (last check-in
--     18-40d ago, no upcoming registration, opted in, and their
--     collective has a published upcoming event to point them at).
--   * THE GAP: every notification type that fires (event_reminder,
--     event_updated, survey_request, chat_*) is about an event the member
--     has ALREADY committed to. NOTHING reaches a past attendee toward a
--     NEW event. The `new_event_in_collective` push type is fully wired on
--     the CLIENT (use-notifications.ts routing + a default-ON settings
--     toggle) but no server code ever emits it. This completes that
--     unwired last mile.
--
-- Design: a daily sweep, two segments, both riding the golden window:
--   A) post_event  - attended an event that ended 2-36h ago and has no
--      upcoming registration -> nudge them to the next event in their
--      collective while the moment is warm.
--   B) winback     - last check-in 18-40d ago, no upcoming registration
--      -> catch them at the cliff before the 60-day death.
-- Both emit type `new_event_in_collective` (existing toggle, default ON),
-- write an in-app notifications row AND a push via send-push (which already
-- filters by that toggle + per-user quiet hours), and are recorded in a
-- dedup ledger with a 10-day per-user frequency cap.
--
-- Event selection reuses the proven recipient_next_events() RPC (built for
-- send-campaign "hype the next event" blasts). Idempotent throughout.
-- =====================================================================

-- --- Dedup / frequency ledger --------------------------------------
CREATE TABLE IF NOT EXISTS public.reengagement_nudges_sent (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('post_event','winback')),
  channel    text NOT NULL DEFAULT 'push',
  sent_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reengage_user_event_kind
  ON public.reengagement_nudges_sent(user_id, event_id, kind);
CREATE INDEX IF NOT EXISTS idx_reengage_user_sent
  ON public.reengagement_nudges_sent(user_id, sent_at DESC);

ALTER TABLE public.reengagement_nudges_sent ENABLE ROW LEVEL SECURITY;
-- No policies: internal telemetry. service_role (crons) bypasses RLS;
-- authenticated users get nothing. delete-user-data should sweep this too
-- but the ON DELETE CASCADE from profiles already covers account deletion.

-- --- Target selection ----------------------------------------------
-- Returns one row per user to nudge, with the event to point them at.
-- Excludes: users already registered for an upcoming event (engaged),
-- opted-out of marketing, opted-out of the new_event_in_collective push,
-- suspended/deleted, nudged in the last 10 days, or already nudged for
-- this exact (event, kind).
CREATE OR REPLACE FUNCTION public.reengagement_targets()
RETURNS TABLE (
  user_id         uuid,
  kind            text,
  event_id        uuid,
  event_title     text,
  event_date      timestamptz,
  event_address   text,
  collective_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH checkins AS (
    SELECT r.user_id, COALESCE(e.date_end, e.date_start) AS ended
    FROM event_registrations r
    JOIN events e ON e.id = r.event_id
    WHERE r.status = 'attended' OR r.checked_in_at IS NOT NULL
  ),
  last_seen AS (
    SELECT user_id, MAX(ended) AS last_att FROM checkins GROUP BY user_id
  ),
  future_reg AS (
    SELECT DISTINCT r.user_id
    FROM event_registrations r
    JOIN events e ON e.id = r.event_id
    WHERE e.date_start > now()
      AND r.status IN ('registered','attended','invited')
  ),
  cand AS (
    -- one kind per user; post_event wins if somehow both (min() = 'post_event')
    SELECT user_id, MIN(k) AS kind FROM (
      SELECT DISTINCT user_id, 'post_event'::text AS k
      FROM checkins
      WHERE ended BETWEEN now() - interval '36 hours' AND now() - interval '2 hours'
      UNION ALL
      SELECT user_id, 'winback'::text
      FROM last_seen
      WHERE last_att BETWEEN now() - interval '40 days' AND now() - interval '18 days'
    ) u GROUP BY user_id
  ),
  elig AS (
    SELECT c.user_id, c.kind
    FROM cand c
    JOIN profiles p ON p.id = c.user_id
    WHERE COALESCE(p.marketing_opt_in, false)
      AND p.deleted_at IS NULL
      AND COALESCE(p.is_suspended, false) = false
      AND COALESCE((p.notification_preferences->>'new_event_in_collective')::boolean, true)
      AND c.user_id NOT IN (SELECT user_id FROM future_reg)
      AND NOT EXISTS (
        SELECT 1 FROM reengagement_nudges_sent s
        WHERE s.user_id = c.user_id AND s.sent_at > now() - interval '10 days'
      )
  )
  SELECT e.user_id, e.kind, ne.event_id, ne.title, ne.date_start, ne.address, ne.collective_name
  FROM elig e
  CROSS JOIN LATERAL (
    SELECT * FROM public.recipient_next_events(ARRAY[e.user_id]) LIMIT 1
  ) ne
  WHERE ne.event_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM reengagement_nudges_sent s2
      WHERE s2.user_id = e.user_id AND s2.event_id = ne.event_id AND s2.kind = e.kind
    );
$$;

-- --- The engine ----------------------------------------------------
-- Groups targets per (kind, event), renders the copy, and (unless dry-run)
-- fires a push via send-push + inserts the in-app notification + records
-- the ledger row. Returns a JSON plan either way, so a dry-run doubles as
-- the audience/copy preview.
CREATE OR REPLACE FUNCTION public.event_reengagement_run(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  svc_key   text;
  push_url  text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/send-push';
  r         record;
  v_title   text;
  v_body    text;
  v_datestr text;
  v_groups  int  := 0;
  v_targets int  := 0;
  v_sent    int  := 0;
  v_plan    jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT kind, event_id, event_title, event_date, collective_name,
           array_agg(user_id) AS user_ids, count(*) AS n
    FROM public.reengagement_targets()
    GROUP BY kind, event_id, event_title, event_date, collective_name
    ORDER BY kind, event_date
  LOOP
    v_groups  := v_groups + 1;
    v_targets := v_targets + r.n;

    -- date_start is wall-clock-as-UTC (floating local); format in UTC so the
    -- intended local time is preserved without a shift. e.g. "Sun 20 Jul".
    v_datestr := to_char(r.event_date AT TIME ZONE 'UTC', 'FMDy FMDD FMMon');

    IF r.kind = 'winback' THEN
      v_title := 'Come back to ' || r.collective_name || ' 🌱';
      v_body  := 'It''s been a little while. ' || r.event_title ||
                 ' is on ' || v_datestr || '. We''d love to see you there.';
    ELSE
      v_title := 'Keep it going 🌱';
      v_body  := r.collective_name || ' has ' || r.event_title ||
                 ' coming up ' || v_datestr || '. Save your spot.';
    END IF;

    v_plan := v_plan || jsonb_build_object(
      'kind', r.kind, 'event_id', r.event_id, 'event_title', r.event_title,
      'date', v_datestr, 'collective', r.collective_name, 'users', r.n,
      'title', v_title, 'body', v_body
    );

    IF NOT p_dry_run THEN
      IF svc_key IS NULL THEN
        SELECT decrypted_secret INTO svc_key
        FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
      END IF;

      -- Push (send-push filters by the new_event_in_collective toggle +
      -- per-user quiet hours, fans out per device token, prunes dead tokens).
      PERFORM net.http_post(
        url := push_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || svc_key
        ),
        body := jsonb_build_object(
          'userIds', to_jsonb(r.user_ids),
          'title', v_title,
          'body', v_body,
          'data', jsonb_build_object(
            'type', 'new_event_in_collective',
            'event_id', r.event_id::text,
            'route', '/events/' || r.event_id::text
          )
        )
      );

      -- In-app notification (the bell), for reach beyond push.
      INSERT INTO public.notifications (user_id, type, title, body, data)
      SELECT uid, 'new_event_in_collective', v_title, v_body,
             jsonb_build_object('event_id', r.event_id::text,
                                'route', '/events/' || r.event_id::text)
      FROM unnest(r.user_ids) AS uid;

      -- Ledger (dedup + frequency cap source of truth).
      INSERT INTO public.reengagement_nudges_sent (user_id, event_id, kind, channel)
      SELECT uid, r.event_id, r.kind, 'push'
      FROM unnest(r.user_ids) AS uid
      ON CONFLICT (user_id, event_id, kind) DO NOTHING;

      v_sent := v_sent + r.n;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'groups',  v_groups,
    'targets', v_targets,
    'sent',    v_sent,
    'plan',    v_plan
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reengagement_targets()            FROM public;
REVOKE ALL ON FUNCTION public.event_reengagement_run(boolean)   FROM public;
GRANT EXECUTE ON FUNCTION public.reengagement_targets()          TO service_role;
GRANT EXECUTE ON FUNCTION public.event_reengagement_run(boolean) TO service_role;

-- --- Cron wrapper (NOT scheduled here) -----------------------------
-- The schedule is intentionally left to a separate go-live step so applying
-- this migration is inert. Enable with:
--   SELECT cron.schedule('event-reengagement','47 22 * * *',
--     $$SELECT public.event_reengagement_run(false)$$);
-- 22:47 UTC = 08:47 AEST, a morning slot; send-push suppresses per-user
-- quiet hours for other AU timezones. Minute 47 spreads cron load (others
-- land on 00/07/09/22/23/41).
CREATE OR REPLACE FUNCTION public.cron_event_reengagement()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.event_reengagement_run(false);
END;
$$;

COMMENT ON FUNCTION public.event_reengagement_run(boolean) IS
  'Daily re-engagement sweep. Two segments (post_event momentum, winback '
  'cliff) nudge past attendees with no upcoming registration toward the '
  'next event in their collective, in the 30-day return window. dry_run '
  'true returns the audience+copy plan without sending. Origin Tate 2026-07-15.';
