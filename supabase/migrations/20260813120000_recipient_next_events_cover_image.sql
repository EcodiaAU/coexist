-- =====================================================================
-- Extend recipient_next_events to also return the event cover image.
-- =====================================================================
-- Origin: 2026-08-13. Tom Groat (Goodreach) flagged that the automated
-- "What's on with your Co-Exist collective" touchpoint carried no
-- Co-Exist branding or design system. The email design language was
-- rebuilt to the app's full-bleed-image language, and the digest hero
-- now shows the real event cover photo. This selector feeds both the
-- send-campaign {{next_event_image}} var and the weekly event digest,
-- so it must return the cover image URL + focal position alongside the
-- existing fields.
--
-- events.cover_image_url / cover_image_position_x / _y already exist
-- (migrations 20260428050000 + earlier). Signature is otherwise
-- unchanged, so send-campaign keeps working during the deploy window.
-- =====================================================================

-- Changing the RETURNS TABLE column set requires a DROP first (Postgres will
-- not let CREATE OR REPLACE alter the return signature). CASCADE also drops
-- email_digest_targets(), the SQL-language function that calls this one in a
-- LATERAL (a hard dependency); the next migration (20260813120500) recreates
-- it. send-campaign calls this via RPC at runtime, so it carries no DB
-- dependency and is unaffected by the drop.
DROP FUNCTION IF EXISTS public.recipient_next_events(uuid[]) CASCADE;

CREATE FUNCTION public.recipient_next_events(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  event_id uuid,
  title text,
  date_start timestamptz,
  address text,
  collective_name text,
  cover_image_url text,
  cover_image_position_x smallint,
  cover_image_position_y smallint
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
    c.name AS collective_name,
    e.cover_image_url,
    e.cover_image_position_x,
    e.cover_image_position_y
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
  'collective memberships, with cover image + focal point. Used by '
  'send-campaign for {{next_event_*}} and by the weekly event digest '
  'so the email hero can render the real event photo full-bleed.';
