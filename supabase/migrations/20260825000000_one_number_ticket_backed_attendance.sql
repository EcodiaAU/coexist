-- =====================================================================
-- ONE NUMBER: ticket-backed attendance on a ticketed event.
-- =====================================================================
-- Origin: Tate 2026-08-25, off the Co-Exist team group chat. Kurt: "Is 28 not
-- too many people? I thought we were limiting to 25". Hannah needs a download
-- list that is actually correct. Angelica had already reported the same shape
-- twice (2026-07-09 Kieren, 2026-08-19 Wild Mountains).
--
-- ROOT CAUSE (probed live 2026-08-25, project tjutlbzekfouwsiaplbr):
-- Co-Exist keeps TWO independent ledgers for one question.
--   event_tickets       = the BUYING ledger
--   event_registrations = the RSVP ledger
-- On a ticketed event the registration is meant to be DERIVED from the ticket
-- (reconcile_ticket_membership does exactly that, and revoke / self-service /
-- cancel all route through it). Nothing ENFORCED it, so any client could write
-- a bare 'registered' row on a ticketed event, and each surface reconciled the
-- two ledgers its own way. Wild Mountains 2026-09-04 was live with FIVE
-- different true answers to "how many people are coming":
--   25  events.capacity                        ("we are limiting to 25")
--   25  registrations status registered        (the RSVP ledger)
--   26  event_going_count / event_spots_taken  (the ticket ledger, OVERSOLD)
--   28  leader roster + attendee export        (union of both ledgers)  <- Kurt
--   16  tickets actually paid for              (10 of the 26 are $0 comps)
-- Murbpook 2026-09-19 showed the same split: 14 on the roster, 9 with tickets.
--
-- The unguarded write paths that produced the ghost RSVPs (all client-side,
-- all bypassing the one guarded hook useRegisterForEvent):
--   src/pages/chat/chat-message-list.tsx      "Going" on an event announcement
--   src/pages/onboarding/steps/step-first-event.tsx   onboarding one-tap RSVP
--   src/lib/offline-sync.ts + check-in.tsx    waitlist promotion
-- 9 of the 10 live ghosts carried invited_at, i.e. the invite engine seeded the
-- row and the chat "Going" button upgraded it to registered with no ticket.
--
-- THE FIX IS STRUCTURAL, NOT ANOTHER PATCHED COUNT. There have been four
-- previous count patches (fix_going_count_backcompat, spots_taken_canonical,
-- going_count_ticket_aware, ticket_selfservice_holds) and the numbers still
-- disagreed, because each one fixed a READER while the WRITERS stayed open.
-- This migration closes the writers and collapses the readers to one function.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ENFORCEMENT: no registration without a ticket on a ticketed event.
-- ---------------------------------------------------------------------
-- One database object closes every client path at once, present and future.
-- This is the guarantee Tate asked for: "people shouldn't be able to
-- register/rsvp without buying a ticket".
--
-- Gated: 'registered' only. Deliberately NOT gated:
--   'attended'   physical ground truth. A door walk-in who really turned up is
--                recorded even with no ticket (public-event-check-in), and the
--                impact/attendance record must never be blocked by a paywall.
--   'invited'    occupies no seat, counts as nobody, seeds the invite engine.
--   'waitlisted' occupies no seat.
--   'cancelled'  the repair path has to stay open.
-- A ticket in ANY live state satisfies the gate ('pending' included) so the
-- checkout ordering used by create-checkout (reserve then register) still
-- works, and 'reserved' so an organiser hold that later converts is fine.
CREATE OR REPLACE FUNCTION public.enforce_ticket_backed_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_ticketed boolean;
  v_has_ticket  boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM 'registered' THEN
    RETURN NEW;
  END IF;

  -- Already registered and staying registered: this is an edit of some other
  -- column, not a new transition into the going set. Legacy rows must stay
  -- editable so the data repair can cancel them.
  IF TG_OP = 'UPDATE' AND OLD.status = 'registered' THEN
    RETURN NEW;
  END IF;

  SELECT e.is_ticketed INTO v_is_ticketed FROM events e WHERE e.id = NEW.event_id;
  IF v_is_ticketed IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM event_tickets t
    WHERE t.event_id = NEW.event_id
      AND t.user_id  = NEW.user_id
      AND t.status IN ('pending', 'confirmed', 'checked_in', 'reserved')
  ) INTO v_has_ticket;

  IF NOT v_has_ticket THEN
    RAISE EXCEPTION
      'This event is ticketed. A ticket is required before registering.'
      USING ERRCODE = 'check_violation',
            HINT = 'Buy or claim a ticket first. On a ticketed event the registration is derived from the ticket by reconcile_ticket_membership, never written directly.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ticket_backed_registration ON public.event_registrations;
CREATE TRIGGER trg_enforce_ticket_backed_registration
  BEFORE INSERT OR UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_backed_registration();


-- ---------------------------------------------------------------------
-- 2. Stop the RSVP-count capacity gate running on ticketed events.
-- ---------------------------------------------------------------------
-- handle_event_registration() is a BEFORE INSERT trigger that silently rewrites
-- an inserted status to 'waitlisted' once count(registered) >= events.capacity.
-- That is a THIRD capacity notion (registration rows), independent of both
-- events.capacity as displayed and event_ticket_types.capacity as enforced by
-- the buy gate. On a ticketed event it is actively wrong: it is what put a
-- PAID buyer on the waitlist (the Kieren case, Angelica 2026-07-09) and what
-- forced reserve_spot_for_user to skip writing a registration row entirely.
-- On a ticketed event capacity belongs to the ticket gate alone.
CREATE OR REPLACE FUNCTION public.handle_event_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_capacity integer;
  current_count  integer;
  v_is_ticketed  boolean;
BEGIN
  SELECT capacity, is_ticketed INTO event_capacity, v_is_ticketed
  FROM events WHERE id = NEW.event_id;

  -- Ticketed events: the ticket gate owns capacity. Never auto-waitlist here.
  IF v_is_ticketed IS TRUE THEN
    RETURN NEW;
  END IF;

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
$$;


-- ---------------------------------------------------------------------
-- 3. ONE display number, everywhere, authed and non-authed alike.
-- ---------------------------------------------------------------------
-- Two live RPCs disagreed by construction:
--   event_going_count  = pending(non-stale) + confirmed + checked_in   (no reserved)
--   event_spots_taken  = confirmed + checked_in + reserved             (no pending)
-- Both were fetched on the SAME event-detail render, so an event with an
-- organiser hold or an in-flight checkout showed two different truths on one
-- screen. event_spots_taken is the correct display semantic: a seat is taken
-- when it is confirmed, checked in, or deliberately held. A 'pending' row is an
-- unfinished checkout, not an attendee, and inventory holding for the buy gate
-- is a SEPARATE and correctly wider question already answered by
-- get_event_ticket_availability + reserve_event_ticket.
--
-- event_going_count now DELEGATES rather than being deleted, so every existing
-- caller (event detail, public event page, home feed, native app builds still
-- on an older bundle) converges on the one number with no client change and no
-- version skew between the web deploy and installed apps.
CREATE OR REPLACE FUNCTION public.event_going_count(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.event_spots_taken(p_event_id);
$$;

REVOKE ALL ON FUNCTION public.event_going_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.event_going_count(uuid) TO authenticated, anon;


-- ---------------------------------------------------------------------
-- 4. Capacity cannot be two numbers either.
-- ---------------------------------------------------------------------
-- events.capacity is what the event page and the team quote ("limiting to 25").
-- event_ticket_types.capacity is what the buy gate actually enforces. Nothing
-- tied them together, so Murbpook 2026-09-19 shipped with event capacity 15 and
-- ticket-type capacity 18: the page promised 15 spots while the till would have
-- sold 18. Total ticket-type capacity for an event may not exceed the event's.
CREATE OR REPLACE FUNCTION public.enforce_ticket_type_capacity_fits_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_capacity integer;
  v_other_capacity integer;
BEGIN
  IF NEW.capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO v_event_capacity FROM events WHERE id = NEW.event_id;
  IF v_event_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(capacity), 0) INTO v_other_capacity
  FROM event_ticket_types
  WHERE event_id = NEW.event_id
    AND is_active = true
    AND id <> NEW.id
    AND capacity IS NOT NULL;

  IF v_other_capacity + NEW.capacity > v_event_capacity THEN
    RAISE EXCEPTION
      'Ticket capacity (% across active types) exceeds the event capacity of %.',
      v_other_capacity + NEW.capacity, v_event_capacity
      USING ERRCODE = 'check_violation',
            HINT = 'Raise the event capacity first, or lower this ticket type.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_type_capacity_fits_event ON public.event_ticket_types;
CREATE TRIGGER trg_ticket_type_capacity_fits_event
  BEFORE INSERT OR UPDATE OF capacity, is_active, event_id ON public.event_ticket_types
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_type_capacity_fits_event();


-- ---------------------------------------------------------------------
-- 5. Make the discrepancy VISIBLE instead of silently counted.
-- ---------------------------------------------------------------------
-- The leader roster treated "active registration, no valid ticket" as GOING,
-- grandfathering an Eventbrite import. That rule is what turned 2 ghost RSVPs
-- into Kurt's 28. Rather than silently dropping those people (Hannah would lose
-- them off her list) or silently counting them (Kurt over-caters), the app now
-- names them. This RPC is the roster's reconciliation source of truth.
CREATE OR REPLACE FUNCTION public.event_attendance_reconciliation(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'event_id', p_event_id,
    'is_ticketed', (SELECT is_ticketed FROM events WHERE id = p_event_id),
    'capacity', (SELECT capacity FROM events WHERE id = p_event_id),
    -- THE number. Same one every surface renders.
    'spots_taken', public.event_spots_taken(p_event_id),
    'tickets_paid', COALESCE((
      SELECT SUM(quantity)::int FROM event_tickets
      WHERE event_id = p_event_id AND status IN ('confirmed','checked_in')
        AND price_cents > 0), 0),
    'tickets_comped', COALESCE((
      SELECT SUM(quantity)::int FROM event_tickets
      WHERE event_id = p_event_id AND status IN ('confirmed','checked_in')
        AND price_cents = 0), 0),
    'tickets_held', COALESCE((
      SELECT SUM(quantity)::int FROM event_tickets
      WHERE event_id = p_event_id AND status = 'reserved'), 0),
    -- People the roster used to count as going who never bought anything.
    'registered_without_ticket', COALESCE((
      SELECT count(*)::int FROM event_registrations r
      WHERE r.event_id = p_event_id
        AND r.status = 'registered'
        AND NOT EXISTS (
          SELECT 1 FROM event_tickets t
          WHERE t.event_id = r.event_id AND t.user_id = r.user_id
            AND t.status IN ('pending','confirmed','checked_in','reserved'))), 0),
    'over_capacity_by', GREATEST(0,
      public.event_spots_taken(p_event_id)
      - COALESCE((SELECT capacity FROM events WHERE id = p_event_id), 2147483647))
  );
$$;

REVOKE ALL ON FUNCTION public.event_attendance_reconciliation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.event_attendance_reconciliation(uuid) TO authenticated;
