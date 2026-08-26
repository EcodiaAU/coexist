-- ============================================================================
-- 20260826002000: close two more anon-reachable definer reads on Co-Exist
--
-- Origin: 2026-08-26 authenticated-tier SECDEF audit.
-- Doctrine: backend/patterns/anon-definer-view-is-a-fleet-invariant-2026-08-20.md
--
-- (1) check_user_suspended(uid) was SECURITY DEFINER with a PUBLIC EXECUTE grant
--     and no internal guard, so anyone (anon included) could pass an arbitrary
--     uid and read that user's moderation state: suspended flag, free-text
--     suspended_reason, and suspended_until. profiles RLS otherwise limits a
--     member to their own row, fellow active collective members, and registrants
--     of collectives they lead. The function also writes (it clears an expired
--     suspension), so the write was anon-triggerable for any uid.
--     Sole caller is src/hooks/use-auth.ts:444, which passes the signed-in
--     user's own id during auth bootstrap, so self-or-staff is non-breaking.
--     Verified 2026-08-26: referenced by zero RLS policies, views, and other
--     functions, so raising here cannot break a write path.
--
-- (2) event_attendance_reconciliation(p_event_id) was SECURITY DEFINER and
--     anon-executable, returning per-event capacity, spots taken, and tickets
--     paid / comped / held. That is operational and commercial data. It has zero
--     callers anywhere in the repo, so it is revoked to service_role + postgres
--     rather than guarded.
--
-- auth.uid() is NULL for anon and for a service_role/postgres session, so the
-- guard in (1) is paired with an anon revoke rather than relying on the body
-- alone. current_user is deliberately NOT consulted: inside a SECURITY DEFINER
-- function it resolves to the definer (postgres), not the caller, which would
-- make the guard a silent no-op.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_user_suspended(uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p profiles;
BEGIN
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
$function$;

REVOKE EXECUTE ON FUNCTION public.check_user_suspended(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.event_attendance_reconciliation(uuid) FROM PUBLIC, anon, authenticated;
