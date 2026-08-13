-- =====================================================================
-- Weekly event digest: carry the event cover image into the email.
-- =====================================================================
-- Origin: 2026-08-13, alongside the email design-language rebuild. The
-- "What's on with <collective>" digest (send-email upcoming_in_collective)
-- now renders the real event cover photo full-bleed as the hero. This
-- threads cover_image_url + focal point from recipient_next_events (see
-- 20260813120000) through email_digest_targets() into the per-recipient
-- data object event_digest_run() posts to send-email.
--
-- CREATE OR REPLACE only. Audience selection, coordination gates, cap and
-- dry-run contract are unchanged from 20260715040000_event_digest_engine.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.email_digest_targets()
RETURNS TABLE (
  user_id uuid, email text, name text, event_id uuid, event_title text,
  event_date timestamptz, event_address text, collective_name text,
  event_image text, event_image_x smallint, event_image_y smallint
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
  SELECT e.user_id, e.email, e.name, ne.event_id, ne.title, ne.date_start, ne.address,
         ne.collective_name, ne.cover_image_url, ne.cover_image_position_x, ne.cover_image_position_y
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
  -- One send-email call with a recipients[] array -> Resend /emails/batch,
  -- ceil(N/100) requests. See 20260715040000 for the rate-limit rationale.
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
        'event_image', COALESCE(r.event_image,''),
        'event_image_x', COALESCE(r.event_image_x, 50),
        'event_image_y', COALESCE(r.event_image_y, 50),
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
