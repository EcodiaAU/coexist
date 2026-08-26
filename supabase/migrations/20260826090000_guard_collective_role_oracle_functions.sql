-- Close the COLLECTIVE-SCOPED half of the role oracle.
--
-- 20260826080000 closed the four global role definers (is_admin_or_staff,
-- is_super_admin, is_admin, is_admin_tier). The same shape was still open on
-- nine collective-scoped definers: every one is SECURITY DEFINER, carries
-- PUBLIC EXECUTE, and takes a uid argument, so anon could ask membership and
-- collective-role questions about any third party. Measured 2026-08-26 before
-- this migration, as anon with auth.uid() NULL:
--   is_collective_staff              -> true
--   is_collective_leader_or_above    -> true
--   is_collective_member             -> true
--   is_any_collective_leader         -> true
--   is_collective_staff_or_above     -> true
--   is_fellow_collective_member      -> true
--   is_event_registrant_of_led_collective -> true
--   is_channel_member                -> true
--   is_registered_for_event          -> true
--
-- The guard is on the uid argument only. The cid / channel / event argument is
-- not an identity, so it is left alone.
--
-- Three shapes that look right and fail open (doctrine:
-- patterns/a-null-comparison-is-the-whole-guard-when-the-caller-can-be-anonymous-2026-08-26.md):
--   1. NOT (uid = auth.uid()) is NULL for anon, so the guard never fires and
--      the function answers truthfully to exactly the caller it guards against.
--      IS DISTINCT FROM / IS NOT DISTINCT FROM is the correct comparison.
--   2. A guard that can return NULL is still an oracle: f(x) IS NULL separates
--      members from non-members. Every branch here is strictly boolean and the
--      CASE carries an explicit ELSE false.
--   3. current_user inside a SECURITY DEFINER body is the DEFINER, not the
--      caller. The role GUC survives the boundary, which is what
--      public.is_trusted_backend_caller() reads.
--
-- FILTER, NEVER RAISE. These are evaluated inside RLS where an exception is a
-- hard query failure rather than a denied row.
--
-- NO REVOKE. RLS policy expressions execute with the querying user's
-- privileges and every one of these policies is PUBLIC-role, so anon needs
-- EXECUTE to touch the tables at all. Revoking here is a platform outage.
--
-- Call sites measured before writing this, all 79 of them:
--   62 RLS policies  -> every one passes auth.uid() literally
--   12 function bodies -> auth.uid() literally, or a local initialised
--      := auth.uid() with a NULL early-return (save_carpool_seat,
--      get_user_profile_v1), or the outer function's own already-guarded
--      identity argument (is_event_registrant_of_led_collective -> viewer)
--   0 views, 0 matviews
--   All 39 DEPLOYED edge function bodies were read from the Management API
--   (not the repo): cancel-event is the single real call site, calling
--   is_collective_staff under service_role with auth.uid() NULL, which the
--   is_trusted_backend_caller carve-out covers. send-push matches the name in
--   a comment only.
--
-- DELIBERATELY NOT GUARDED: public.is_profile_visible(p_user). It is not a role
-- oracle. It reads a user's own display preference and it exists to be asked
-- about other people: get_user_profile_v1 passes target_user_id and
-- event_going_members passes r.user_id, both third parties by design. A
-- self-only guard would return false for every other person and break profile
-- visibility across the product, and the disclosed value is a display
-- preference rather than a role or a membership.

BEGIN;

-- 1. is_collective_staff(uid, cid) -- 20 policies, called by cancel-event under service_role
CREATE OR REPLACE FUNCTION public.is_collective_staff(uid uuid, cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM collective_members
      WHERE user_id = uid AND collective_id = cid
        AND status = 'active'
        AND role IN ('leader', 'co_leader', 'assist_leader')
    )
    ELSE false
  END;
$function$;

-- 2. is_collective_leader_or_above(uid, cid) -- 18 policies
CREATE OR REPLACE FUNCTION public.is_collective_leader_or_above(uid uuid, cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM collective_members
      WHERE user_id = uid AND collective_id = cid AND role IN ('leader', 'co_leader')
    )
    ELSE false
  END;
$function$;

-- 3. is_collective_member(uid, cid) -- 17 policies
CREATE OR REPLACE FUNCTION public.is_collective_member(uid uuid, cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM collective_members
      WHERE user_id = uid AND collective_id = cid AND status = 'active'
    )
    ELSE false
  END;
$function$;

-- 4. is_channel_member(p_user_id, p_channel_id) -- 3 policies
CREATE OR REPLACE FUNCTION public.is_channel_member(p_user_id uuid, p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM public.chat_channel_members ccm
      WHERE ccm.channel_id = p_channel_id AND ccm.user_id = p_user_id
    )
    ELSE false
  END;
$function$;

-- 5. is_fellow_collective_member(caller_uid, target_collective_id) -- 2 policies
CREATE OR REPLACE FUNCTION public.is_fellow_collective_member(caller_uid uuid, target_collective_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN caller_uid IS NULL THEN false
    WHEN caller_uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM collective_members
      WHERE collective_id = target_collective_id
        AND user_id = caller_uid
        AND status = 'active'
    )
    ELSE false
  END;
$function$;

-- 6. is_any_collective_leader(uid) -- 1 policy
CREATE OR REPLACE FUNCTION public.is_any_collective_leader(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM public.collective_members
      WHERE user_id = uid AND status='active' AND role in ('leader','co_leader','assist_leader')
    )
    ELSE false
  END;
$function$;

-- 7. is_collective_staff_or_above(uid) -- 0 policies, called by get_user_profile_v1(v_caller)
--    Role list preserved verbatim, national_leader included (a live user_role label).
CREATE OR REPLACE FUNCTION public.is_collective_staff_or_above(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM profiles
      WHERE id = uid
        AND role IN (
          'assist_leader',
          'co_leader',
          'leader',
          'national_leader',
          'manager',
          'admin'
        )
    )
    ELSE false
  END;
$function$;

-- 8. is_registered_for_event(p_user, p_event) -- 0 policies, called by event_going_members(auth.uid())
--    Guarded: attendance is a privacy fact, not a public one.
CREATE OR REPLACE FUNCTION public.is_registered_for_event(p_user uuid, p_event uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_user IS NULL THEN false
    WHEN p_user IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM event_registrations
      WHERE event_id = p_event AND user_id = p_user
        AND status IN ('registered','attended','waitlisted')
    )
    ELSE false
  END;
$function$;

-- 9. is_event_registrant_of_led_collective(viewer, target) -- 1 policy
--    viewer is the identity argument and is the one guarded; target is the
--    subject being asked about. The inner is_collective_staff(viewer, ...) is
--    now guarded too, and stays satisfied because this guard has already
--    established that viewer is auth.uid() or that the caller is trusted.
CREATE OR REPLACE FUNCTION public.is_event_registrant_of_led_collective(viewer uuid, target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN viewer IS NULL THEN false
    WHEN viewer IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM event_registrations er
      JOIN events e ON e.id = er.event_id
      WHERE er.user_id = target AND is_collective_staff(viewer, e.collective_id)
    )
    ELSE false
  END;
$function$;

COMMIT;
