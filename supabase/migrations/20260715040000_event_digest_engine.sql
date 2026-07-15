-- =====================================================================
-- Weekly email digest: the email twin of the push re-engagement engine.
-- =====================================================================
-- Origin: Tate 2026-07-15 "move onto the email digest ... whatever else we
-- can do that wont overload the users".
--
-- Reaches the ~48% of members with no push token (and any lapsed member),
-- with a calm, opt-in, unsubscribe-respecting email pointing at the next
-- event in their collective. Reuses the send-email edge function (Resend,
-- marketing_opt_in gate, per-recipient one-click unsubscribe) with the new
-- `upcoming_in_collective` marketing template, and the recipient_next_events
-- selector. Mirrors event_reengagement_run's shape and dry-run contract.
--
-- COORDINATION so users are never overloaded across channels:
--   * audience is past attendees lapsed 14-120 days (excludes the fresh
--     post-event window the push already owns, and the truly-ancient),
--   * excludes anyone registered for an upcoming event (they get reminders),
--   * excludes anyone the PUSH engine nudged in the last 7 days (no member
--     gets both a push and an email in the same week),
--   * per-user cap of one digest per 14 days,
--   * respects marketing_opt_in AND the new_event_in_collective toggle
--     (send-email gates on both once the template is deployed).
--
-- The send-email deploy (the `upcoming_in_collective` template) must land
-- before event_digest_run(false) can deliver; dry-run works without it.
-- Cron is intentionally NOT scheduled here (weekly go-live is a separate
-- step): SELECT cron.schedule('event-digest','23 23 * * 3',
--   $$SELECT public.event_digest_run(false)$$);  -- Wed 09:23 AEST weekly
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.email_digest_sent (
  id       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
  sent_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_digest_user_sent
  ON public.email_digest_sent(user_id, sent_at DESC);
ALTER TABLE public.email_digest_sent ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.email_digest_targets()
RETURNS TABLE (
  user_id uuid, email text, name text, event_id uuid, event_title text,
  event_date timestamptz, event_address text, collective_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH checkins AS (
    SELECT r.user_id, COALESCE(e.date_end, e.date_start) AS ended
    FROM event_registrations r JOIN events e ON e.id = r.event_id
    WHERE r.status = 'attended' OR r.checked_in_at IS NOT NULL
  ),
  last_seen AS (SELECT user_id, MAX(ended) AS last_att FROM checkins GROUP BY user_id),
  future_reg AS (
    SELECT DISTINCT r.user_id FROM event_registrations r JOIN events e ON e.id = r.event_id
    WHERE e.date_start > now() AND r.status IN ('registered','attended','invited')
  ),
  elig AS (
    SELECT ls.user_id, p.email,
           COALESCE(NULLIF(p.first_name,''), NULLIF(split_part(p.email,'@',1),''), 'there') AS name
    FROM last_seen ls JOIN profiles p ON p.id = ls.user_id
    WHERE ls.last_att BETWEEN now() - interval '120 days' AND now() - interval '14 days'
      AND COALESCE(p.marketing_opt_in, false)
      AND COALESCE(p.email,'') <> ''
      AND p.deleted_at IS NULL
      AND COALESCE(p.is_suspended, false) = false
      AND ls.user_id NOT IN (SELECT user_id FROM future_reg)
      AND NOT EXISTS (SELECT 1 FROM reengagement_nudges_sent s
                      WHERE s.user_id = ls.user_id AND s.sent_at > now() - interval '7 days')
      AND NOT EXISTS (SELECT 1 FROM email_digest_sent d
                      WHERE d.user_id = ls.user_id AND d.sent_at > now() - interval '14 days')
  )
  SELECT e.user_id, e.email, e.name, ne.event_id, ne.title, ne.date_start, ne.address, ne.collective_name
  FROM elig e
  CROSS JOIN LATERAL (SELECT * FROM public.recipient_next_events(ARRAY[e.user_id]) LIMIT 1) ne
  WHERE ne.event_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM email_digest_sent d2
                    WHERE d2.user_id = e.user_id AND d2.event_id = ne.event_id);
$$;

CREATE OR REPLACE FUNCTION public.event_digest_run(p_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  svc_key text; email_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/send-email';
  r record; v_datestr text; v_n int := 0; v_sample jsonb := '[]'::jsonb; v_recipients jsonb := '[]'::jsonb;
BEGIN
  -- Build ALL recipients into one payload and make a SINGLE send-email call
  -- with a `recipients[]` array. send-email sends them via Resend's
  -- /emails/batch endpoint (up to 100 per request), so the whole digest costs
  -- ceil(N/100) Resend requests. A per-recipient fan-out (91 net.http_post ->
  -- 91 Resend calls) blows straight through Resend's 10 req/s limit (verified:
  -- 80 of 91 returned 429). pg_net enqueue pacing does NOT help because pg_net
  -- drains its queue in bursts independent of enqueue timing.
  FOR r IN SELECT * FROM public.email_digest_targets() LOOP
    v_n := v_n + 1;
    v_datestr := to_char(r.event_date AT TIME ZONE 'UTC', 'FMDay FMDD FMMonth');
    IF v_n <= 5 THEN
      v_sample := v_sample || jsonb_build_object('email', r.email, 'name', r.name,
        'collective', r.collective_name, 'event', r.event_title, 'date', v_datestr);
    END IF;
    v_recipients := v_recipients || jsonb_build_object(
      'userId', r.user_id::text, 'to', r.email,
      'data', jsonb_build_object('name', r.name, 'collective_name', r.collective_name,
        'event_title', r.event_title, 'event_date', v_datestr,
        'event_location', COALESCE(r.event_address,''),
        'event_url', 'https://app.coexistaus.org/events/' || r.event_id::text));
    IF NOT p_dry_run THEN
      INSERT INTO public.email_digest_sent (user_id, event_id) VALUES (r.user_id, r.event_id);
    END IF;
  END LOOP;
  IF NOT p_dry_run AND v_n > 0 THEN
    SELECT decrypted_secret INTO svc_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    PERFORM net.http_post(url := email_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || svc_key),
      body := jsonb_build_object('type','upcoming_in_collective','recipients', v_recipients));
  END IF;
  RETURN jsonb_build_object('dry_run', p_dry_run, 'targets', v_n,
    'sent', CASE WHEN p_dry_run THEN 0 ELSE v_n END, 'sample', v_sample);
END;
$$;

REVOKE ALL ON FUNCTION public.email_digest_targets()      FROM public;
REVOKE ALL ON FUNCTION public.event_digest_run(boolean)   FROM public;
GRANT EXECUTE ON FUNCTION public.email_digest_targets()    TO service_role;
GRANT EXECUTE ON FUNCTION public.event_digest_run(boolean) TO service_role;

COMMENT ON FUNCTION public.event_digest_run(boolean) IS
  'Weekly email re-engagement digest (email twin of event_reengagement_run). '
  'Coordinated to never double-hit a member the push engine nudged in the '
  'last 7 days. dry_run true returns audience+sample without sending. '
  'Origin Tate 2026-07-15.';
