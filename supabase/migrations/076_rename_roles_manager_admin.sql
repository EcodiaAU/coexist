-- ============================================================
-- Migration: 076_rename_roles_manager_admin.sql
-- Renames user_role enum values:
--   national_admin → manager
--   super_admin    → admin
-- Then updates ALL live functions + RLS policies that reference
-- the old literal values.
-- Adds managed_collectives column to staff_roles for managers.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Rename user_role enum values (PG 10+)
--    Idempotent: skip if already renamed (e.g. partial prior run).
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'national_admin' AND enumtypid = 'user_role'::regtype) THEN
    ALTER TYPE user_role RENAME VALUE 'national_admin' TO 'manager';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'super_admin' AND enumtypid = 'user_role'::regtype) THEN
    ALTER TYPE user_role RENAME VALUE 'super_admin' TO 'admin';
  END IF;
END $$;

-- Also update text[] columns that stored old role strings
UPDATE dev_modules
SET target_roles = array_replace(array_replace(target_roles, 'national_admin', 'manager'), 'super_admin', 'admin')
WHERE 'national_admin' = ANY(target_roles) OR 'super_admin' = ANY(target_roles);

UPDATE dev_sections
SET target_roles = array_replace(array_replace(target_roles, 'national_admin', 'manager'), 'super_admin', 'admin')
WHERE 'national_admin' = ANY(target_roles) OR 'super_admin' = ANY(target_roles);

-- ---------------------------------------------------------------------------
-- 2. Recreate ALL functions that referenced old values
-- ---------------------------------------------------------------------------

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

CREATE OR REPLACE FUNCTION is_super_admin(uid uuid)
RETURNS boolean AS $$
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  -- Guard added 2026-08-26 (role oracle). IS DISTINCT FROM, not <>: auth.uid()
  -- is NULL for anon, and `uid <> NULL` is NULL, so a NOT(...) test would fall
  -- through and answer truthfully. The trusted-backend arm keeps the
  -- service_role callers (cancel-event) working, where auth.uid() is NULL.
  IF uid IS DISTINCT FROM auth.uid() AND NOT public.is_trusted_backend_caller() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = uid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_admin(uid uuid)
RETURNS boolean AS $$
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  -- Guard added 2026-08-26 (role oracle). IS DISTINCT FROM, not <>: auth.uid()
  -- is NULL for anon, and `uid <> NULL` is NULL, so a NOT(...) test would fall
  -- through and answer truthfully. The trusted-backend arm keeps the
  -- service_role callers (cancel-event) working, where auth.uid() is NULL.
  IF uid IS DISTINCT FROM auth.uid() AND NOT public.is_trusted_backend_caller() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = uid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

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
    WHERE id = uid AND role IN ('national_leader', 'manager', 'admin')
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION admin_list_users(
  search_term  text DEFAULT '',
  role_filter  text DEFAULT 'all',
  result_limit integer DEFAULT 30,
  offset_val   integer DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  display_name   text,
  avatar_url     text,
  role           text,
  email          text,
  is_suspended   boolean,
  created_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('national_leader', 'manager', 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.role::text,
    u.email::text,
    p.is_suspended,
    p.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE
    (role_filter = 'all' OR p.role::text = role_filter)
    AND (
      search_term = ''
      OR p.display_name ILIKE '%' || search_term || '%'
      OR u.email ILIKE '%' || search_term || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT result_limit
  OFFSET offset_val;
END;
$$;

CREATE OR REPLACE FUNCTION sync_national_staff_channel()
RETURNS trigger AS $$
DECLARE
  v_national_channel uuid;
BEGIN
  SELECT id INTO v_national_channel
  FROM chat_channels WHERE type = 'staff_national' LIMIT 1;

  IF v_national_channel IS NULL THEN RETURN NEW; END IF;

  IF NEW.role IN ('national_leader', 'manager', 'admin') THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    VALUES (v_national_channel, NEW.id)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  IF NEW.role = 'participant' AND OLD.role IN ('national_leader', 'manager', 'admin') THEN
    DELETE FROM chat_channel_members
    WHERE channel_id = v_national_channel AND user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. Drop and recreate ALL RLS policies that referenced old values
-- ---------------------------------------------------------------------------

-- ---- charity_settings ----
DROP POLICY IF EXISTS "charity_settings_select" ON charity_settings;
CREATE POLICY "charity_settings_select"
  ON charity_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "charity_settings_insert" ON charity_settings;
CREATE POLICY "charity_settings_insert"
  ON charity_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "charity_settings_update" ON charity_settings;
CREATE POLICY "charity_settings_update"
  ON charity_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "charity_settings_delete" ON charity_settings;
CREATE POLICY "charity_settings_delete"
  ON charity_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('manager', 'admin')
    )
  );

-- ---- legal_pages ----
DROP POLICY IF EXISTS "Staff can read all legal pages" ON public.legal_pages;
CREATE POLICY "Staff can read all legal pages"
  ON public.legal_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('national_leader', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Staff can insert legal pages" ON public.legal_pages;
CREATE POLICY "Staff can insert legal pages"
  ON public.legal_pages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('national_leader', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Staff can update legal pages" ON public.legal_pages;
CREATE POLICY "Staff can update legal pages"
  ON public.legal_pages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('national_leader', 'manager', 'admin')
    )
  );

-- ---- timeline_rules ----
DROP POLICY IF EXISTS "Staff can read timeline rules" ON public.timeline_rules;
CREATE POLICY "Staff can read timeline rules"
  ON timeline_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('national_leader', 'manager', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM collective_members
      WHERE collective_members.user_id = auth.uid()
      AND collective_members.role IN ('leader', 'co_leader', 'assist_leader')
    )
  );

DROP POLICY IF EXISTS "Admins can manage timeline rules" ON public.timeline_rules;
CREATE POLICY "Admins can manage timeline rules"
  ON timeline_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('national_leader', 'manager', 'admin')
    )
  );

-- ---- collective_applications ----
DROP POLICY IF EXISTS "Staff can view applications" ON public.collective_applications;
CREATE POLICY "Staff can view applications"
  ON public.collective_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('national_leader', 'admin')
    )
  );

DROP POLICY IF EXISTS "Staff can update applications" ON public.collective_applications;
CREATE POLICY "Staff can update applications"
  ON public.collective_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('national_leader', 'admin')
    )
  );

-- ---- notification_recipients ----
DROP POLICY IF EXISTS "Staff can manage notification recipients" ON public.notification_recipients;
CREATE POLICY "Staff can manage notification recipients"
  ON public.notification_recipients FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('national_leader', 'admin')
    )
  );

-- ---- emergency_contacts ----
DROP POLICY IF EXISTS "Staff can manage contacts" ON public.emergency_contacts;
CREATE POLICY "Staff can manage contacts"
  ON public.emergency_contacts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('national_leader', 'manager', 'admin')
    )
  );

-- ---- contact_submissions ----
DROP POLICY IF EXISTS "Staff can view contact submissions" ON public.contact_submissions;
CREATE POLICY "Staff can view contact submissions"
  ON public.contact_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('national_leader', 'manager', 'admin')
    )
  );

-- ---- impact_metric_defs ----
DROP POLICY IF EXISTS "impact_metric_defs_staff_write" ON public.impact_metric_defs;
CREATE POLICY "impact_metric_defs_staff_write"
  ON impact_metric_defs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('national_leader', 'manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('national_leader', 'manager', 'admin')
    )
  );

-- ---- app_settings ----
DROP POLICY IF EXISTS "app_settings_staff_write" ON public.app_settings;
CREATE POLICY "app_settings_staff_write"
  ON app_settings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('national_leader', 'manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('national_leader', 'manager', 'admin')
    )
  );

-- ---- user_blocks ----
DROP POLICY IF EXISTS "Staff can view all blocks" ON public.user_blocks;
CREATE POLICY "Staff can view all blocks"
  ON public.user_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('national_leader', 'manager', 'admin')
    )
  );

-- ---- system_email_overrides ----
DROP POLICY IF EXISTS "Staff can read system email overrides" ON public.system_email_overrides;
CREATE POLICY "Staff can read system email overrides"
  ON public.system_email_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('national_leader', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can manage system email overrides" ON public.system_email_overrides;
CREATE POLICY "Admins can manage system email overrides"
  ON public.system_email_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('manager', 'admin')
    )
  );

-- ---- membership_rewards ----
DROP POLICY IF EXISTS "membership_rewards_manage_admin" ON public.membership_rewards;
CREATE POLICY "membership_rewards_manage_admin"
  ON membership_rewards FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
  );

-- ---- memberships ----
DROP POLICY IF EXISTS "memberships_select_admin" ON public.memberships;
CREATE POLICY "memberships_select_admin"
  ON memberships FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
  );

-- ---- leader_todos ----
DROP POLICY IF EXISTS "leader_todos_admin_select" ON public.leader_todos;
CREATE POLICY "leader_todos_admin_select"
  ON leader_todos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('manager', 'admin')
    )
  );

-- ---- storage: updates (announcements bucket) ----
DROP POLICY IF EXISTS "updates: admin insert" ON storage.objects;
CREATE POLICY "updates: admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'announcements'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "updates: admin update" ON storage.objects;
CREATE POLICY "updates: admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'announcements'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "updates: admin delete" ON storage.objects;
CREATE POLICY "updates: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'announcements'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Add managed_collectives to staff_roles
-- ---------------------------------------------------------------------------
ALTER TABLE staff_roles ADD COLUMN IF NOT EXISTS managed_collectives uuid[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_staff_roles_managed_collectives
  ON staff_roles USING GIN (managed_collectives);
