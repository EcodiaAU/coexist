-- ============================================================================
-- Campouts are ONE concept: every campout gets its group chat automatically.
--
-- Origin: Jess 2026-08-26, "how do i access the groupchat that gets created for
-- campout people". Answer: for Murbpook it did not exist.
--
-- 20260623000100_campout_group_chats.sql created channels with a PLAIN
-- INSERT ... SELECT. That is a ONE-TIME BACKFILL, not a rule. Every campout
-- created after that migration ran got no channel at all. Proof at the time of
-- writing: exactly 5 events carried a type='campout' channel and all 5 had
-- created_at = 2026-06-23 03:31:41.301975+00, the migration instant. Murbpook
-- Outback Campout Retreat (created 2026-08-14) and Myall Park Outback Campout
-- (created 2026-05-13) had none.
--
-- Two gaps compound, and fixing only the first would look right and still be
-- broken:
--   1. No channel is created for a campout added after the backfill.
--   2. sync_campout_chat_membership fires on event_tickets and RETURNS EARLY
--      when no channel exists. So even once a channel appears, everyone who
--      already bought a ticket is never added. A channel created late is an
--      EMPTY channel.
-- So the ensure function below both creates the channel AND backfills
-- membership from tickets that already exist.
--
-- Also note the old backfill joined collectives on slug = 'campouts', yet every
-- channel that actually exists sits on collective slug 'brisbane'. The deployed
-- state disagrees with that predicate, so it is dropped here: a campout is
-- defined by activity_type = 'camp_out' and nothing else. That is what the
-- /campouts pages already query (is_public + status published + activity_type),
-- so this makes the chat agree with the page.
--
-- Tate 2026-08-26: "Myall park, wild mountains, murbpook and any other campouts
-- need to ALL act the same ... All with the same ticketing system, groupchats,
-- everything." Plus: admins see all chats.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Ensure a campout has its channel, and that the channel has its people.
--    Idempotent and safe to call repeatedly from a trigger or a backfill.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_campout_chat_channel(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_event   public.events;
  v_channel uuid;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A campout is activity_type = 'camp_out'. Nothing else qualifies, and no
  -- collective, title or location is special.
  IF COALESCE(v_event.activity_type::text, '') <> 'camp_out' THEN
    RETURN NULL;
  END IF;

  -- Only a LIVE campout gets a chat created for it.
  --
  -- Learned the hard way on first apply: keying purely on activity_type created
  -- 7 admin-only channels for events nobody is going to, including two hikes
  -- mislabelled as camp_out ("Bluff knoll hike", "OTBT Hike") and five
  -- completed 2025-26 retreats with no tickets. An empty channel per dead event
  -- clutters the chat list of every admin, which is a worse outcome than the
  -- missing-chat bug this migration fixes.
  --
  -- So: must be published, and must not have already finished. A 7 day grace
  -- keeps a just-finished campout's chat working for the post-event wrap-up.
  -- An EXISTING chat is never removed by this rule, so a campout that runs and
  -- completes keeps its history.
  IF v_event.status <> 'published' THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_event.date_end, v_event.date_start) < now() - INTERVAL '7 days' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_channel
  FROM public.chat_channels
  WHERE event_id = p_event_id AND type = 'campout'
  LIMIT 1;

  IF v_channel IS NULL THEN
    INSERT INTO public.chat_channels (type, event_id, collective_id, name)
    VALUES ('campout', p_event_id, NULL, v_event.title)
    RETURNING id INTO v_channel;
  END IF;

  -- Backfill the people who already hold a live ticket. Without this a channel
  -- created after tickets were sold stays empty forever, because the
  -- event_tickets trigger only fires on a ticket WRITE.
  INSERT INTO public.chat_channel_members (channel_id, user_id)
  SELECT v_channel, t.user_id
  FROM public.event_tickets t
  WHERE t.event_id = p_event_id
    AND t.status IN ('confirmed', 'checked_in')
    -- chat_channel_members.user_id FKs to profiles(id). A ticket holder with no
    -- profile row would raise and abort the whole ensure call, taking the
    -- channel creation down with it, so skip them rather than fail closed.
    AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = t.user_id)
  ON CONFLICT DO NOTHING;

  -- Admins and national staff see every campout chat, matching the behaviour
  -- 20260518010000 gave them for state channels.
  INSERT INTO public.chat_channel_members (channel_id, user_id)
  SELECT v_channel, p.id
  FROM public.profiles p
  WHERE public._is_national_role(p.role::text)
  ON CONFLICT DO NOTHING;

  RETURN v_channel;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. The rule: a campout event gets its channel on create, and on any edit
--    that turns an event INTO a campout or publishes it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ensure_campout_chat_channel()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_campout_chat_channel(NEW.id);

  -- Keep the channel name honest when the event is renamed. A stale chat name
  -- is how "which campout is this?" starts.
  IF TG_OP = 'UPDATE' AND NEW.title IS DISTINCT FROM OLD.title THEN
    UPDATE public.chat_channels
    SET name = NEW.title
    WHERE event_id = NEW.id AND type = 'campout';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_campout_chat_channel ON public.events;
CREATE TRIGGER trg_ensure_campout_chat_channel
  AFTER INSERT OR UPDATE OF activity_type, status, title ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_ensure_campout_chat_channel();

-- ---------------------------------------------------------------------
-- 3. Admins into campout channels created by any path, mirroring the
--    staff_state behaviour rather than inventing a second mechanism.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_national_roles_into_campout_channel()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.type = 'campout' THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT NEW.id, p.id
    FROM public.profiles p
    WHERE public._is_national_role(p.role::text)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_national_roles_into_campout_channel ON public.chat_channels;
CREATE TRIGGER trg_seed_national_roles_into_campout_channel
  AFTER INSERT ON public.chat_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_national_roles_into_campout_channel();

-- A user promoted to a national role joins every campout chat.
CREATE OR REPLACE FUNCTION public.sync_national_role_to_campout_channels()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public._is_national_role(NEW.role::text)
     AND NOT public._is_national_role(COALESCE(OLD.role::text, 'participant')) THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT cc.id, NEW.id
    FROM public.chat_channels cc
    WHERE cc.type = 'campout'
    ON CONFLICT DO NOTHING;
  END IF;

  -- Demoted: drop them from campout chats they are not ticketed into.
  IF NOT public._is_national_role(NEW.role::text)
     AND public._is_national_role(COALESCE(OLD.role::text, 'participant')) THEN
    DELETE FROM public.chat_channel_members ccm
    USING public.chat_channels cc
    WHERE ccm.channel_id = cc.id
      AND cc.type = 'campout'
      AND ccm.user_id = NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM public.event_tickets t
        WHERE t.event_id = cc.event_id
          AND t.user_id = NEW.id
          AND t.status IN ('confirmed', 'checked_in')
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_national_role_to_campout_channels ON public.profiles;
CREATE TRIGGER trg_sync_national_role_to_campout_channels
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.sync_national_role_to_campout_channels();

-- ---------------------------------------------------------------------
-- 4. Backfill every campout that missed, and top up membership on the ones
--    that already have a channel (admins, plus any ticket sold before the
--    membership trigger existed).
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.events
    WHERE activity_type::text = 'camp_out'
      AND status::text = 'published'
      AND COALESCE(date_end, date_start) >= now() - INTERVAL '7 days'
  LOOP
    PERFORM public.ensure_campout_chat_channel(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
