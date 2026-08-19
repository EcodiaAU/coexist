-- =====================================================================
-- Collective event invite engine: a "one week before" invite to every
-- member of a collective for that collective's upcoming events.
-- =====================================================================
-- Origin: Tate 2026-08-19 (iMessage), verbatim:
--   "Make the coexist app send an invite to all users for next event of
--    the collective/s they're in 1 week before it."
--
-- Shape: mirrors event_reengagement_run (push via send-push + an in-app
-- notifications row + a dedup ledger), but with a DIFFERENT audience.
-- Re-engagement targets lapsed past-attendees; this targets ALL active
-- members of a collective (and of any accepted co-host collective), fired
-- once ~7 days before each of that collective's published events.
--
-- Reuses the client-wired 'new_event_in_collective' notification type: its
-- routing (use-notifications.ts -> /events/<id>) and its default-ON
-- preference toggle already exist, so this is PURE server-side. No native
-- or app change is required to ship it.
--
-- Window: date_start > now() AND date_start <= now() + interval '7 days'.
-- On a daily cadence this fires the day an event crosses the 7-day mark,
-- and also catches an event PUBLISHED when already inside 7 days (the brief
-- edge case "send promptly on the next daily run"). Floating-local time:
-- events.date_start is wall-clock-as-UTC, so we compare against now() and
-- format AT TIME ZONE 'UTC' with no shift (matches every sibling engine).
--
-- Idempotency AND new-member handling in one mechanism: the ledger is keyed
-- on (event_id, user_id).  Each daily run invites only members NOT yet
-- ledgered for that event, so:
--   * a re-run with no membership change enqueues zero (idempotent),
--   * a member who JOINS a collective after the 7-day mark is picked up on
--     the next daily run,
--   * the same member is never invited twice for one event, even when they
--     belong to two co-hosting collectives.
--
-- Channels mirror event_reengagement_run exactly (the proven calm set): a
-- push (send-push filters by the toggle + per-user quiet hours + live
-- tokens) plus an in-app notifications row (the bell) for reach beyond
-- push. Email is deliberately NOT added here: the weekly event_digest
-- already emails the next event to the no-push-token / lapsed audience, and
-- stacking a weekly all-member email would overload members.
--
-- Events with no collective are impossible (events.collective_id is NOT
-- NULL); an inactive collective is skipped via collectives.is_active.
--
-- Cron is intentionally NOT scheduled inside this migration body so
-- re-applying it never double-schedules. Go-live is a separate statement:
--   SELECT cron.schedule('collective-event-invite','33 21 * * *',
--     $$SELECT public.cron_collective_event_invite()$$);  -- 07:33 AEST daily
--
-- SCHEDULED LIVE 2026-08-19 as cron.job 'collective-event-invite' (jobid 26),
-- '33 21 * * *' = 07:33 AEST daily (minute 33 is unused by the other jobs; it
-- runs just ahead of event-reengagement at 08:47 so a member who gets this
-- structured 7-day invite is then excluded from a same-day reengagement nudge
-- by that engine's 48h notifications-row suppression).
--
-- ACTIVATION BASELINE (2026-08-19): at deploy time 6 published events were
-- already inside the 7-day window (2 to 4 days out). A "next week" invite for
-- an event happening this weekend is wrong copy, so those 1026 (event,member)
-- pairs were seeded into the ledger with channel='baseline_seed' (recorded, NOT
-- sent) so activation is silent. Every event that crosses the 7-day mark AFTER
-- deploy (first: the 2026-08-29 batch, which crosses on ~2026-08-22) fires its
-- proper on-time invite. To re-enable a seeded event, delete its baseline_seed
-- ledger rows.
--
-- SCHEDULING SUBSTRATE: this is a Supabase pg_cron job on the Co-Exist project
-- (cron.job), the canonical home for every Co-Exist DB cron (event-reminders,
-- event-reengagement, event-digest, etc.), NOT the ecodiaos-fleet
-- os_scheduled_tasks (that scheduler dispatches Claude Code worker tabs and has
-- no reason to wake one daily to run one SQL function).
-- =====================================================================

-- --- Dedup ledger --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collective_event_invites_sent (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      uuid NOT NULL REFERENCES public.events(id)      ON DELETE CASCADE,
  collective_id uuid NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  channel       text NOT NULL DEFAULT 'push+inapp',
  sent_at       timestamptz NOT NULL DEFAULT now()
);

-- One invite per (event, user): the idempotency + new-member key, and it
-- collapses a user who is in both the primary and a co-host collective.
CREATE UNIQUE INDEX IF NOT EXISTS uq_collective_event_invite_event_user
  ON public.collective_event_invites_sent(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_collective_event_invite_sent_at
  ON public.collective_event_invites_sent(sent_at DESC);

ALTER TABLE public.collective_event_invites_sent ENABLE ROW LEVEL SECURITY;
-- Internal telemetry: no policies. service_role (the cron) bypasses RLS;
-- authenticated users get nothing. ON DELETE CASCADE covers account/event
-- deletion.

-- --- Target selection ----------------------------------------------
-- One row per (user, event) to invite. p_event_ids restricts the scan to a
-- given set of events (used for a targeted manual send and for testing);
-- NULL means every in-window event (the daily cron path).
CREATE OR REPLACE FUNCTION public.collective_event_invite_targets(
  p_event_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  user_id         uuid,
  event_id        uuid,
  collective_id   uuid,
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
  WITH in_window AS (
    SELECT e.id AS event_id, e.collective_id AS primary_collective_id,
           e.title, e.date_start, e.address
    FROM events e
    WHERE e.status = 'published'
      AND e.date_start > now()
      AND e.date_start <= now() + interval '7 days'
      AND (p_event_ids IS NULL OR e.id = ANY(p_event_ids))
  ),
  host_collectives AS (
    -- primary host
    SELECT iw.event_id, iw.primary_collective_id AS collective_id
    FROM in_window iw
    UNION
    -- accepted co-hosts (event_hosts semantics, inlined)
    SELECT iw.event_id, cec.collective_id
    FROM in_window iw
    JOIN collective_event_collaborators cec
      ON cec.event_id = iw.event_id AND cec.status = 'accepted'
  ),
  -- one row per (event, user); prefer the primary collective for attribution
  members AS (
    SELECT DISTINCT ON (hc.event_id, cm.user_id)
      hc.event_id, hc.collective_id, cm.user_id
    FROM host_collectives hc
    JOIN in_window iw ON iw.event_id = hc.event_id
    JOIN collective_members cm
      ON cm.collective_id = hc.collective_id AND cm.status = 'active'
    JOIN collectives c
      ON c.id = hc.collective_id AND COALESCE(c.is_active, true)
    ORDER BY hc.event_id, cm.user_id,
             (hc.collective_id = iw.primary_collective_id) DESC
  )
  SELECT
    m.user_id, m.event_id, m.collective_id,
    iw.title, iw.date_start, iw.address, c.name
  FROM members m
  JOIN in_window iw ON iw.event_id = m.event_id
  JOIN collectives c ON c.id = m.collective_id
  JOIN profiles p ON p.id = m.user_id
  WHERE p.deleted_at IS NULL
    AND COALESCE(p.is_suspended, false) = false
    AND COALESCE((p.notification_preferences->>'new_event_in_collective')::boolean, true)
    AND NOT EXISTS (
      SELECT 1 FROM collective_event_invites_sent s
      WHERE s.event_id = m.event_id AND s.user_id = m.user_id
    );
$$;

-- --- The engine ----------------------------------------------------
-- Snapshots the targets once, fires one grouped push per event, writes the
-- in-app notification + ledger set-based, and returns a JSON plan either
-- way (a dry-run doubles as the audience/copy preview). p_event_ids scopes
-- the run (NULL = all in-window events).
CREATE OR REPLACE FUNCTION public.collective_event_invite_run(
  p_dry_run   boolean DEFAULT false,
  p_event_ids uuid[]  DEFAULT NULL
)
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
  v_groups  int := 0;
  v_targets int := 0;
  v_plan    jsonb := '[]'::jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _cei_targets (
    user_id uuid, event_id uuid, collective_id uuid,
    event_title text, event_date timestamptz, event_address text,
    collective_name text
  ) ON COMMIT DROP;
  TRUNCATE _cei_targets;
  INSERT INTO _cei_targets
    SELECT * FROM public.collective_event_invite_targets(p_event_ids);

  FOR r IN
    SELECT event_id, event_title, event_date, collective_name,
           array_agg(user_id) AS user_ids, count(*) AS n
    FROM _cei_targets
    GROUP BY event_id, event_title, event_date, collective_name
    ORDER BY event_date
  LOOP
    v_groups  := v_groups + 1;
    v_targets := v_targets + r.n;

    -- Floating-local: format the stored wall-clock verbatim (e.g. "Sat 29 Aug").
    v_datestr := to_char(r.event_date AT TIME ZONE 'UTC', 'FMDy FMDD FMMon');
    v_title := r.collective_name || ' event next week 🌱';
    v_body  := r.event_title || ' on ' || v_datestr || '. Tap for details.';

    v_plan := v_plan || jsonb_build_object(
      'event_id', r.event_id, 'event_title', r.event_title, 'date', v_datestr,
      'collective', r.collective_name, 'users', r.n, 'title', v_title, 'body', v_body
    );

    IF NOT p_dry_run THEN
      IF svc_key IS NULL THEN
        SELECT decrypted_secret INTO svc_key
        FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
      END IF;

      -- Push (send-push gates on the new_event_in_collective toggle + quiet
      -- hours, fans per device token, prunes dead tokens).
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
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    -- In-app bell for every target (reach beyond push), per-user copy.
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT t.user_id, 'new_event_in_collective',
           t.collective_name || ' event next week 🌱',
           t.event_title || ' on ' ||
             to_char(t.event_date AT TIME ZONE 'UTC', 'FMDy FMDD FMMon') ||
             '. Tap for details.',
           jsonb_build_object('event_id', t.event_id::text,
                              'route', '/events/' || t.event_id::text)
    FROM _cei_targets t;

    -- Ledger (idempotency + new-member source of truth), per-user collective.
    INSERT INTO public.collective_event_invites_sent
      (event_id, collective_id, user_id, channel)
    SELECT t.event_id, t.collective_id, t.user_id, 'push+inapp'
    FROM _cei_targets t
    ON CONFLICT (event_id, user_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'groups',  v_groups,
    'targets', v_targets,
    'sent',    CASE WHEN p_dry_run THEN 0 ELSE v_targets END,
    'plan',    v_plan
  );
END;
$$;

-- --- Cron wrapper --------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_collective_event_invite()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.collective_event_invite_run(false);
END;
$$;

REVOKE ALL ON FUNCTION public.collective_event_invite_targets(uuid[])          FROM public;
REVOKE ALL ON FUNCTION public.collective_event_invite_run(boolean, uuid[])     FROM public;
REVOKE ALL ON FUNCTION public.cron_collective_event_invite()                   FROM public;
GRANT EXECUTE ON FUNCTION public.collective_event_invite_targets(uuid[])        TO service_role;
GRANT EXECUTE ON FUNCTION public.collective_event_invite_run(boolean, uuid[])   TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_collective_event_invite()                 TO service_role;

COMMENT ON FUNCTION public.collective_event_invite_run(boolean, uuid[]) IS
  'Daily sweep: invites every active member of a collective (and its accepted '
  'co-host collectives) to that collective''s events, once, ~7 days before each '
  'event. Push + in-app bell, reusing the new_event_in_collective type. '
  'Idempotent and new-member-safe via the (event_id,user_id) ledger. dry_run '
  'true returns the audience+copy plan without sending; p_event_ids scopes the '
  'run to specific events. Origin Tate 2026-08-19.';
