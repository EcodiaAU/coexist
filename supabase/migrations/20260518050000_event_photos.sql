-- ============================================================================
-- Event photos: post-event shared album per event
--
-- Attendees of an event can upload photos that anyone in the event's
-- collective can view. The flow:
--   1. Event ends.
--   2. ~1h later, a push fires inviting attendees to share photos.
--   3. Photos appear as a gallery section in the event detail page + a
--      pinned/auto-message in the collective chat with a "Open album" CTA.
--   4. Album persists indefinitely so the memory stays accessible.
--
-- Backend (admin) view filters by collective, day period, date, event type,
-- and "events a given user attended" by joining event_photos -> events ->
-- event_registrations.
-- ============================================================================

-- Storage bucket setup is handled out-of-band (Supabase Studio): a public
-- bucket called 'event-photos' with read access enforced via the RLS on this
-- table. We use signed urls / public bucket as appropriate.

CREATE TABLE IF NOT EXISTS public.event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  thumbnail_path text,
  caption text,
  width int,
  height int,
  bytes int,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_event_photos_event ON public.event_photos(event_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_photos_uploader ON public.event_photos(uploaded_by) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_photos_created ON public.event_photos(created_at DESC) WHERE archived_at IS NULL;

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

-- SELECT: any active member of the event's collective can view the album.
-- Admins / staff see everything.
CREATE POLICY event_photos_select ON public.event_photos
  FOR SELECT
  TO authenticated
  USING (
    is_admin_or_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_photos.event_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- INSERT: the uploader must be a confirmed attendee of the event OR a
-- collective leader/co-leader/assist_leader for that event's collective.
-- (We also accept profile.role admin/super_admin via is_admin_or_staff.)
CREATE POLICY event_photos_insert ON public.event_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      is_admin_or_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.event_registrations er
        WHERE er.event_id = event_photos.event_id
          AND er.user_id = auth.uid()
          AND er.status = 'attended'
      )
      OR EXISTS (
        SELECT 1 FROM public.events e
        JOIN public.collective_members cm ON cm.collective_id = e.collective_id
        WHERE e.id = event_photos.event_id
          AND cm.user_id = auth.uid()
          AND cm.status = 'active'
          AND cm.role IN ('leader', 'co_leader', 'assist_leader')
      )
    )
  );

-- UPDATE / DELETE: uploader OR admin OR event collective leader.
CREATE POLICY event_photos_modify ON public.event_photos
  FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR is_admin_or_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_photos.event_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
        AND cm.role IN ('leader', 'co_leader')
    )
  )
  WITH CHECK (true);

CREATE POLICY event_photos_delete ON public.event_photos
  FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR is_admin_or_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_photos.event_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
        AND cm.role IN ('leader', 'co_leader')
    )
  );

-- Admin-only view that joins photo + event + collective + uploader for the
-- backend gallery browser. Lets admins filter by collective_id, date range,
-- activity_type, uploader user_id, and an "events a user attended" axis via
-- the linked event registrations.
CREATE OR REPLACE VIEW public.admin_event_photos_view
  WITH (security_invoker = true)
  AS
SELECT
  ep.id,
  ep.event_id,
  ep.uploaded_by,
  ep.storage_path,
  ep.thumbnail_path,
  ep.caption,
  ep.width,
  ep.height,
  ep.bytes,
  ep.created_at,
  ep.archived_at,
  e.title          AS event_title,
  e.date_start     AS event_date_start,
  e.date_end       AS event_date_end,
  e.activity_type  AS event_activity_type,
  e.collective_id  AS collective_id,
  c.name           AS collective_name,
  c.state          AS collective_state,
  c.region         AS collective_region,
  p.display_name   AS uploader_display_name,
  p.avatar_url     AS uploader_avatar_url
FROM public.event_photos ep
JOIN public.events e ON e.id = ep.event_id
JOIN public.collectives c ON c.id = e.collective_id
JOIN public.profiles p ON p.id = ep.uploaded_by
WHERE ep.archived_at IS NULL;

GRANT SELECT ON public.admin_event_photos_view TO authenticated;

-- Helper RPC for the "photos from events user X attended" axis. Returns
-- photo rows from events where the given user has a confirmed 'attended'
-- registration. Admin-only.
CREATE OR REPLACE FUNCTION public.admin_photos_by_attendee(
  p_user_id uuid,
  p_limit int DEFAULT 200
)
RETURNS SETOF public.admin_event_photos_view AS $$
BEGIN
  IF NOT is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.*
    FROM public.admin_event_photos_view v
    JOIN public.event_registrations er
      ON er.event_id = v.event_id
     AND er.user_id = p_user_id
     AND er.status = 'attended'
    ORDER BY v.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
