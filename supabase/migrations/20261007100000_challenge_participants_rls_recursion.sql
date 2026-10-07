-- challenge_participants: end the 42P17 infinite recursion in its SELECT policy.
--
-- THE DEFECT. Policy challenge_participants_select_own_or_admin had a third arm that
-- read FROM challenge_participants inside challenge_participants' own SELECT policy:
--   EXISTS (SELECT 1 FROM challenge_participants cp2
--           WHERE cp2.challenge_id = challenge_participants.challenge_id
--             AND cp2.user_id = auth.uid())
-- The inner read is itself subject to the same policy, so the rewriter re-enters it
-- without bound and EVERY authenticated read of the table raised
--   ERROR 42P17: infinite recursion detected in policy for relation "challenge_participants"
-- whatever the caller's role, admins included. service_role was unaffected.
-- It was the only self-referential policy of 315 across 113 tables on this schema
-- (case-insensitive sweep with a positive control, 2026-08-30, board 4a829114).
--
-- THE FIX. Same shape as every other self-reference on this schema: move the inner read
-- into a SECURITY DEFINER helper owned by the table owner, which does not re-trigger RLS.
-- is_challenge_participant mirrors is_fellow_collective_member exactly, including the
-- oracle guard: it answers only for the caller (or a trusted backend caller), so it
-- cannot be used to probe whether some other user joined a challenge.
--
-- GRANTS. Revoke from PUBLIC first, then anon, then re-grant by name. A revoke naming
-- anon alone leaves the PUBLIC arm executing
-- (patterns/a-revoke-naming-roles-leaves-public-executing-2026-09-04.md).
-- authenticated MUST keep EXECUTE: the policy runs the helper as the querying role.
--
-- Applied to tjutlbzekfouwsiaplbr through pgq.sh on 2026-10-07 under Tate's
-- db_execute grant b68a839c. Behaviour after: an authenticated read returns rows
-- (0 today, the participant surface is not built yet) instead of 42P17.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_challenge_participant(caller_uid uuid, target_challenge_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN caller_uid IS NULL OR target_challenge_id IS NULL THEN false
    WHEN caller_uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM challenge_participants
      WHERE challenge_id = target_challenge_id
        AND user_id = caller_uid
    )
    ELSE false
  END;
$function$;

REVOKE ALL ON FUNCTION public.is_challenge_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_challenge_participant(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_challenge_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_challenge_participant(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS challenge_participants_select_own_or_admin ON public.challenge_participants;
CREATE POLICY challenge_participants_select_own_or_admin ON public.challenge_participants
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid())
    OR is_admin_or_staff(auth.uid())
    OR public.is_challenge_participant(auth.uid(), challenge_id)
  );

COMMIT;
