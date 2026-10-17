-- ============================================================================
-- A leader on an old app bundle can cancel an event again.
--
-- Reported 2026-10-17 (Brandon Marlow, Adelaide leader, by text to Tate):
-- "The Adelaide Brownhill hike was cancelled. However, it wouldn't let me
-- cancel the event." Event 2d64081b-26c0-477e-8c7e-8e96f229db8a.
--
-- Root cause: his phone runs a bundle from before 2026-08-11 (4f89f42c), whose
-- useCancelEvent does a direct client write instead of calling cancel-event:
--     supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
-- 20261009120000 made cancelled events readable by admins only. Postgres checks
-- an UPDATE's new row against the SELECT policies whenever the statement reads
-- the row (the id filter does), so for a non-admin leader that write now fails
-- 42501 "new row violates row-level security policy" (HTTP 403). Seen live in
-- edge_logs: PATCH /rest/v1/events?id=eq.2d64081b... 403 at 2026-10-10T21:44:05Z
-- and 21:44:30Z from his device, and no cancel-event call at all.
-- Current bundles call cancel-event (service role) and were never affected.
--
-- Fix, without loosening 20261009120000 for reads:
--   1. events_select_cancelled_inside_patch: a SELECT policy that only exists
--      inside a PostgREST PATCH (request.method), for the people
--      events_update_leader already lets write the row. The legacy cancel
--      passes its new-row check. Every GET, HEAD and RPC read still hides a
--      cancelled event from non-admins. request.method is unset outside
--      PostgREST (psql, pg_cron), so the policy is inert there.
--   2. guard_direct_event_update (BEFORE UPDATE, skipped for trusted backend
--      callers such as cancel-event and pg_cron):
--        a. a non-admin may not edit an event that is already cancelled. They
--           could not reach one since 20261009120000; policy 1 would otherwise
--           let a PATCH un-cancel or edit it.
--        b. a direct client cancel is refused while the event has live tickets,
--           because only cancel-event refunds paid tickets and releases holds.
--           A stale bundle can cancel a free event; a ticketed one needs the
--           current app.
-- ============================================================================

CREATE POLICY events_select_cancelled_inside_patch
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    status = 'cancelled'::event_status
    AND current_setting('request.method', true) = 'PATCH'
    AND (
      created_by = auth.uid()
      OR is_collective_leader_or_above(auth.uid(), collective_id)
    )
  );

COMMENT ON POLICY events_select_cancelled_inside_patch ON public.events IS
  'Legacy-bundle cancel path (pre 2026-08-11 apps PATCH status=cancelled directly). Lets the new-row check pass inside a PATCH only; reads stay admin-only per 20261009120000. Paired with trg_guard_direct_event_update. See 20261017060000.';

CREATE OR REPLACE FUNCTION public.guard_direct_event_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_trusted_backend_caller() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelled'::event_status
     AND NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'This event has been cancelled and can no longer be edited.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'cancelled'::event_status
     AND OLD.status IS DISTINCT FROM 'cancelled'::event_status
     AND EXISTS (
       SELECT 1 FROM public.event_tickets t
       WHERE t.event_id = NEW.id
         AND t.status IN ('pending', 'confirmed', 'checked_in', 'reserved')
     ) THEN
    RAISE EXCEPTION 'This event has tickets. Update the Co-Exist app, then cancel it again so ticket holders are refunded.'
      USING ERRCODE = 'P0001',
            HINT = 'Ticketed events are cancelled through the cancel-event function.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_direct_event_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_direct_event_update
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_direct_event_update();
