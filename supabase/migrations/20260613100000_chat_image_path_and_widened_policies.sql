-- chat-images: long-term signed-URL design landed 2026-06-13.
--
-- Three changes, all applied live on tjutlbzekfouwsiaplbr before this file
-- was authored (Management API + org PAT). This migration captures the
-- live state so a future db push / dump-restore reproduces it.
--
-- 1. chat_messages.image_path: storage path inside the private chat-images
--    bucket. The client persists the path here, not the URL. The renderer
--    resolves it via useSignedChatImage (1h TTL signed URLs, react-query
--    cached) so links never dead. image_url stays for legacy / external
--    links only.
--
-- 2. chat-images SELECT + INSERT policies widened to accept either
--    collective membership OR chat_channel membership against folder[1].
--    The original 0031 policies only accepted collective_id and used a
--    ::uuid cast that throws when folder[1] is not a valid UUID. The
--    1.9.5 live client uploaded to {user_id}/{ts}.jpg via
--    useImageUpload(buildStoragePath), which both failed the collective
--    EXISTS clause and threw the cast - the storage API surfaced that as
--    400 on every chat photo attach. The widened text-compare policies
--    + the new {context_id}/{user_id}/{ts}-{rand}.{ext} upload path
--    landing in 1.9.6 close the loop.
--
-- 3. chat-images UPDATE policy added: the upload path's x-upsert header
--    would have failed any collision via UPDATE under the original 3-policy
--    set. The new policy is owner-only (folder[2] = auth.uid()).
--
-- Bucket privacy stays as 0031 designed (public=false). chat-voice and
-- chat-video are untouched - no client surface uploads to them today.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS image_path text;

COMMENT ON COLUMN public.chat_messages.image_path IS
  'Storage path inside chat-images bucket (private). Render layer must call createSignedUrl on demand. Shape: {context_id}/{user_id}/{ts}-{rand}.{ext}. Replaces image_url for new chat photo uploads; image_url kept for back-compat / future external links.';

DROP POLICY IF EXISTS "chat-images: collective member read" ON storage.objects;
DROP POLICY IF EXISTS "chat-images: member upload to collective folder" ON storage.objects;
DROP POLICY IF EXISTS "chat-images: member read" ON storage.objects;
DROP POLICY IF EXISTS "chat-images: member upload" ON storage.objects;
DROP POLICY IF EXISTS "chat-images: owner update" ON storage.objects;
DROP POLICY IF EXISTS "chat-images: owner delete" ON storage.objects;

CREATE POLICY "chat-images: member read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images' AND (
      EXISTS (
        SELECT 1 FROM public.collective_members cm
        WHERE cm.user_id = auth.uid()
          AND cm.collective_id::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_channel_members ccm
        WHERE ccm.user_id = auth.uid()
          AND ccm.channel_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "chat-images: member upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND (
      EXISTS (
        SELECT 1 FROM public.collective_members cm
        WHERE cm.user_id = auth.uid()
          AND cm.collective_id::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_channel_members ccm
        WHERE ccm.user_id = auth.uid()
          AND ccm.channel_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "chat-images: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat-images: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
