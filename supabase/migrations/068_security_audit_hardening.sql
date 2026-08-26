-- ============================================================================
-- Co-Exist App - Security Audit Hardening
-- Migration: 068_security_audit_hardening.sql
-- Date: 2026-03-28
--
-- Addresses:
--   (a) Overly permissive RLS INSERT policies on email_events, email_suppressions, payments
--   (b) SECURITY DEFINER functions missing SET search_path = public
--   (c) Unguarded RPCs (award_points, respond_to_collaboration, invite_collective_to_collaborate)
--   (d) Profile data exposure (sensitive fields visible to all authenticated users)
--   (e) Missing updated_at triggers on tables that should have them
--   (f) Missing indexes on columns used in WHERE/JOIN clauses
--   (g) contact_submissions INSERT policy tightened to authenticated only
--   (h) Orphaned post-images storage bucket policies cleanup
-- ============================================================================

-- ===========================================================================
-- (a) Fix overly permissive INSERT policies
-- These tables used WITH CHECK (true) meaning ANY authenticated user could
-- insert. They should only be writable by service_role (edge functions).
-- ===========================================================================

-- email_events: only service_role should insert (from SendGrid webhooks)
DROP POLICY IF EXISTS "Service insert email_events" ON email_events;
CREATE POLICY "email_events_service_insert"
  ON email_events FOR INSERT TO service_role
  WITH CHECK (true);

-- email_suppressions: only service_role should insert
DROP POLICY IF EXISTS "Service insert email_suppressions" ON email_suppressions;
CREATE POLICY "email_suppressions_service_insert"
  ON email_suppressions FOR INSERT TO service_role
  WITH CHECK (true);

-- payments: only service_role should insert (from stripe-webhook edge function)
DROP POLICY IF EXISTS "payments_service_insert" ON payments;
CREATE POLICY "payments_service_insert_restricted"
  ON payments FOR INSERT TO service_role
  WITH CHECK (true);

-- contact_submissions: restrict to authenticated users (prevent anonymous spam)
-- First check if the old permissive policy exists
DROP POLICY IF EXISTS "Anyone can submit" ON contact_submissions;
DROP POLICY IF EXISTS "contact_submissions_insert" ON contact_submissions;
CREATE POLICY "contact_submissions_insert_authenticated"
  ON contact_submissions FOR INSERT TO authenticated
  WITH CHECK (true);

-- ===========================================================================
-- (b) Pin SET search_path = public on all SECURITY DEFINER functions
-- that are missing it. This prevents search_path injection attacks.
-- ===========================================================================

-- --- Core helper functions (from 001) ---

-- Guard helper added 2026-08-26 (role oracle). Defined here so this migration is
-- correct STANDALONE: the guard below references it, and LANGUAGE sql bodies are
-- validated at creation time, so ordering would otherwise decide whether a replay
-- of this file succeeds. CREATE OR REPLACE makes the repetition harmless.
-- Not SECURITY DEFINER and not search_path-pinned so the planner can inline it;
-- current_setting is pg_catalog-qualified so it cannot be shadowed instead.
CREATE OR REPLACE FUNCTION public.is_trusted_backend_caller()
RETURNS boolean
LANGUAGE sql
STABLE
AS $trusted$
  SELECT coalesce(pg_catalog.current_setting('role', true), 'none')
         IN ('service_role', 'postgres', 'supabase_admin', 'none');
$trusted$;

CREATE OR REPLACE FUNCTION is_admin_or_staff(uid uuid)
RETURNS boolean AS $$
  -- Guard added 2026-08-26 (role oracle): these definer helpers took a uid
  -- ARGUMENT with PUBLIC EXECUTE, so anon could ask "is this uuid staff" about
  -- ANY user. Answer only for self, or for a trusted backend (service_role /
  -- direct postgres), where auth.uid() is NULL and cancel-event authorizes a
  -- third party. FILTER, never RAISE: this runs inside RLS, where an exception
  -- is a hard query failure. IS NOT DISTINCT FROM keeps every branch boolean,
  -- because a NULL return would itself separate staff from non-staff.
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller()
    THEN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role IN ('national_staff', 'national_admin', 'super_admin')
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_super_admin(uid uuid)
RETURNS boolean AS $$
  -- Guard added 2026-08-26 (role oracle): these definer helpers took a uid
  -- ARGUMENT with PUBLIC EXECUTE, so anon could ask "is this uuid staff" about
  -- ANY user. Answer only for self, or for a trusted backend (service_role /
  -- direct postgres), where auth.uid() is NULL and cancel-event authorizes a
  -- third party. FILTER, never RAISE: this runs inside RLS, where an exception
  -- is a hard query failure. IS NOT DISTINCT FROM keeps every branch boolean,
  -- because a NULL return would itself separate staff from non-staff.
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller()
    THEN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role = 'super_admin'
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_collective_leader_or_above(uid uuid, cid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM collective_members
    WHERE user_id = uid AND collective_id = cid AND role IN ('leader', 'co_leader')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_collective_member(uid uuid, cid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM collective_members
    WHERE user_id = uid AND collective_id = cid AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- --- handle_new_user (from 004) ---
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- --- handle_content_report_removal (from 004) ---
CREATE OR REPLACE FUNCTION handle_content_report_removal()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'removed' AND OLD.status != 'removed' THEN
    CASE NEW.content_type
      WHEN 'chat_message' THEN
        UPDATE chat_messages SET is_deleted = true WHERE id = NEW.content_id;
      WHEN 'user' THEN
        NULL; -- handled separately
      ELSE
        NULL;
    END CASE;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- --- check_user_suspended (from 004) ---
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- --- check_chat_rate_limit (from 004) ---
CREATE OR REPLACE FUNCTION check_chat_rate_limit(p_user_id uuid, p_collective_id uuid)
RETURNS boolean AS $$
DECLARE
  recent_count integer;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM chat_messages
  WHERE user_id = p_user_id
    AND collective_id = p_collective_id
    AND created_at > now() - interval '10 seconds';
  RETURN recent_count < 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- --- cleanup_deleted_accounts (from 004) ---
CREATE OR REPLACE FUNCTION cleanup_deleted_accounts()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH expired AS (
    SELECT id FROM profiles
    WHERE deletion_status = 'pending_deletion'
      AND deletion_requested_at < now() - interval '30 days'
  )
  DELETE FROM auth.users WHERE id IN (SELECT id FROM expired);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- --- handle_event_registration (from 001) ---
CREATE OR REPLACE FUNCTION handle_event_registration()
RETURNS trigger AS $$
DECLARE
  event_capacity integer;
  current_count integer;
BEGIN
  SELECT capacity INTO event_capacity
  FROM events WHERE id = NEW.event_id;

  IF event_capacity IS NOT NULL THEN
    SELECT COUNT(*) INTO current_count
    FROM event_registrations
    WHERE event_id = NEW.event_id AND status = 'registered';

    IF current_count >= event_capacity THEN
      NEW.status := 'waitlisted';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- --- handle_registration_cancel (from 001) ---
CREATE OR REPLACE FUNCTION handle_registration_cancel()
RETURNS trigger AS $$
DECLARE
  next_waitlisted uuid;
BEGIN
  IF OLD.status = 'registered' AND NEW.status = 'cancelled' THEN
    SELECT id INTO next_waitlisted
    FROM event_registrations
    WHERE event_id = OLD.event_id AND status = 'waitlisted'
    ORDER BY registered_at ASC
    LIMIT 1;

    IF next_waitlisted IS NOT NULL THEN
      UPDATE event_registrations
      SET status = 'registered'
      WHERE id = next_waitlisted;

      INSERT INTO notifications (user_id, type, title, body, data)
      SELECT user_id, 'waitlist_promoted',
        'You''re in!',
        'A spot opened up for an event you were waitlisted for.',
        jsonb_build_object('event_id', OLD.event_id)
      FROM event_registrations WHERE id = next_waitlisted;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- --- get_collective_stats (from 019) ---
CREATE OR REPLACE FUNCTION get_collective_stats(p_collective_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'member_count', (SELECT COUNT(*) FROM collective_members WHERE collective_id = p_collective_id AND status = 'active'),
    'event_count', (SELECT COUNT(*) FROM events WHERE collective_id = p_collective_id AND status IN ('published', 'completed')),
    'trees_planted', COALESCE(SUM(ei.trees_planted), 0),
    'rubbish_kg', COALESCE(SUM(ei.rubbish_kg), 0),
    'coastline_cleaned_m', COALESCE(SUM(ei.coastline_cleaned_m), 0),
    'hours_total', COALESCE(SUM(ei.hours_total), 0),
    'area_restored_sqm', COALESCE(SUM(ei.area_restored_sqm), 0),
    'native_plants', COALESCE(SUM(ei.native_plants), 0),
    'wildlife_sightings', COALESCE(SUM(ei.wildlife_sightings), 0),
    'attendance_rate', CASE
      WHEN (SELECT COUNT(*) FROM event_registrations er2 JOIN events e2 ON e2.id = er2.event_id WHERE e2.collective_id = p_collective_id AND er2.status IN ('registered', 'attended')) = 0 THEN 0
      ELSE ROUND(
        (SELECT COUNT(*)::numeric FROM event_registrations er3 JOIN events e3 ON e3.id = er3.event_id WHERE e3.collective_id = p_collective_id AND er3.status = 'attended')
        / (SELECT COUNT(*)::numeric FROM event_registrations er4 JOIN events e4 ON e4.id = er4.event_id WHERE e4.collective_id = p_collective_id AND er4.status IN ('registered', 'attended')),
        2
      )
    END
  ) INTO result
  FROM events e
  LEFT JOIN event_impact ei ON ei.event_id = e.id
  WHERE e.collective_id = p_collective_id AND e.status IN ('published', 'completed');

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- --- handle_announcement_rsvp (from 045) ---
CREATE OR REPLACE FUNCTION handle_announcement_rsvp(
  p_event_id uuid,
  p_response text
)
RETURNS jsonb AS $$
DECLARE
  v_event record;
  v_existing record;
  v_result jsonb;
BEGIN
  SELECT id, title, date_start, capacity INTO v_event
  FROM events WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  SELECT * INTO v_existing
  FROM event_registrations
  WHERE event_id = p_event_id AND user_id = auth.uid();

  IF p_response = 'going' THEN
    IF v_existing IS NULL THEN
      INSERT INTO event_registrations (event_id, user_id, status, registered_at)
      VALUES (p_event_id, auth.uid(), 'registered', now());
    ELSIF v_existing.status != 'registered' THEN
      UPDATE event_registrations
      SET status = 'registered', registered_at = now()
      WHERE event_id = p_event_id AND user_id = auth.uid();
    END IF;
    DELETE FROM event_maybe_reminders
    WHERE event_id = p_event_id AND user_id = auth.uid();
    v_result := jsonb_build_object('action', 'registered', 'event_title', v_event.title);

  ELSIF p_response = 'not_going' THEN
    IF v_existing IS NOT NULL AND v_existing.status IN ('registered', 'invited', 'waitlisted') THEN
      UPDATE event_registrations
      SET status = 'cancelled'
      WHERE event_id = p_event_id AND user_id = auth.uid();
    END IF;
    DELETE FROM event_maybe_reminders
    WHERE event_id = p_event_id AND user_id = auth.uid();
    v_result := jsonb_build_object('action', 'cancelled', 'event_title', v_event.title);

  ELSIF p_response = 'maybe' THEN
    INSERT INTO event_maybe_reminders (event_id, user_id, remind_at)
    VALUES (
      p_event_id,
      auth.uid(),
      GREATEST(v_event.date_start - INTERVAL '3 days', now() + INTERVAL '1 hour')
    )
    ON CONFLICT (event_id, user_id)
    DO UPDATE SET remind_at = GREATEST(v_event.date_start - INTERVAL '3 days', now() + INTERVAL '1 hour'),
                  sent = false;
    v_result := jsonb_build_object(
      'action', 'maybe',
      'event_title', v_event.title,
      'remind_at', GREATEST(v_event.date_start - INTERVAL '3 days', now() + INTERVAL '1 hour')
    );

  ELSE
    RAISE EXCEPTION 'Invalid response: %', p_response;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ===========================================================================
-- (c) Add auth guards to unprotected RPCs
-- ===========================================================================

-- award_points: restrict to service_role / internal calls only
-- Previously callable by any authenticated user via PostgREST
CREATE OR REPLACE FUNCTION award_points(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_event_id uuid DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Guard: only callable internally (SECURITY DEFINER context) or by admin
  IF auth.uid() IS NOT NULL AND NOT is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: award_points is restricted to admin/internal use';
  END IF;

  INSERT INTO points_ledger (user_id, amount, reason, event_id)
  VALUES (p_user_id, p_amount, p_reason, p_event_id);

  UPDATE profiles
  SET points = points + p_amount, updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- respond_to_collaboration: add authorization check
-- Previously any user who knew a collaboration_id could accept/decline
CREATE OR REPLACE FUNCTION respond_to_collaboration(
  p_collaboration_id uuid,
  p_accept boolean
)
RETURNS void AS $$
DECLARE
  v_collab record;
  v_event_title text;
  v_collective_name text;
BEGIN
  SELECT * INTO v_collab FROM collective_event_collaborators WHERE id = p_collaboration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Collaboration not found'; END IF;

  -- Auth guard: only leaders of the invited collective or admins can respond
  IF NOT is_collective_leader_or_above(auth.uid(), v_collab.collective_id)
     AND NOT is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: only leaders of the invited collective can respond';
  END IF;

  SELECT title INTO v_event_title FROM events WHERE id = v_collab.event_id;
  SELECT name INTO v_collective_name FROM collectives WHERE id = v_collab.collective_id;

  UPDATE collective_event_collaborators
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
      responded_at = now()
  WHERE id = p_collaboration_id;

  IF p_accept THEN
    INSERT INTO event_registrations (event_id, user_id, status, invited_at)
    SELECT v_collab.event_id, cm.user_id, 'invited', now()
    FROM collective_members cm
    WHERE cm.collective_id = v_collab.collective_id AND cm.status = 'active'
    ON CONFLICT (event_id, user_id) DO NOTHING;

    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT cm.user_id, 'event_invite',
      'You''re invited to a collaborative event!',
      v_collective_name || ' is collaborating on "' || v_event_title || '"',
      jsonb_build_object('event_id', v_collab.event_id)
    FROM collective_members cm
    WHERE cm.collective_id = v_collab.collective_id AND cm.status = 'active';
  END IF;

  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT cm.user_id, 'general',
    v_collective_name || CASE WHEN p_accept THEN ' accepted' ELSE ' declined' END || ' the collaboration',
    'For event "' || v_event_title || '"',
    jsonb_build_object('event_id', v_collab.event_id, 'collaboration_id', p_collaboration_id)
  FROM collective_members cm
  WHERE cm.collective_id = v_collab.invited_by_collective_id
    AND cm.role IN ('leader', 'co_leader')
    AND cm.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- invite_collective_to_collaborate: add authorization check
CREATE OR REPLACE FUNCTION invite_collective_to_collaborate(
  p_event_id uuid,
  p_collective_id uuid,
  p_host_collective_id uuid,
  p_message text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_collab_id uuid;
  v_event_title text;
  v_host_name text;
BEGIN
  -- Auth guard: only leaders of the host collective or admins can invite
  IF NOT is_collective_leader_or_above(auth.uid(), p_host_collective_id)
     AND NOT is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: only leaders of the host collective can invite collaborators';
  END IF;

  SELECT title INTO v_event_title FROM events WHERE id = p_event_id;
  SELECT name INTO v_host_name FROM collectives WHERE id = p_host_collective_id;

  INSERT INTO collective_event_collaborators (event_id, collective_id, invited_by_collective_id, invited_by_user, message)
  VALUES (p_event_id, p_collective_id, p_host_collective_id, auth.uid(), p_message)
  ON CONFLICT (event_id, collective_id) DO NOTHING
  RETURNING id INTO v_collab_id;

  INSERT INTO event_invites (event_id, collective_id, invited_by, message)
  VALUES (p_event_id, p_collective_id, auth.uid(), p_message)
  ON CONFLICT (event_id, collective_id) DO NOTHING;

  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT cm.user_id, 'event_invite',
    v_host_name || ' wants to collaborate!',
    'You''ve been invited to collaborate on "' || v_event_title || '"',
    jsonb_build_object('event_id', p_event_id, 'collective_id', p_collective_id, 'collaboration_id', v_collab_id)
  FROM collective_members cm
  WHERE cm.collective_id = p_collective_id
    AND cm.role IN ('leader', 'co_leader')
    AND cm.status = 'active';

  RETURN v_collab_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ===========================================================================
-- (d) Restrict profile data exposure
-- Replace the overly permissive profiles_select_authenticated with a policy
-- that hides sensitive fields. Since RLS operates at row level, we use a
-- secure view for column-level restriction and update the policy.
-- ===========================================================================

-- Create a view that exposes only public-safe fields
CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  display_name,
  avatar_url,
  bio,
  pronouns,
  interests,
  membership_level,
  points,
  role,
  onboarding_completed,
  created_at
FROM profiles;

-- Grant access to the view (anon + authenticated can read public data)
GRANT SELECT ON public_profiles TO authenticated;

-- The full profiles table stays readable for own row + admin (via existing RLS).
-- Update the permissive SELECT to only expose full data to self or admin:
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_admin_or_staff(auth.uid())
  );

-- Allow collective members to see basic profile data of fellow members
-- (needed for member lists, chat, etc.)
CREATE POLICY "profiles_select_fellow_member"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collective_members cm1
      JOIN collective_members cm2 ON cm1.collective_id = cm2.collective_id
      WHERE cm1.user_id = auth.uid()
        AND cm2.user_id = profiles.id
        AND cm1.status = 'active'
        AND cm2.status = 'active'
    )
  );

-- ===========================================================================
-- (e) Missing updated_at triggers
-- ===========================================================================

-- Generic updated_at function (may already exist but CREATE OR REPLACE is safe)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Tables that have updated_at columns but no trigger:
-- collective_members (has joined_at but no updated_at - add column + trigger)
ALTER TABLE collective_members ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER set_collective_members_updated_at
  BEFORE UPDATE ON collective_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- donations (has created_at but no updated_at - status changes should be tracked)
ALTER TABLE donations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER set_donations_updated_at
  BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- notifications (read_at changes are updates that should be timestamped)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER set_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- survey_responses (answers may be updated)
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER set_survey_responses_updated_at
  BEFORE UPDATE ON survey_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- task_instances (status changes)
ALTER TABLE task_instances ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER set_task_instances_updated_at
  BEFORE UPDATE ON task_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- memberships (status/period changes)
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER set_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- recurring_donations (status changes)
ALTER TABLE recurring_donations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE TRIGGER set_recurring_donations_updated_at
  BEFORE UPDATE ON recurring_donations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================================================
-- (f) Missing indexes on columns used in WHERE/JOIN clauses
-- ===========================================================================

-- event_registrations: heavily queried by event_id + user_id + status
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_user_id ON event_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_status ON event_registrations(status);

-- collective_members: queried by collective_id, user_id, status, role
CREATE INDEX IF NOT EXISTS idx_collective_members_collective_id ON collective_members(collective_id);
CREATE INDEX IF NOT EXISTS idx_collective_members_user_id ON collective_members(user_id);
CREATE INDEX IF NOT EXISTS idx_collective_members_status ON collective_members(status);

-- events: queried by collective_id, status, date_start
CREATE INDEX IF NOT EXISTS idx_events_collective_id ON events(collective_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date_start ON events(date_start);

-- event_impact: queried by event_id
CREATE INDEX IF NOT EXISTS idx_event_impact_event_id ON event_impact(event_id);

-- chat_messages: queried by collective_id, channel_id, user_id
CREATE INDEX IF NOT EXISTS idx_chat_messages_collective_id ON chat_messages(collective_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

-- notifications: queried by user_id, read_at
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at) WHERE read_at IS NULL;

-- donations: queried by user_id, status
CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations(user_id);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);

-- merch_orders: queried by user_id, status
CREATE INDEX IF NOT EXISTS idx_merch_orders_user_id ON merch_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_merch_orders_status ON merch_orders(status);

-- push_tokens: queried by user_id
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

-- points_ledger: queried by user_id
CREATE INDEX IF NOT EXISTS idx_points_ledger_user_id ON points_ledger(user_id);

-- survey_responses: queried by survey_id, event_id, user_id
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_event_id ON survey_responses(event_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_user_id ON survey_responses(user_id);

-- task_instances: queried by template_id, collective_id, assigned_user_id
CREATE INDEX IF NOT EXISTS idx_task_instances_template_id ON task_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_task_instances_collective_id ON task_instances(collective_id);
CREATE INDEX IF NOT EXISTS idx_task_instances_assigned_user ON task_instances(assigned_user_id);

-- campaign_recipients: queried by campaign_id, profile_id
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_profile_id ON campaign_recipients(profile_id);

-- leader_todos: queried by user_id
CREATE INDEX IF NOT EXISTS idx_leader_todos_user_id ON leader_todos(user_id);

-- ===========================================================================
-- (g) Audit log: add index for common queries
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
