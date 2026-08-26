-- ============================================================
-- Migration: 078_fix_role_functions.sql
-- 076 partially failed (see 077), so the core role-check
-- functions may still reference old enum literals.
-- This idempotently recreates them with the current values:
--   participant, national_leader, manager, admin
-- ============================================================

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
    WHERE id = uid AND role IN ('national_leader', 'manager', 'admin')
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

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

-- Also recreate get_profile_protected_fields (from 069) to ensure
-- it returns the correct enum type after the renames.
CREATE OR REPLACE FUNCTION get_profile_protected_fields(uid uuid)
RETURNS TABLE(is_suspended boolean, role user_role) AS $$
  SELECT p.is_suspended, p.role
  FROM profiles p
  WHERE p.id = uid
    -- Guard added 2026-08-26: filter (never RAISE) because this runs inside the
    -- profiles_update_own_safe WITH CHECK, where an exception is a hard write
    -- failure. Self-calls, the only real caller, always match.
    AND (uid = auth.uid() OR public.is_admin_or_staff(auth.uid()))
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Recreate admin_list_users with current role names
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

-- Recreate sync_national_staff_channel trigger function
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
