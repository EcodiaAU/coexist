-- Storage bucket creation, file constraints, and RLS policies
-- Consolidates all bucket setup previously documented in DEPLOY.md

/* ================================================================== */
/*  1. Create buckets                                                  */
/* ================================================================== */

-- Public buckets (serve files without auth token)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',           'avatars',           true,  2 * 1024 * 1024,   -- 2 MB
    ARRAY['image/jpeg','image/png','image/webp','image/gif']),

  ('event-images',      'event-images',      true,  5 * 1024 * 1024,   -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp']),

  ('post-images',       'post-images',       true,  5 * 1024 * 1024,   -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp','image/gif']),

  ('collective-images', 'collective-images', true,  5 * 1024 * 1024,   -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp']),

  ('badges',            'badges',            true,  1 * 1024 * 1024,   -- 1 MB
    ARRAY['image/png','image/svg+xml','image/webp']),

  ('merch-images',      'merch-images',      true,  5 * 1024 * 1024,   -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp']),

  ('impact-evidence',   'impact-evidence',   true,  10 * 1024 * 1024,  -- 10 MB
    ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),

  ('announcements',     'announcements',     true,  5 * 1024 * 1024,   -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp'])
;

-- Private buckets (require auth token to read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('chat-images',  'chat-images',  false, 5 * 1024 * 1024,    -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp','image/gif']),

  ('chat-voice',   'chat-voice',   false, 10 * 1024 * 1024,   -- 10 MB
    ARRAY['audio/aac','audio/mp4','audio/mpeg','audio/ogg','audio/webm']),

  ('chat-video',   'chat-video',   false, 50 * 1024 * 1024,   -- 50 MB
    ARRAY['video/mp4','video/webm','video/quicktime'])
;


/* ================================================================== */
/*  2. RLS policies - public buckets                                   */
/* ================================================================== */
-- Pattern: anyone can SELECT; authenticated users can INSERT to their
-- own folder (uid prefix); owners can UPDATE / DELETE their own files.

-- Helper: owner check reused across buckets. Owner is determined by
-- the first folder segment matching auth.uid().

-- ---- avatars -------------------------------------------------------
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: auth upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- event-images --------------------------------------------------
CREATE POLICY "event-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

CREATE POLICY "event-images: auth upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "event-images: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "event-images: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- post-images ---------------------------------------------------
CREATE POLICY "post-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

CREATE POLICY "post-images: auth upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "post-images: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "post-images: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- collective-images ---------------------------------------------
CREATE POLICY "collective-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'collective-images');

CREATE POLICY "collective-images: auth upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'collective-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "collective-images: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'collective-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "collective-images: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'collective-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- badges --------------------------------------------------------
CREATE POLICY "badges: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'badges');

-- Badges are admin-managed; no user INSERT/UPDATE/DELETE policies.
-- Service role bypasses RLS for admin uploads.

-- ---- merch-images --------------------------------------------------
CREATE POLICY "merch-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'merch-images');

-- Merch images are admin-managed; no user INSERT/UPDATE/DELETE policies.
-- Service role bypasses RLS for admin uploads.

-- ---- impact-evidence -----------------------------------------------
CREATE POLICY "impact-evidence: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'impact-evidence');

CREATE POLICY "impact-evidence: auth upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'impact-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "impact-evidence: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'impact-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "impact-evidence: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'impact-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- announcements -------------------------------------------------
CREATE POLICY "announcements: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'announcements');

-- Announcements are staff-managed; no user INSERT/UPDATE/DELETE policies.
-- Service role bypasses RLS for staff uploads.


/* ================================================================== */
/*  3. RLS policies - private (chat) buckets                           */
/* ================================================================== */
-- Chat media is scoped to collective members. Upload path convention:
--   {collective_id}/{user_id}/{timestamp}.{ext}
-- First folder = collective_id; checked against collective_members.

-- ---- chat-images ---------------------------------------------------
CREATE POLICY "chat-images: collective member read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.collective_id = (storage.foldername(name))[1]::uuid
    )
  );

CREATE POLICY "chat-images: member upload to collective folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.collective_id = (storage.foldername(name))[1]::uuid
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat-images: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ---- chat-voice ----------------------------------------------------
CREATE POLICY "chat-voice: collective member read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-voice'
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.collective_id = (storage.foldername(name))[1]::uuid
    )
  );

CREATE POLICY "chat-voice: member upload to collective folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-voice'
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.collective_id = (storage.foldername(name))[1]::uuid
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat-voice: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-voice'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ---- chat-video ----------------------------------------------------
CREATE POLICY "chat-video: collective member read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-video'
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.collective_id = (storage.foldername(name))[1]::uuid
    )
  );

CREATE POLICY "chat-video: member upload to collective folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-video'
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.collective_id = (storage.foldername(name))[1]::uuid
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat-video: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-video'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );


/* ================================================================== */
/*  4. Image transform presets (documentation / convention)            */
/* ================================================================== */
-- Supabase image transforms are configured at the project level in the
-- dashboard (Settings → Storage → Image Transformations → Enable).
-- They don't require SQL - transforms are applied via URL params at
-- request time:
--
--   /storage/v1/render/image/public/{bucket}/{path}?width=W&height=H&quality=Q
--
-- Standard sizes used in the app (see src/lib/image-utils.ts):
--
--   Thumbnail:  width=200,  height=200,  quality=80
--   Medium:     width=600,  height=600,  quality=80
--   Large:      width=1200, height=1200, quality=80
--
-- To enable: Supabase Dashboard → Settings → Storage → toggle
-- "Enable image transformations". No additional SQL is needed.
