-- ============================================================
-- 056: Rename global_announcements → updates, announcement_reads → update_reads
-- Aligns DB naming with what the feature is actually called in the UI
-- ============================================================

-- -------------------------------------------------------
-- 1. Rename tables
-- -------------------------------------------------------
ALTER TABLE global_announcements RENAME TO updates;
ALTER TABLE announcement_reads RENAME TO update_reads;

-- -------------------------------------------------------
-- 2. Rename the FK column: announcement_id → update_id
-- -------------------------------------------------------
ALTER TABLE update_reads RENAME COLUMN announcement_id TO update_id;

-- -------------------------------------------------------
-- 3. Rename enums
-- -------------------------------------------------------
ALTER TYPE announcement_priority RENAME TO update_priority;
ALTER TYPE announcement_target RENAME TO update_target;

-- -------------------------------------------------------
-- 4. Rename indexes
-- -------------------------------------------------------
ALTER INDEX idx_announcements_created RENAME TO idx_updates_created;
ALTER INDEX idx_announcements_target RENAME TO idx_updates_target;
ALTER INDEX idx_announcements_pinned RENAME TO idx_updates_pinned;
ALTER INDEX idx_announcement_reads_announcement RENAME TO idx_update_reads_update;
ALTER INDEX idx_announcement_reads_user RENAME TO idx_update_reads_user;

-- -------------------------------------------------------
-- 5. Drop and recreate RLS policies with new names
-- -------------------------------------------------------

-- updates (was global_announcements)
DROP POLICY IF EXISTS "announcements_select_authenticated" ON updates;
DROP POLICY IF EXISTS "announcements_manage_staff" ON updates;

CREATE POLICY "updates_select_authenticated"
  ON updates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "updates_manage_staff"
  ON updates FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- update_reads (was announcement_reads)
DROP POLICY IF EXISTS "announcement_reads_own" ON update_reads;

CREATE POLICY "update_reads_own"
  ON update_reads FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------
-- 6. Drop and recreate storage policies with new names
--    (bucket stays as 'announcements' — renaming buckets
--     requires delete+recreate which would lose files)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "announcements: admin insert" ON storage.objects;
DROP POLICY IF EXISTS "announcements: admin update" ON storage.objects;
DROP POLICY IF EXISTS "announcements: admin delete" ON storage.objects;

CREATE POLICY "updates: admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'announcements'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('national_admin', 'super_admin')
    )
  );

CREATE POLICY "updates: admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'announcements'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('national_admin', 'super_admin')
    )
  );

CREATE POLICY "updates: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'announcements'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('national_admin', 'super_admin')
    )
  );

-- -------------------------------------------------------
-- 7. Update the admin stats RPC to use new table name
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_system_stats()
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT jsonb_build_object(
    'profiles',            (SELECT COUNT(*) FROM profiles),
    'collectives',         (SELECT COUNT(*) FROM collectives),
    'collective_members',  (SELECT COUNT(*) FROM collective_members),
    'events',              (SELECT COUNT(*) FROM events),
    'event_registrations', (SELECT COUNT(*) FROM event_registrations),
    'event_impact',        (SELECT COUNT(*) FROM event_impact),
    'chat_messages',       (SELECT COUNT(*) FROM chat_messages),
    'notifications',       (SELECT COUNT(*) FROM notifications),
    'donations',           (SELECT COUNT(*) FROM donations),
    'recurring_donations', (SELECT COUNT(*) FROM recurring_donations),
    'merch_orders',        (SELECT COUNT(*) FROM merch_orders),
    'surveys',             (SELECT COUNT(*) FROM surveys),
    'survey_responses',    (SELECT COUNT(*) FROM survey_responses),
    'content_reports',     (SELECT COUNT(*) FROM content_reports),
    'audit_log',           (SELECT COUNT(*) FROM audit_log),
    'push_tokens',         (SELECT COUNT(*) FROM push_tokens),
    'updates',             (SELECT COUNT(*) FROM updates),
    'impact_species',      (SELECT COUNT(*) FROM impact_species),
    'impact_areas',        (SELECT COUNT(*) FROM impact_areas),
    'organisations',       (SELECT COUNT(*) FROM organisations),
    'challenges',          (SELECT COUNT(*) FROM challenges),
    'partner_offers',      (SELECT COUNT(*) FROM partner_offers),
    'invites',             (SELECT COUNT(*) FROM invites),
    'merch_products',      (SELECT COUNT(*) FROM merch_products),
    'promo_codes',         (SELECT COUNT(*) FROM promo_codes),
    'event_series',        (SELECT COUNT(*) FROM event_series)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- -------------------------------------------------------
-- 9. Unique constraint on update_reads was auto-renamed by
--    Postgres when the table was renamed, but the column
--    rename means we should recreate it cleanly.
-- -------------------------------------------------------
-- Drop the old unique constraint (Postgres auto-renamed it
-- to announcement_reads_announcement_id_user_id_key)
ALTER TABLE update_reads
  DROP CONSTRAINT IF EXISTS announcement_reads_announcement_id_user_id_key;

ALTER TABLE update_reads
  ADD CONSTRAINT update_reads_update_id_user_id_key UNIQUE (update_id, user_id);

-- -------------------------------------------------------
-- 10. Rename FK constraints to match new table names
-- -------------------------------------------------------
ALTER TABLE updates
  RENAME CONSTRAINT global_announcements_pkey TO updates_pkey;
ALTER TABLE updates
  RENAME CONSTRAINT global_announcements_author_id_fkey TO updates_author_id_fkey;
ALTER TABLE updates
  RENAME CONSTRAINT global_announcements_target_collective_id_fkey TO updates_target_collective_id_fkey;

ALTER TABLE update_reads
  RENAME CONSTRAINT announcement_reads_pkey TO update_reads_pkey;
ALTER TABLE update_reads
  RENAME CONSTRAINT announcement_reads_announcement_id_fkey TO update_reads_update_id_fkey;
ALTER TABLE update_reads
  RENAME CONSTRAINT announcement_reads_user_id_fkey TO update_reads_user_id_fkey;

-- -------------------------------------------------------
-- 11. Rename the updated_at trigger
-- -------------------------------------------------------
ALTER TRIGGER set_updated_at ON updates RENAME TO set_updated_at;
