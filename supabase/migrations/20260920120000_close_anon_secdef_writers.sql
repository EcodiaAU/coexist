-- 20260920120000_close_anon_secdef_writers.sql
--
-- Close the anon-reachable SECURITY DEFINER writers on Co-Exist production and put
-- every EXECUTE grant in this class on the record rather than inheriting it from
-- PUBLIC. Raised on EcodiaOS status_board 6e96cea5, open since 2026-09-04, behaviourally
-- re-triaged 2026-09-20.
--
-- WHY A REVOKE NAMING anon IS NOT ENOUGH. Every function below carries BOTH ACL arms:
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- The leading "=X" is the PUBLIC grant, and PUBLIC includes anon independently of the
-- explicit anon entry, so `REVOKE ... FROM anon` alone leaves the function callable and
-- the ACL reads almost identical to a correct revoke. Every statement here revokes from
-- PUBLIC first and then re-grants, by name, exactly the roles the app actually uses.
-- Doctrine: patterns/a-revoke-naming-roles-leaves-public-executing-2026-09-04.md
--
-- WHAT WAS ACTUALLY OPEN, measured rather than assumed. Each function was CALLED on
-- production inside a read_only=true transaction with no jwt claims, so auth.uid() was
-- NULL and Postgres refused any write itself (SQLSTATE 25006). Zero writes were made.
--   REACHED A WRITE (the finding):
--     award_points                      -> 25006 at line 8, INSERT INTO points_ledger
--     invite_collective_to_event        -> 25006 at line 4, INSERT INTO event_invites
--     handle_announcement_rsvp          -> 25006 at line 21, INSERT INTO event_registrations
--   GUARD ALREADY REJECTS AN ANON CALLER (so these were FALSE POSITIVES of the lexical
--   polarity scan, and are tightened here only as defence in depth):
--     invite_collective_to_collaborate  -> P0001 Forbidden: only leaders of the host collective
--     respond_to_collaboration          -> P0001 Forbidden: only leaders of the invited collective
--     save_carpool_seat                 -> 28000 authentication required
--   ANON BY DESIGN, left callable and documented:
--     join_event_waitlist, leave_event_waitlist, unsubscribe_by_email, resubscribe_by_email
--
-- SEVERITY, so the ordering here is not mistaken for equal weight. award_points takes the
-- recipient as a PARAMETER (p_user_id), so the NOT NULL constraint on points_ledger.user_id
-- does not stop an unauthenticated caller: anyone could mint reward points onto any account.
-- invite_collective_to_event writes invited_by = auth.uid() into a NULLABLE column and then
-- mass-inserts event_registrations and notifications for every active member of any
-- collective, so an unauthenticated caller could spam the whole membership.
-- handle_announcement_rsvp writes user_id = auth.uid() into a NOT NULL column, so an anon
-- call dies on the constraint: it is reachable, and it is the mildest of the three.
--
-- BODIES ARE RE-CREATED FROM THE LIVE CATALOG, NOT FROM THIS REPO'S MIGRATIONS.
-- supabase_migrations.schema_migrations has drifted from supabase/migrations both ways
-- (97 versions on disk with no ledger row, 2026-09-04), so the repo text is not what is
-- running. Each body below was read out of pg_proc.prosrc on tjutlbzekfouwsiaplbr on
-- 2026-09-20 and is reproduced verbatim except for the guard change called out in place.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. award_points - THE CRITICAL ONE. The guard was INVERTED.
--
-- It read:  IF auth.uid() IS NOT NULL AND NOT is_admin_or_staff(auth.uid()) THEN RAISE
-- For an unauthenticated caller auth.uid() is NULL, the AND short-circuits to false, the
-- exception never fires, and the INSERT plus UPDATE run. The guard refused logged-in
-- non-admins and admitted the anonymous one.
--
-- The replacement is stated POSITIVELY so there is no polarity to invert: name who may
-- call, and reject everyone else. It admits the two callers that exist and nothing else.
--   service_role  - the only real caller. supabase/functions/stripe-webhook/index.ts and
--                   stripe-webhook-test build their client with SUPABASE_SERVICE_ROLE_KEY,
--                   which sets the role GUC to service_role, so is_trusted_backend_caller()
--                   returns true. There is no browser caller: `rpc('award_points'` does not
--                   appear anywhere under src/, and no other function body on the database
--                   names it (a pg_proc.prosrc sweep returned 1 body, its own, against a
--                   positive control of 18 in-database callers for is_admin_or_staff).
--   an admin      - preserved from the old intent, via is_admin_or_staff(auth.uid()),
--                   which itself returns false for a NULL uid (probed on production).
--
-- p_event_id KEEPS ITS DEFAULT, and the first apply attempt is how that was learned.
-- The live function is award_points(p_user_id, p_amount, p_reason, p_event_id DEFAULT
-- NULL::uuid). Written without the default, this whole transaction aborts on
-- 42P13 "cannot remove parameter defaults from existing function", which is Postgres
-- refusing to let a CREATE OR REPLACE silently break the three-argument call shape.
-- The check that misses this is pg_get_function_identity_arguments, which is what a
-- signature comparison reaches for and which deliberately omits defaults; the one that
-- sees it is pg_get_function_arguments, or pronargdefaults. Of the eight functions here
-- five carry defaults and only this one is also rewritten.
CREATE OR REPLACE FUNCTION public.award_points(
  p_user_id uuid, p_amount integer, p_reason text, p_event_id uuid DEFAULT NULL::uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  -- Fail CLOSED. An unauthenticated caller is neither a trusted backend nor an admin,
  -- so it lands here rather than skipping the check the way the old polarity allowed.
  IF NOT (public.is_trusted_backend_caller() OR public.is_admin_or_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden: award_points is restricted to admin/internal use'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO points_ledger (user_id, amount, reason, event_id)
  VALUES (p_user_id, p_amount, p_reason, p_event_id);

  UPDATE profiles
  SET points = points + p_amount, updated_at = now()
  WHERE id = p_user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.award_points(uuid, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_points(uuid, integer, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.award_points(uuid, integer, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.award_points(uuid, integer, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. invite_collective_to_event - no authorization check of any kind, and no
--    search_path pin. Both fixed here.
--
-- SCOPE NOTE, deliberately conservative. The right long-term guard is "the caller leads
-- the collective hosting p_event_id", the way invite_collective_to_collaborate does it,
-- but this function takes no host collective and inferring the host would be a behaviour
-- change guessed at rather than verified. It has NO caller: nothing under src/ calls it,
-- and no other function body names it. So this migration closes the anon hole it actually
-- has and leaves the host-authorisation question boarded rather than answered by guess.
CREATE OR REPLACE FUNCTION public.invite_collective_to_event(
  p_event_id uuid, p_collective_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  -- Added 2026-09-20: this function had no guard at all, so an unauthenticated caller
  -- reached the first INSERT and could register and notify every active member of any
  -- collective.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  -- Create event invite record
  INSERT INTO event_invites (event_id, collective_id, invited_by)
  VALUES (p_event_id, p_collective_id, auth.uid())
  ON CONFLICT (event_id, collective_id) DO NOTHING;

  -- Create registration entries with invited status for all active members
  INSERT INTO event_registrations (event_id, user_id, status, invited_at)
  SELECT p_event_id, cm.user_id, 'invited', now()
  FROM collective_members cm
  WHERE cm.collective_id = p_collective_id AND cm.status = 'active'
  ON CONFLICT (event_id, user_id) DO NOTHING;

  -- Notify all members
  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT cm.user_id, 'event_invite',
    'You''re invited to an event!',
    'Your collective has been invited to join an event.',
    jsonb_build_object('event_id', p_event_id, 'collective_id', p_collective_id)
  FROM collective_members cm
  WHERE cm.collective_id = p_collective_id AND cm.status = 'active';
END;
$fn$;

REVOKE ALL ON FUNCTION public.invite_collective_to_event(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_collective_to_event(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.invite_collective_to_event(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. handle_announcement_rsvp - reachable with no caller identity. It writes
--    user_id = auth.uid() into NOT NULL columns, so an anon call errored on the
--    constraint rather than corrupting data, but reaching a write at all is the defect.
--    Guard added; body otherwise verbatim from the live catalog.
CREATE OR REPLACE FUNCTION public.handle_announcement_rsvp(
  p_event_id uuid, p_response text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_event    record;
  v_existing record;
  v_status   registration_status;
  v_result   jsonb;
BEGIN
  -- Added 2026-09-20. Every write below keys on auth.uid(); with no caller there is no
  -- row to write and the function has no business running.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

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

    -- The capacity trigger may have demoted this to 'waitlisted'.
    SELECT status INTO v_status
    FROM event_registrations
    WHERE event_id = p_event_id AND user_id = auth.uid();

    v_result := jsonb_build_object(
      'action', CASE WHEN v_status = 'waitlisted' THEN 'waitlisted' ELSE 'registered' END,
      'status', v_status,
      'event_title', v_event.title
    );

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
$fn$;

REVOKE ALL ON FUNCTION public.handle_announcement_rsvp(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_announcement_rsvp(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.handle_announcement_rsvp(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The three whose in-body guards ALREADY reject an anonymous caller. No body is
--    touched: each was probed on production and answered with its own refusal, so
--    rewriting them would risk a working guard for no gain. What is fixed is the ACL,
--    because the PUBLIC arm means a future bare CREATE OR REPLACE that drops a guard
--    re-opens the function silently, and because an ACL should state the intent rather
--    than inherit it.
REVOKE ALL ON FUNCTION public.invite_collective_to_collaborate(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_collective_to_collaborate(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.invite_collective_to_collaborate(uuid, uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.respond_to_collaboration(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_collaboration(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_to_collaboration(uuid, boolean) TO authenticated, service_role;

-- save_carpool_seat is reached through the carpool-save-seat Edge Function, which
-- forwards the PASSENGER's own JWT so auth.uid() is the passenger, so it needs
-- authenticated and has never needed anon. Its own migrations only ever granted
-- authenticated; the anon reachability came entirely from the PUBLIC arm.
REVOKE ALL ON FUNCTION public.save_carpool_seat(uuid, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_carpool_seat(uuid, text, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_carpool_seat(uuid, text, numeric, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The genuinely anonymous flows. These KEEP anon, and the point of touching them is
--    to drop the PUBLIC arm so the grant is explicit and auditable instead of inherited.
--    Behaviour is unchanged for every caller.
--
--    join_event_waitlist  - src/hooks/use-event-waitlist.ts, public sold-out event page.
--                           Validates email shape, bounds quantity to 1..10, and refuses
--                           unless the event exists, is ticketed, is published, has not
--                           happened, is genuinely full, and the caller holds no ticket.
--    leave_event_waitlist - the same page's undo. Already reasons about anonymity: an
--                           anonymous caller may only remove a row that has no user_id,
--                           so knowing a member's address is not enough to drop them.
REVOKE ALL ON FUNCTION public.join_event_waitlist(uuid, text, text, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_event_waitlist(uuid, text, text, integer, uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.leave_event_waitlist(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_event_waitlist(uuid, text) TO anon, authenticated, service_role;

COMMIT;
