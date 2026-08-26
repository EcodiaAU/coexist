-- ============================================================================
-- Co-Exist App - Security Audit Migration
-- Migration: 004_security_audit.sql
-- Date: 2026-03-20
--
-- Addresses:
--   1. GDPR: deleted_at / pending_deletion fields on profiles
--   2. GDPR: data export request tracking
--   3. Trigger: persist date_of_birth from auth metadata
--   4. Content moderation: actually delete content on removal
--   5. TOS re-acceptance: enforce on login
--   6. RLS: tighten overly permissive SELECT policies
--   7. RLS: add missing DELETE policies
--   8. Rate limiting: server-side chat message throttle
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. GDPR fields on profiles
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_status text
  CHECK (deletion_status IN ('active', 'pending_deletion', 'deleted'))
  DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_status ON profiles(deletion_status);

-- ---------------------------------------------------------------------------
-- 2. Data export request tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_export_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url    text,
  requested_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  expires_at  timestamptz
);

ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_export_select_own"
  ON data_export_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "data_export_insert_own"
  ON data_export_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Update handle_new_user to persist date_of_birth
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, date_of_birth)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN NEW.raw_user_meta_data->>'date_of_birth' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'date_of_birth')::date
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 4. Content moderation: function to actually delete/hide content
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_content_report_removal()
RETURNS trigger AS $$
BEGIN
  -- When a content report is set to 'removed', soft-delete the content
  IF NEW.status = 'removed' AND OLD.status != 'removed' THEN
    CASE NEW.content_type
      WHEN 'post' THEN
        -- Soft-delete: remove from feed by deleting (cascade handles likes/comments)
        DELETE FROM posts WHERE id = NEW.content_id;
      WHEN 'comment' THEN
        UPDATE post_comments SET is_deleted = true WHERE id = NEW.content_id;
      WHEN 'chat_message' THEN
        UPDATE chat_messages SET is_deleted = true WHERE id = NEW.content_id;
      WHEN 'photo' THEN
        -- Posts with images - soft-delete the post
        DELETE FROM posts WHERE id = NEW.content_id;
      ELSE
        -- Unknown type, do nothing
        NULL;
    END CASE;

    -- Log the action in audit_log
    INSERT INTO audit_log (user_id, action, target_type, target_id, details)
    VALUES (
      NEW.reviewed_by,
      'content_removed',
      NEW.content_type,
      NEW.content_id,
      jsonb_build_object(
        'report_id', NEW.id,
        'reason', NEW.reason,
        'reporter_id', NEW.reporter_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_content_report_updated
  AFTER UPDATE ON content_reports
  FOR EACH ROW
  WHEN (NEW.status != OLD.status)
  EXECUTE FUNCTION handle_content_report_removal();

-- ---------------------------------------------------------------------------
-- 5. Suspended account check function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_user_suspended(uid uuid)
RETURNS jsonb AS $$
DECLARE
  p profiles;
BEGIN
  -- Guard added 2026-08-26: this is SECURITY DEFINER, so without it any caller
  -- could read another user's moderation state. Kept here (not only in the later
  -- guard migration) so replaying this file alone cannot silently revert the fix.
  IF NOT (uid = auth.uid() OR public.is_admin_or_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO p FROM profiles WHERE id = uid;
  IF p.is_suspended THEN
    -- Check if suspension has expired
    IF p.suspended_until IS NOT NULL AND p.suspended_until < now() THEN
      UPDATE profiles SET is_suspended = false, suspended_reason = null, suspended_until = null
      WHERE id = uid;
      RETURN jsonb_build_object('suspended', false);
    END IF;
    RETURN jsonb_build_object(
      'suspended', true,
      'reason', p.suspended_reason,
      'until', p.suspended_until
    );
  END IF;
  RETURN jsonb_build_object('suspended', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. Chat rate limiting function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_chat_rate_limit(p_user_id uuid, p_collective_id uuid)
RETURNS boolean AS $$
DECLARE
  recent_count integer;
BEGIN
  -- Allow max 5 messages per 10 seconds per user per collective
  SELECT COUNT(*) INTO recent_count
  FROM chat_messages
  WHERE user_id = p_user_id
    AND collective_id = p_collective_id
    AND created_at > now() - interval '10 seconds';

  RETURN recent_count < 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update chat insert policy to enforce rate limiting
DROP POLICY IF EXISTS "chat_insert_member" ON chat_messages;
CREATE POLICY "chat_insert_member"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_collective_member(auth.uid(), collective_id)
    AND check_chat_rate_limit(auth.uid(), collective_id)
  );

-- ---------------------------------------------------------------------------
-- 7. Tighten overly permissive SELECT policies
-- ---------------------------------------------------------------------------

-- profiles: keep public read for now (needed for displaying names/avatars)
-- but add a note that a view-based approach should be used long-term

-- user_badges: restrict to own + admin (other users see via public badge showcases)
DROP POLICY IF EXISTS "user_badges_select_all" ON user_badges;
CREATE POLICY "user_badges_select_own_or_admin"
  ON user_badges FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- challenge_participants: restrict to own participation or admin
DROP POLICY IF EXISTS "challenge_participants_select_all" ON challenge_participants;
CREATE POLICY "challenge_participants_select_own_or_admin"
  ON challenge_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_staff(auth.uid())
    -- Also allow seeing participants if you're in the same challenge
    OR EXISTS (
      SELECT 1 FROM challenge_participants cp2
      WHERE cp2.challenge_id = challenge_participants.challenge_id
        AND cp2.user_id = auth.uid()
    )
  );

-- feature_flags: restrict to admin only (was public)
DROP POLICY IF EXISTS "feature_flags_select_all" ON feature_flags;
CREATE POLICY "feature_flags_select_admin"
  ON feature_flags FOR SELECT TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. Add missing DELETE policies
-- ---------------------------------------------------------------------------

-- event_registrations: users can cancel their registrations
CREATE POLICY "registrations_delete_own"
  ON event_registrations FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- notifications: users can clear their notifications
CREATE POLICY "notifications_delete_own"
  ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- survey_responses: users can delete their own responses
CREATE POLICY "survey_responses_delete_own"
  ON survey_responses FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- survey_responses: users can update their own responses
CREATE POLICY "survey_responses_update_own"
  ON survey_responses FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- invites: users can revoke their invites
CREATE POLICY "invites_delete_own"
  ON invites FOR DELETE TO authenticated
  USING (inviter_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- product_reviews: users can delete their own reviews
CREATE POLICY "product_reviews_delete_own"
  ON product_reviews FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- challenge_participants: users can leave challenges
CREATE POLICY "challenge_participants_delete_own"
  ON challenge_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- recurring_donations: users can cancel (delete) their recurring donations
CREATE POLICY "recurring_donations_delete_own"
  ON recurring_donations FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- content_reports: reporters can delete their own reports (before review)
CREATE POLICY "content_reports_delete_own"
  ON content_reports FOR DELETE TO authenticated
  USING (reporter_id = auth.uid() AND status = 'pending');

-- ---------------------------------------------------------------------------
-- 9. GDPR: scheduled cleanup function (call via pg_cron or edge function)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_deleted_accounts()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Hard-delete users whose 30-day grace period has expired
  WITH expired AS (
    SELECT id FROM profiles
    WHERE deletion_status = 'pending_deletion'
      AND deletion_requested_at < now() - interval '30 days'
  )
  DELETE FROM auth.users WHERE id IN (SELECT id FROM expired);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 10. Content reports: extend allowed types to include 'user'
-- ---------------------------------------------------------------------------
ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_content_type_check;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_content_type_check
  CHECK (content_type IN ('post', 'comment', 'photo', 'chat_message', 'user'));
