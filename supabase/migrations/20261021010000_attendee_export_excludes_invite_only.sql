-- =====================================================================
-- Attendee export leaves out invite-only registrations.
-- =====================================================================
-- Organiser report via Tate, 2026-10-21: the leader attendee export with
-- the All filter returned the whole collective. Yarra Bend Bush Regen
-- (Melbourne City, 899 active members) exported 873 rows, 815 of them
-- 'invited' registrations written by the collective invite engine
-- (20260819130000) and the Invite button, which create one per active
-- member of the host collective. This function predates both (20260709)
-- and unioned every registration, so it handed each invitee's contact,
-- medical and emergency-contact fields to the leader's device.
--
-- Change: the registrations arm skips status 'invited'. An invited person
-- holding a ticket (an organiser hold sits at 'invited' until paid) still
-- arrives through the tickets arm. Built from the live pg_get_functiondef.
-- The client (1014b575) also drops invite-only rows, as a backstop.
--
-- Applied to production 2026-10-21 via pgq.sh under grant 068b173d.
-- Verified as authenticated admin: Yarra Bend 58, Wild Mountains 41,
-- Grampians 39 (no invites, unchanged). CREATE OR REPLACE keeps the ACL:
-- authenticated EXECUTE true, anon false.
CREATE OR REPLACE FUNCTION public.get_event_attendee_export(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_collective uuid; v_result jsonb;
BEGIN
  SELECT collective_id INTO v_collective FROM public.events WHERE id = p_event_id;
  IF v_collective IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF NOT (public.is_collective_staff(auth.uid(), v_collective) OR public.is_admin_or_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized to export attendees for this event';
  END IF;
  -- An 'invited' registration is an audience member, not an attendee: the
  -- collective invite engine and the Invite button write one for EVERY active
  -- member of the host collective. Leave them out so the export (and the
  -- medical / emergency fields it carries) covers only people who said yes.
  -- An invited person holding a ticket (an organiser hold sits at 'invited'
  -- until paid) still arrives through the tickets arm.
  WITH people AS (
    SELECT user_id FROM public.event_registrations WHERE event_id = p_event_id AND status <> 'invited'
    UNION SELECT user_id FROM public.event_tickets WHERE event_id = p_event_id
  ), latest_ticket AS (
    SELECT DISTINCT ON (user_id) user_id, status AS ticket_status, custom_answers, checked_in_at, created_at
    FROM public.event_tickets WHERE event_id = p_event_id
    ORDER BY user_id, CASE status WHEN 'confirmed' THEN 0 WHEN 'checked_in' THEN 0 WHEN 'reserved' THEN 1 WHEN 'pending' THEN 2 WHEN 'refunded' THEN 2 WHEN 'cancelled' THEN 3 ELSE 4 END, created_at DESC
  )
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_name) INTO v_result FROM (
    SELECT p.user_id, prof.first_name, prof.last_name, prof.display_name, prof.email, prof.phone, prof.postcode,
      prof.dietary_requirements, prof.medical_requirements, prof.emergency_contact_name, prof.emergency_contact_phone, prof.emergency_contact_relationship,
      reg.status::text AS registration_status, reg.registered_at, lt.ticket_status,
      COALESCE(lt.checked_in_at, reg.checked_in_at) AS checked_in_at, COALESCE(lt.custom_answers, '{}'::jsonb) AS custom_answers,
      lower(COALESCE(prof.first_name, prof.display_name, prof.email, '')) AS sort_name
    FROM people p
    LEFT JOIN public.profiles prof ON prof.id = p.user_id
    LEFT JOIN public.event_registrations reg ON reg.event_id = p_event_id AND reg.user_id = p.user_id
    LEFT JOIN latest_ticket lt ON lt.user_id = p.user_id
  ) r;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $function$;
