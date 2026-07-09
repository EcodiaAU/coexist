-- =====================================================================
-- Comprehensive attendee export RPC
-- =====================================================================
-- Origin: Tate 2026-07-09. "Everything regarding ticketed events must be
-- exportable." Replaces the checked-in-only export builder with ONE source
-- of truth: every person who holds a registration OR a ticket for the event,
-- across all states, with full contact + dietary + medical + emergency +
-- custom question answers.
--
-- SECURITY DEFINER so a collective leader can read their own event's
-- registrant profiles without a broad profiles SELECT grant. Authorized to
-- staff of the event's owning collective (leader / co_leader / assist_leader
-- via is_collective_staff) or an admin/national staff (is_admin_or_staff).
-- The live schema has a single owning collective per event (no event_collectives
-- junction exists in prod as of 2026-07-09); if a multi-host model lands later,
-- widen the authz check here.
--
-- One row per user (deduped), with the most-relevant ticket chosen (confirmed
-- beats pending beats refunded beats cancelled), carrying custom_answers so the
-- export layer can emit one column per active question.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_event_attendee_export(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_collective uuid;
  v_result jsonb;
BEGIN
  SELECT collective_id INTO v_collective FROM public.events WHERE id = p_event_id;
  IF v_collective IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT (
    public.is_collective_staff(auth.uid(), v_collective)
    OR public.is_admin_or_staff(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to export attendees for this event';
  END IF;

  WITH people AS (
    SELECT user_id FROM public.event_registrations WHERE event_id = p_event_id
    UNION
    SELECT user_id FROM public.event_tickets WHERE event_id = p_event_id
  ),
  latest_ticket AS (
    SELECT DISTINCT ON (user_id)
      user_id, status AS ticket_status, custom_answers, checked_in_at, created_at
    FROM public.event_tickets
    WHERE event_id = p_event_id
    ORDER BY user_id,
      CASE status
        WHEN 'confirmed'  THEN 0
        WHEN 'checked_in' THEN 0
        WHEN 'pending'    THEN 1
        WHEN 'refunded'   THEN 2
        WHEN 'cancelled'  THEN 3
        ELSE 4
      END,
      created_at DESC
  )
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_name) INTO v_result
  FROM (
    SELECT
      p.user_id,
      prof.first_name,
      prof.last_name,
      prof.display_name,
      prof.email,
      prof.phone,
      prof.postcode,
      prof.dietary_requirements,
      prof.medical_requirements,
      prof.emergency_contact_name,
      prof.emergency_contact_phone,
      prof.emergency_contact_relationship,
      reg.status::text        AS registration_status,
      reg.registered_at,
      lt.ticket_status,
      COALESCE(lt.checked_in_at, reg.checked_in_at) AS checked_in_at,
      COALESCE(lt.custom_answers, '{}'::jsonb)      AS custom_answers,
      lower(COALESCE(prof.first_name, prof.display_name, prof.email, '')) AS sort_name
    FROM people p
    LEFT JOIN public.profiles prof ON prof.id = p.user_id
    LEFT JOIN public.event_registrations reg
      ON reg.event_id = p_event_id AND reg.user_id = p.user_id
    LEFT JOIN latest_ticket lt ON lt.user_id = p.user_id
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_attendee_export(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_event_attendee_export(uuid) TO authenticated;
