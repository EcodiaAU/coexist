-- 20260826080000_guard_role_oracle_functions.sql
--
-- Close the Co-Exist ROLE ORACLE.
--
-- is_admin_or_staff / is_super_admin / is_admin / is_admin_tier are all
-- SECURITY DEFINER with PUBLIC EXECUTE and all take a uid ARGUMENT, so any
-- caller could ask them about ANY user and get a truthful answer:
--
--   as anon:  is_admin_or_staff('<an admin uuid>')       -> true
--             is_super_admin('<an admin uuid>')          -> true
--             is_admin_or_staff('<a participant uuid>')  -> false
--
-- That is a staff-enumeration oracle: given a uuid, learn whether it is staff.
-- An authenticated member can already see fellow active collective members, so
-- the uuids to feed it are in reach. This is the same disclosure the 2026-08-26
-- get_profile_protected_fields fix was justified by, still open through the
-- sibling functions nobody had looked at.
--
-- WHY NOT SIMPLY REVOKE. RLS policy expressions execute with the QUERYING
-- user's privileges, so anon needs EXECUTE on anything an anon-evaluated policy
-- calls. is_admin_or_staff is referenced by 180 RLS policies, all of them
-- PUBLIC-role, so revoking it is a platform outage rather than a fix.
--
-- THE GUARD. All 180 policy call sites and all 16 function-body call sites pass
-- auth.uid() (get_user_profile_v1 and enforce_collective_member_hierarchy pass
-- a local variable, and both initialise it as `:= auth.uid()`). So the honest
-- contract is "you may ask about yourself", and a body guard costs nothing.
--
-- It FILTERS to false rather than RAISEing, because these run inside RLS where
-- an exception is a hard query failure rather than a denied row.
--
-- THE SERVICE-ROLE CARVE-OUT. auth.uid() is NULL for service_role and for a
-- direct postgres connection. The deployed cancel-event edge function builds a
-- service_role client and calls rpc('is_admin_or_staff', { uid: caller.id }),
-- so a naive uid=auth.uid() guard denies every staff event cancellation. The
-- carve-out below is what keeps that path working.
--
-- Measured on this database (see is_trusted_backend_caller) rather than assumed:
--   caller                     current_setting('role')   auth.uid()
--   anon (PostgREST)           anon                      NULL
--   authenticated (PostgREST)  authenticated             the JWT sub
--   service_role (PostgREST)   service_role              NULL
--   direct postgres            none                      NULL
--
-- NOTE current_user inside a SECURITY DEFINER body resolves to the DEFINER
-- (postgres), not the caller, so gating on current_user is a silent no-op. The
-- `role` GUC is NOT rewritten by the definer boundary, which is what makes it
-- the correct discriminator here.

-- ---------------------------------------------------------------------------
-- The carve-out, defined ONCE so all four oracles share identical semantics.
-- ---------------------------------------------------------------------------
-- Deliberately NOT SECURITY DEFINER and deliberately NOT search_path-pinned: a
-- plain sql STABLE function is inlinable by the planner, which matters because
-- this is now reached from 180 RLS policies. current_setting is pg_catalog-
-- qualified so it cannot be shadowed no matter what the caller's search_path
-- is, which is the protection the SET clause would otherwise have provided.
--
-- No exposed function on this database can move the `role` GUC (verified: zero
-- functions contain SET ROLE or set_config('role',...)), and neither anon nor
-- authenticated holds CREATE on schema public, so this value is not attacker
-- controlled. Reaching 'service_role' requires the service_role key, and
-- reaching 'none' requires a direct database connection; both are already
-- privileged beyond anything this oracle would disclose.
CREATE OR REPLACE FUNCTION public.is_trusted_backend_caller()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(pg_catalog.current_setting('role', true), 'none')
         IN ('service_role', 'postgres', 'supabase_admin', 'none');
$$;

COMMENT ON FUNCTION public.is_trusted_backend_caller() IS
  'True when the caller is a trusted backend (service_role or a direct postgres connection) rather than anon/authenticated. Used by the role-oracle guards so server-side callers such as cancel-event can still authorize a third party. Not a security boundary on its own.';

-- ---------------------------------------------------------------------------
-- 1. is_admin: no policies, no function bodies, no repo callers, no deployed
--    edge-function callers. Revoked AND guarded: the revoke is the real close,
--    and the guard is what survives a future migration re-running the GRANT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  -- IS DISTINCT FROM, not <>: auth.uid() is NULL for anon, and `uid <> NULL`
  -- is NULL, so a NOT(...) guard would fall through and answer truthfully.
  IF uid IS DISTINCT FROM auth.uid() AND NOT public.is_trusted_backend_caller() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role = 'admin');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. is_super_admin: 2 RLS policies (staff_roles_select_super_admin,
--    staff_roles_manage_super_admin), both pass auth.uid().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  IF uid IS DISTINCT FROM auth.uid() AND NOT public.is_trusted_backend_caller() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role = 'admin');
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. is_admin_tier: 4 RLS policies (collective_applications x2,
--    notification_recipients, timeline_rules), all pass auth.uid().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_tier(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN uid IS NULL THEN false
    -- IS NOT DISTINCT FROM keeps every branch strictly boolean. A plain
    -- `uid = auth.uid()` yields NULL for anon, and a NULL return would itself
    -- be an oracle: `is_admin_tier(x) IS NULL` would still separate the roles.
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller()
      THEN EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role IN ('manager', 'admin'))
    ELSE false
  END;
$$;

-- ---------------------------------------------------------------------------
-- 4. is_admin_or_staff: 180 RLS policies + 16 function bodies. Highest blast
--    radius, identical guard. Every one of those 196 call sites passes
--    auth.uid(), so none of them change behaviour.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_or_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller()
      THEN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = uid AND role::text IN ('national_leader', 'manager', 'admin')
      )
    ELSE false
  END;
$$;
