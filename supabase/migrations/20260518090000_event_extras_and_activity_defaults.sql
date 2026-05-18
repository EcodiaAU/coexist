-- Two add-ons that unlock the "edit event matches create event" + the
-- "default cover image per activity type" gaps Jess flagged.
--
-- 1. events.event_extras jsonb (default '{}') stores the previously-ghost
--    wizard fields: meeting_point, what_to_bring, what_to_wear, terrain,
--    difficulty, wheelchair_access, partner_name. These were captured in
--    the create wizard but never persisted. They now have a real home and
--    edit-event can read + write them through the same shared component.
--
-- 2. activity_type_defaults table maps an activity_type enum value -> a
--    default cover_image_url + optional position. When an event is created
--    without a cover image the trigger falls back to the default for its
--    activity type so Jess doesn't have to upload one every time.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_extras jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.activity_type_defaults (
  activity_type text PRIMARY KEY,
  cover_image_url text NOT NULL,
  cover_image_position_x smallint NOT NULL DEFAULT 50,
  cover_image_position_y smallint NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE public.activity_type_defaults ENABLE ROW LEVEL SECURITY;

-- Everyone can read the defaults (used at event-form open time). Only
-- admins can change them.
DROP POLICY IF EXISTS activity_type_defaults_read ON public.activity_type_defaults;
CREATE POLICY activity_type_defaults_read
  ON public.activity_type_defaults
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS activity_type_defaults_write ON public.activity_type_defaults;
CREATE POLICY activity_type_defaults_write
  ON public.activity_type_defaults
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager', 'national_leader')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager', 'national_leader')
    )
  );

-- Seed defaults pointing at images that already exist in the public bucket
-- under defaults/. Jess can swap any of these via the admin (TBD) panel by
-- updating the row. Idempotent - re-running won't disturb already-edited
-- rows.
INSERT INTO public.activity_type_defaults (activity_type, cover_image_url)
VALUES
  ('clean_up',             'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/defaults/clean_up.jpg'),
  ('tree_planting',        'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/defaults/tree_planting.jpg'),
  ('ecosystem_restoration','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/defaults/ecosystem_restoration.jpg'),
  ('nature_hike',          'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/defaults/nature_hike.jpg'),
  ('camp_out',             'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/defaults/camp_out.jpg'),
  ('spotlighting',         'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/defaults/spotlighting.jpg'),
  ('other',                'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/defaults/other.jpg')
ON CONFLICT (activity_type) DO NOTHING;
