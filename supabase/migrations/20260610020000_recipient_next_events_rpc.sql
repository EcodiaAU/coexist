-- ============================================================
-- 20260610020000: recipient_next_events RPC
--
-- Returns each user's earliest upcoming published event across all of
-- their active collective memberships. Built for the
-- send-campaign Edge Function so a "hype the next event" blast can
-- substitute {{next_event_title}}, {{next_event_date}},
-- {{next_event_collective}}, etc. per recipient in one round trip.
--
-- Floating-local: events.date_start is wall-clock-as-UTC, so we
-- compare against now() at UTC. Frontend / send-campaign formats it
-- back without a TZ shift.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recipient_next_events(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  event_id uuid,
  title text,
  date_start timestamptz,
  address text,
  collective_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (cm.user_id)
    cm.user_id,
    e.id AS event_id,
    e.title,
    e.date_start,
    e.address,
    c.name AS collective_name
  FROM collective_members cm
  JOIN events e ON e.collective_id = cm.collective_id
  JOIN collectives c ON c.id = e.collective_id
  WHERE cm.user_id = ANY(p_user_ids)
    AND cm.status = 'active'
    AND e.status = 'published'
    AND e.date_start > now()
  ORDER BY cm.user_id, e.date_start ASC
$$;

GRANT EXECUTE ON FUNCTION public.recipient_next_events(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.recipient_next_events(uuid[]) IS
  'Per-user earliest upcoming published event across their active '
  'collective memberships. Used by send-campaign for {{next_event_*}} '
  'per-recipient substitution.';
