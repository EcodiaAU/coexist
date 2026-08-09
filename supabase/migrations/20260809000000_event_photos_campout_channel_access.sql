-- event_photos: let campout group-chat members view + upload to the album.
--
-- Campouts are national events (attendees come from many collectives) with a
-- dedicated per-campout chat channel (chat_channels.event_id -> events.id,
-- chat_channel_members). The prior policies only granted view/upload to active
-- members of the event's OWN collective (Brisbane for Myall Park) plus people
-- explicitly marked `attended`. That locked out crew from other states and
-- everyone whose attendance was never marked - so "everyone can add their
-- photos" from the campout group chat's Open-album card failed for them.
--
-- Fix: any member of a chat channel linked to the event can view + upload to
-- that event's album. Scoped to channel members only (not the public); the
-- channel membership is the verified crew list.
--
-- Origin: Tate 2026-08-09, "send it to the myall park groupchat ... so everyone
-- can add their photos".

ALTER POLICY event_photos_select ON public.event_photos
USING (
  is_admin_or_staff(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM events e
    JOIN collective_members cm ON cm.collective_id = e.collective_id
    WHERE e.id = event_photos.event_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM chat_channels ch
    JOIN chat_channel_members ccm ON ccm.channel_id = ch.id
    WHERE ch.event_id = event_photos.event_id
      AND ccm.user_id = auth.uid()
  )
);

ALTER POLICY event_photos_insert ON public.event_photos
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    is_admin_or_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM event_registrations er
      WHERE er.event_id = event_photos.event_id
        AND er.user_id = auth.uid()
        AND er.status = 'attended'::registration_status
    )
    OR EXISTS (
      SELECT 1
      FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_photos.event_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
        AND cm.role = ANY (ARRAY['leader'::collective_role, 'co_leader'::collective_role, 'assist_leader'::collective_role])
    )
    OR EXISTS (
      SELECT 1
      FROM chat_channels ch
      JOIN chat_channel_members ccm ON ccm.channel_id = ch.id
      WHERE ch.event_id = event_photos.event_id
        AND ccm.user_id = auth.uid()
    )
  )
);
