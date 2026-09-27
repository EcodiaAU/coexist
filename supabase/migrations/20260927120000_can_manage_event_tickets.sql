-- can_manage_event_tickets(p_uid, p_event_id) - authorises the ticket-desk
-- actions (issue a free ticket, hold a spot, remove/refund a holder) for an
-- event.
--
-- Today those three edge functions (grant-event-ticket, reserve-event-spot,
-- revoke-event-ticket) gate on `profiles.role in ('manager','admin')` only, so
-- a campout LEADER cannot act on tickets for events their own collective
-- hosts and every such request routes to an admin. Leader power in this
-- codebase is an ACTIVE collective_members row, never profiles.role
-- (is_collective_staff, 20260826090000_guard_collective_role_oracle_functions.sql
-- is the canonical example this copies).
--
-- true when EITHER:
--   - p_uid is a global manager/admin (profiles.role), same as today, or
--   - p_uid holds an ACTIVE collective_members row with role in
--     ('leader','co_leader','assist_leader') for any collective_id that
--     hosts p_event_id (event_hosts: the primary collective_id plus any
--     accepted collective_event_collaborators row - a co-hosting collective's
--     leaders get the same power as the primary host's).
--
-- Same auth.uid()/is_trusted_backend_caller() guard as is_collective_staff:
-- the identity argument (p_uid) is checked against the CALLER, not the event.
-- A caller answering about themselves, or the service-role client the three
-- edge functions call this through, passes; anyone else answering about a
-- third party gets false without ever reaching the EXISTS.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_event_tickets(p_uid uuid, p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_uid IS NULL THEN false
    WHEN p_uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = p_uid AND role::text IN ('manager', 'admin')
      )
      OR EXISTS (
        SELECT 1 FROM collective_members cm
        WHERE cm.user_id = p_uid
          AND cm.status = 'active'
          AND cm.role IN ('leader', 'co_leader', 'assist_leader')
          AND cm.collective_id IN (
            SELECT eh.collective_id FROM event_hosts eh WHERE eh.event_id = p_event_id
          )
      )
    )
    ELSE false
  END;
$function$;

COMMENT ON FUNCTION public.can_manage_event_tickets(uuid, uuid) IS
  'True when p_uid may issue/hold/remove tickets on p_event_id: a global '
  'manager/admin, or an active leader/co_leader/assist_leader of any '
  'collective that hosts the event (event_hosts: primary + accepted '
  'co-hosts). Guarded like is_collective_staff - the identity argument is '
  'checked against auth.uid() / is_trusted_backend_caller, never the event.';

REVOKE ALL ON FUNCTION public.can_manage_event_tickets(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_event_tickets(uuid, uuid) TO authenticated, service_role;

COMMIT;
