-- ============================================================================
-- A campout group chat must FOLLOW its event: name from the event's title,
-- membership complete, and every national-role admin able to see it.
--
-- Origin: Angelica Choppin 2026-09-18, a paid Wild Mountains attendee who could
-- not reach her event or its group chat, plus Tate the same morning: "the
-- groupchat itself i cant even see and it might not have automatically updated
-- to use the right background image and title since they changed it from the
-- generic wildmountains one since its a special camp. The gorupchats for
-- campouts need to auto pull from the actual events and everyone should be in
-- the groupchat."
--
-- MEASURED BEFORE WRITING THIS, because two thirds of that report were already
-- working and "fixing" them would have done harm:
--
--   * MEMBERSHIP IS ALREADY COMPLETE for people actually coming. Across all
--     four live campouts, ticket holders missing from their chat = 0, and
--     registrants missing = 0. Murbpook looks like a 134-person hole only if
--     you count `event_registrations.status = 'invited'` - people who were
--     invited and never registered or paid. They are correctly OUT. Adding
--     them would put 134 strangers into a paying campout's chat.
--
--   * THE BACKGROUND IMAGE ALREADY FOLLOWS THE EVENT. It is resolved at read
--     time in useMyStaffChannels from events(cover_image_url), falling back to
--     the collective. There is no image column on chat_channels to drift.
--
-- What was genuinely broken is below.
--
-- ---------------------------------------------------------------------------
-- DEFECT 1: the NAME is a denormalised copy, and it had drifted.
--
-- chat_channels.name is written once at channel creation and re-synced only by
-- the arm added in 20260826070000, which fires on UPDATE OF title and only
-- when NEW.title IS DISTINCT FROM OLD.title. Two ways that misses:
--   a. The event was renamed BEFORE that migration existed. Nothing since
--      re-checks, so the drift is permanent.
--   b. PostgREST PATCHes only the edited columns. An image-only or date-only
--      edit never puts `title` in the SET list, so the trigger does not fire at
--      all - which is why a heal that lives only in the title branch can never
--      catch up.
--
-- Live proof at the time of writing: channel 9774f805 still read "Wild
-- Mountains Conservation Campout" while its event read "Birding with Cob &
-- Co-Exist Retreat - Wild Mountains". Exactly the generic-title complaint.
--
-- Fix: the heal moves INTO ensure_campout_chat_channel so it runs on every
-- call regardless of which column was edited, and the trigger widens to fire
-- on any event UPDATE. ensure_* is idempotent, and events are low-volume.
--
-- ---------------------------------------------------------------------------
-- DEFECT 2: a profile BORN with a national role never joins campout chats.
--
-- 20260826070000 seeds nationals at channel creation and on role CHANGE
-- (AFTER UPDATE OF role). A profile inserted already carrying 'admin' fires
-- neither. Live proof: tate@ecodia.au, role 'admin', was NOT a member of the
-- Birding channel while ceo@coexistaus.org, also 'admin', was - which is the
-- "i cant even see it" half of the report, and it is not a permissions bug,
-- it is a missing row. Two nationals were missing from that channel.
--
-- Fix: an INSERT arm on profiles, and a one-off top-up below.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ensure_campout_chat_channel now HEALS the name on every call.
--    Title is btrim'd: a trailing space in an event title has already cost
--    this app one bug (493d2a4d, an invite header), and a chat name is a
--    display string.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_campout_chat_channel(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_event   public.events;
  v_channel uuid;
  v_title   text;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_event.activity_type::text, '') <> 'camp_out' THEN
    RETURN NULL;
  END IF;

  IF v_event.status <> 'published' THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_event.date_end, v_event.date_start) < now() - INTERVAL '7 days' THEN
    RETURN NULL;
  END IF;

  v_title := btrim(COALESCE(v_event.title, ''));

  SELECT id INTO v_channel
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

  RETURN v_channel;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Fire on ANY event update, not only the three columns. The old column
--    list is exactly why an image-only edit left the name stale.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ensure_campout_chat_channel ON public.events;
CREATE TRIGGER trg_ensure_campout_chat_channel
  AFTER INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_ensure_campout_chat_channel();

-- The rename branch in tg_ensure_campout_chat_channel is now redundant (the
-- heal above covers it) and it wrote the UNTRIMMED title, so drop it and let
-- ensure own the name.
CREATE OR REPLACE FUNCTION public.tg_ensure_campout_chat_channel()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_campout_chat_channel(NEW.id);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. A profile BORN national joins every campout chat.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_new_national_into_campout_channels()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public._is_national_role(NEW.role::text) THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT cc.id, NEW.id
    FROM public.chat_channels cc
    WHERE cc.type = 'campout'
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_new_national_into_campout_channels ON public.profiles;
CREATE TRIGGER trg_seed_new_national_into_campout_channels
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_new_national_into_campout_channels();

-- ---------------------------------------------------------------------
-- 4. Backfill: heal every drifted name, and top up nationals on every
--    campout channel including past ones (an admin reading back through a
--    finished campout's chat is the point of admin access).
-- ---------------------------------------------------------------------
UPDATE public.events
SET title = btrim(title)
WHERE title IS DISTINCT FROM btrim(title);

UPDATE public.chat_channels cc
SET name = btrim(e.title)
FROM public.events e
WHERE e.id = cc.event_id
  AND cc.type = 'campout'
  AND cc.name IS DISTINCT FROM btrim(e.title);

INSERT INTO public.chat_channel_members (channel_id, user_id)
SELECT cc.id, p.id
FROM public.chat_channels cc
CROSS JOIN public.profiles p
WHERE cc.type = 'campout'
  AND public._is_national_role(p.role::text)
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
