-- Per-event group chat toggle (Tate, 2026-09-24).
--
-- Tate: add a toggle at event creation that turns "create a group chat for
-- everyone registered to this event" on or off. Camp-outs already get one
-- automatically; this GENERALISES that mechanism rather than building a second
-- one. First real use: the Brisbane collective's North Stradbroke Island Trip
-- (a clean-up, not ticketed, ~25 going through event_registrations), which
-- Hannah (the collective leader) wants a chat for and Jess switches on.
--
-- DESIGN DECISIONS, each measured on production before it was made:
--
--   * The chat REUSES chat_channels.type = 'campout'. Every consumer of the
--     per-event chat keys on that type: RLS on event photos, the carpool
--     widget edge function, the channel broadcast push, national-role seeding,
--     the chat list and the event page card. A new type would have meant
--     widening chat_channels_type_check and re-proving each of them. The
--     client derives the label from events.activity_type instead, so a
--     non-camp-out event's chat reads "Event group chat", not "Campout".
--
--   * Camp-out membership stays TICKET-driven and is not touched. Unioning
--     registrations into the camp-out path was measured first: on the 7 live
--     camp-out channels it would ADD 3 people (Myall Park, Aug 2026, going
--     registrations with no live ticket) to a paid chat. So registrations feed
--     ONLY a toggle-driven chat: group_chat_enabled AND activity <> camp_out.
--
--   * Going = registration status IN ('registered', 'attended'). 'invited'
--     (8,077 rows) and 'waitlisted' (12 on the Straddie trip alone) are NOT
--     going and never land in the chat.
--
--   * The host collective's ACTIVE leader / co_leader / assist_leader are
--     members of a toggle-driven chat. chat_channels_select is members OR
--     is_admin_or_staff, and a collective leader is neither, so without this
--     the organiser is locked out of her own event's chat: Hannah is the
--     Brisbane leader and holds NO registration on the Straddie trip. Same
--     role and status filter as sync_collective_staff_channels.
--
--   * Switching the toggle OFF never destroys history. A chat with any message
--     or carpool is ARCHIVED (lifecycle_status = 'archived', hidden in the app);
--     an empty one (switched on by mistake) is removed. Switching it back on
--     revives the archived chat with its history.
--
-- Removal, from every path, asks ONE question: _event_chat_wants_member. A
-- national, a live ticket holder, a going registrant (toggle-driven chats) or
-- an active host leader (toggle-driven chats) is never dropped.

-- 1. The toggle ------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS group_chat_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.group_chat_enabled IS
  'Organiser toggle: when true and the event is published, a group chat (chat_channels type campout) is kept for everyone going (registered/attended), the host collective leaders and national staff. Camp-outs always have one regardless.';

-- 2. Who belongs in an event's group chat -----------------------------------

CREATE OR REPLACE FUNCTION public._event_chat_wants_member(p_event uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- National staff sit in every event chat (existing camp-out rule).
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = p_user AND public._is_national_role(pr.role::text)
    )
    -- A live ticket (existing camp-out rule).
    OR EXISTS (
      SELECT 1 FROM public.event_tickets t
      WHERE t.event_id = p_event AND t.user_id = p_user
        AND t.status IN ('confirmed', 'checked_in')
    )
    -- Toggle-driven chats only: going registrants and the host leaders.
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event
        AND e.group_chat_enabled IS TRUE
        AND COALESCE(e.activity_type::text, '') <> 'camp_out'
        AND (
          EXISTS (
            SELECT 1 FROM public.event_registrations r
            WHERE r.event_id = p_event AND r.user_id = p_user
              AND r.status IN ('registered', 'attended')
          )
          OR EXISTS (
            SELECT 1 FROM public.collective_members cm
            WHERE cm.collective_id = e.collective_id AND cm.user_id = p_user
              AND cm.status = 'active'
              AND cm.role IN ('leader', 'co_leader', 'assist_leader')
          )
        )
    )
$function$;

-- 3. Create / heal / revive the chat ----------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_campout_chat_channel(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event      public.events;
  v_channel    uuid;
  v_lifecycle  text;
  v_title      text;
  v_reg_driven boolean;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A camp-out always has a chat. Any other event has one only when the
  -- organiser switched group_chat_enabled on, and its membership then follows
  -- registrations rather than tickets.
  v_reg_driven := COALESCE(v_event.activity_type::text, '') <> 'camp_out'
                  AND v_event.group_chat_enabled IS TRUE;

  IF COALESCE(v_event.activity_type::text, '') <> 'camp_out' AND NOT v_reg_driven THEN
    RETURN NULL;
  END IF;

  IF v_event.status <> 'published' THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_event.date_end, v_event.date_start) < now() - INTERVAL '7 days' THEN
    RETURN NULL;
  END IF;

  v_title := btrim(COALESCE(v_event.title, ''));

  SELECT id, lifecycle_status INTO v_channel, v_lifecycle
  FROM public.chat_channels
  WHERE event_id = p_event_id AND type = 'campout'
  LIMIT 1;

  IF v_channel IS NULL THEN
    INSERT INTO public.chat_channels (type, event_id, collective_id, name)
    VALUES ('campout', p_event_id, NULL, v_title)
    RETURNING id INTO v_channel;
  ELSE
    -- THE HEAL. Unconditional on which column the caller edited, so a chat
    -- whose event was renamed before this rule existed catches up the next
    -- time anything touches the event.
    UPDATE public.chat_channels
    SET name = v_title
    WHERE id = v_channel
      AND name IS DISTINCT FROM v_title;

    -- THE REVIVE. A toggle-driven chat archived by switching the toggle off
    -- comes back, history intact, when it is switched on again.
    IF v_reg_driven AND v_lifecycle = 'archived' THEN
      UPDATE public.chat_channels
      SET lifecycle_status = 'open'
      WHERE id = v_channel;
    END IF;
  END IF;

  INSERT INTO public.chat_channel_members (channel_id, user_id)
  SELECT v_channel, t.user_id
  FROM public.event_tickets t
  WHERE t.event_id = p_event_id
    AND t.status IN ('confirmed', 'checked_in')
    AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = t.user_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.chat_channel_members (channel_id, user_id)
  SELECT v_channel, p.id
  FROM public.profiles p
  WHERE public._is_national_role(p.role::text)
  ON CONFLICT DO NOTHING;

  IF v_reg_driven THEN
    -- Everyone going. Never 'invited' or 'waitlisted'.
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT v_channel, r.user_id
    FROM public.event_registrations r
    WHERE r.event_id = p_event_id
      AND r.status IN ('registered', 'attended')
      AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = r.user_id)
    ON CONFLICT DO NOTHING;

    -- The organisers: the host collective's active leadership team.
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT v_channel, cm.user_id
    FROM public.collective_members cm
    WHERE cm.collective_id = v_event.collective_id
      AND cm.status = 'active'
      AND cm.role IN ('leader', 'co_leader', 'assist_leader')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_channel;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_ensure_campout_chat_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Toggle switched OFF on a non-camp-out event. ensure_campout_chat_channel
  -- returns early for such an event, so the off transition is handled here.
  -- A chat with any message or carpool is archived (never deleted); an empty
  -- one, switched on by mistake, is removed.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.group_chat_enabled IS TRUE
       AND NEW.group_chat_enabled IS NOT TRUE
       AND COALESCE(NEW.activity_type::text, '') <> 'camp_out' THEN
      DELETE FROM public.chat_channels cc
      WHERE cc.event_id = NEW.id
        AND cc.type = 'campout'
        AND NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.channel_id = cc.id)
        AND NOT EXISTS (SELECT 1 FROM public.carpool_widgets w WHERE w.channel_id = cc.id);

      UPDATE public.chat_channels
      SET lifecycle_status = 'archived'
      WHERE event_id = NEW.id
        AND type = 'campout'
        AND lifecycle_status IS DISTINCT FROM 'archived';
    END IF;
  END IF;

  PERFORM public.ensure_campout_chat_channel(NEW.id);
  RETURN NEW;
END;
$function$;

-- 4. Registrations keep a toggle-driven chat current ------------------------

CREATE OR REPLACE FUNCTION public.sync_event_group_chat_member(p_event uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_channel uuid;
BEGIN
  IF p_event IS NULL OR p_user IS NULL THEN
    RETURN;
  END IF;

  -- Camp-out chats stay ticket-driven (reconcile_ticket_membership). Only a
  -- toggle-driven chat follows registrations.
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event
      AND e.group_chat_enabled IS TRUE
      AND COALESCE(e.activity_type::text, '') <> 'camp_out'
  ) THEN
    RETURN;
  END IF;

  -- No open chat yet (a draft, or not published): ensure seeds everyone on
  -- publish, so there is nothing to do here.
  SELECT id INTO v_channel
  FROM public.chat_channels
  WHERE event_id = p_event AND type = 'campout' AND lifecycle_status = 'open'
  LIMIT 1;
  IF v_channel IS NULL THEN
    RETURN;
  END IF;

  IF public._event_chat_wants_member(p_event, p_user) THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT v_channel, p_user
    WHERE EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_user)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM public.chat_channel_members
    WHERE channel_id = v_channel AND user_id = p_user;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_event_registration_group_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_event_group_chat_member(OLD.event_id, OLD.user_id);
    RETURN OLD;
  END IF;

  -- A registration that moved event or person is reconciled on both sides.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.event_id IS DISTINCT FROM NEW.event_id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM public.sync_event_group_chat_member(OLD.event_id, OLD.user_id);
    END IF;
  END IF;

  -- Reads NEW.status as stored, so a claim handle_event_registration demoted
  -- to 'waitlisted' is not added.
  PERFORM public.sync_event_group_chat_member(NEW.event_id, NEW.user_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_event_registration_group_chat ON public.event_registrations;
CREATE TRIGGER trg_event_registration_group_chat
  AFTER INSERT OR DELETE OR UPDATE OF status, event_id, user_id ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.tg_event_registration_group_chat();

-- 5. The ticket path and the national demote path ask the same question -----

-- Unchanged except the chat removal, which now spares anyone who still
-- belongs for another reason (a national who refunds a ticket used to be
-- dropped from the chat until the next event edit re-seeded them).
CREATE OR REPLACE FUNCTION public.reconcile_ticket_membership(p_event uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_channel uuid;
  v_valid   int;
begin
  select count(*) into v_valid
  from public.event_tickets
  where event_id = p_event
    and user_id = p_user
    and status in ('confirmed', 'checked_in');

  select id into v_channel
  from public.chat_channels
  where event_id = p_event and type = 'campout'
  limit 1;

  if v_valid > 0 then
    -- Has at least one valid ticket: ensure chat membership + active registration.
    if v_channel is not null then
      insert into public.chat_channel_members (channel_id, user_id)
      values (v_channel, p_user)
      on conflict (channel_id, user_id) do nothing;
    end if;

    -- RESTORE path. A cancelled / waitlisted / invited registration is lifted
    -- back to 'registered' the moment a valid ticket exists again. 'attended'
    -- is never downgraded (they physically turned up; that is ground truth).
    insert into public.event_registrations (event_id, user_id, status, registered_at)
    values (p_event, p_user, 'registered', now())
    on conflict (event_id, user_id) do nothing;

    update public.event_registrations
      set status = 'registered'
      where event_id = p_event
        and user_id = p_user
        and status is distinct from 'attended'
        and status is distinct from 'registered';
  else
    -- No valid ticket left: remove from chat + cancel the ticket-derived
    -- registration. This only runs for users who held a ticket (callers pass
    -- (event, user) drawn from event_tickets), so pure walk-in / comp
    -- registrations that never had a ticket are never touched.
    -- The removal spares anyone who still belongs for another reason
    -- (_event_chat_wants_member: national, host leader, going registrant on a
    -- toggle-driven chat). The registration update below then re-asks the
    -- question through trg_event_registration_group_chat.
    if v_channel is not null then
      delete from public.chat_channel_members
      where channel_id = v_channel and user_id = p_user
        and not public._event_chat_wants_member(p_event, p_user);
    end if;

    -- 'attended' is ground truth (they physically turned up) and is never
    -- downgraded in EITHER direction, matching the restore path above. A refund
    -- of a checked-in attendee's ticket must not erase the attendance record.
    update public.event_registrations
      set status = 'cancelled'
      where event_id = p_event and user_id = p_user
        and status <> 'cancelled'
        and status <> 'attended';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_national_role_to_campout_channels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public._is_national_role(NEW.role::text)
     AND NOT public._is_national_role(COALESCE(OLD.role::text, 'participant')) THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT cc.id, NEW.id
    FROM public.chat_channels cc
    WHERE cc.type = 'campout'
    ON CONFLICT DO NOTHING;
  END IF;

  -- Demoted: drop them from event chats they no longer belong in. For a
  -- camp-out that is still "no live ticket"; a toggle-driven chat also keeps a
  -- going registrant or an active host leader.
  IF NOT public._is_national_role(NEW.role::text)
     AND public._is_national_role(COALESCE(OLD.role::text, 'participant')) THEN
    DELETE FROM public.chat_channel_members ccm
    USING public.chat_channels cc
    WHERE ccm.channel_id = cc.id
      AND cc.type = 'campout'
      AND ccm.user_id = NEW.id
      AND NOT public._event_chat_wants_member(cc.event_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- 6. Grants -----------------------------------------------------------------
-- The two helpers read other people's registrations and write memberships, so
-- no client role may call them directly. Triggers call them as the owner.

REVOKE ALL ON FUNCTION public._event_chat_wants_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_event_group_chat_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._event_chat_wants_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_event_group_chat_member(uuid, uuid) TO service_role;
