-- ============================================================================
-- Chat messages push notifications (1.8.7 final feature update)
--
-- Goal: fire a push notification to every active member of a chat channel
-- whenever a new chat message lands in that channel. Excludes the sender.
-- Routes through the existing send-push edge function which already enforces
-- per-user notification_preferences (chat_messages master toggle, quiet hours,
-- timezone-aware) and dedupes invalid tokens.
--
-- Mention notifications already write to the `notifications` table via
-- notify_chat_mentions RPC; this trigger handles the broader chat-message push
-- (the `chat_messages` notification type which is the master toggle for all
-- chat_* subtypes server-side).
--
-- Origin: Tate 17 May 2026 pre-1.8.7-ship audit - "make sure we're sending
-- notifications for chat messages and widgets and whatever".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_chat_message_push() RETURNS trigger AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/send-push';
  svc_key  text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
  sender_name text;
  collective_name text;
  member_ids uuid[];
  notif_title text;
  notif_body text;
  notif_type text;
BEGIN
  -- Skip non-broadcasting message types
  IF NEW.message_type = 'system' THEN
    RETURN NEW;
  END IF;

  -- Need a collective channel to know who to notify. DM channels can be
  -- added later; today's collective channels are the high-value path.
  IF NEW.collective_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, 'Someone') INTO sender_name
  FROM profiles WHERE id = NEW.user_id;

  SELECT COALESCE(name, 'a collective') INTO collective_name
  FROM collectives WHERE id = NEW.collective_id;

  -- Build recipient list: active members minus sender
  SELECT array_agg(user_id) INTO member_ids
  FROM collective_members
  WHERE collective_id = NEW.collective_id
    AND status = 'active'
    AND user_id <> NEW.user_id;

  IF member_ids IS NULL OR array_length(member_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Tone-tuned title + body per message type. Sleek, no hype.
  CASE NEW.message_type
    WHEN 'image' THEN
      notif_title := sender_name;
      notif_body  := 'sent a photo in ' || collective_name;
      notif_type  := 'chat_image';
    WHEN 'voice' THEN
      notif_title := sender_name;
      notif_body  := 'sent a voice note in ' || collective_name;
      notif_type  := 'chat_messages';
    WHEN 'video' THEN
      notif_title := sender_name;
      notif_body  := 'sent a video in ' || collective_name;
      notif_type  := 'chat_messages';
    WHEN 'poll' THEN
      notif_title := sender_name;
      notif_body  := 'started a poll in ' || collective_name;
      notif_type  := 'chat_poll';
    WHEN 'announcement' THEN
      notif_title := collective_name;
      notif_body  := COALESCE(LEFT(NEW.content, 180), 'Announcement');
      notif_type  := 'chat_announcement';
    WHEN 'html' THEN
      notif_title := sender_name;
      notif_body  := COALESCE(LEFT(regexp_replace(NEW.content, '<[^>]+>', '', 'g'), 180), 'sent a message');
      notif_type  := 'chat_messages';
    ELSE
      -- text + anything else: show preview
      notif_title := sender_name;
      notif_body  := COALESCE(LEFT(NEW.content, 180), 'sent a message');
      notif_type  := 'chat_messages';
  END CASE;

  -- Fire push (best-effort, non-blocking via pg_net). The edge function
  -- applies per-user prefs + quiet hours, so we don't need to filter here.
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(member_ids),
      'title',   notif_title,
      'body',    notif_body,
      'data',    jsonb_build_object(
        'type',          notif_type,
        'collective_id', NEW.collective_id::text,
        'message_id',    NEW.id::text,
        'sender_id',     NEW.user_id::text,
        'route',         '/chat/' || NEW.collective_id::text
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the message insert on a push failure
  RAISE WARNING 'notify_chat_message_push failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_chat_message_push ON public.chat_messages;
CREATE TRIGGER trg_notify_chat_message_push
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_message_push();

-- ============================================================================
-- Mention push (1.8.7 final): also push when user is @-mentioned. The existing
-- notify_chat_mentions RPC already inserts into `notifications` table; this
-- adds the push delivery alongside.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_chat_mention_push() RETURNS trigger AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/send-push';
  svc_key  text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
  collective_id_text text;
BEGIN
  IF NEW.type <> 'chat_mention' THEN
    RETURN NEW;
  END IF;

  collective_id_text := COALESCE((NEW.data->>'collective_id'), '');

  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := jsonb_build_object(
      'userId', NEW.user_id::text,
      'title',  NEW.title,
      'body',   NEW.body,
      'data',   jsonb_build_object(
        'type',          'chat_mention',
        'collective_id', collective_id_text,
        'message_id',    COALESCE(NEW.data->>'message_id', ''),
        'sender_id',     COALESCE(NEW.data->>'sender_id', ''),
        'route',         CASE WHEN collective_id_text <> '' THEN '/chat/' || collective_id_text ELSE '/' END
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_chat_mention_push failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_chat_mention_push ON public.notifications;
CREATE TRIGGER trg_notify_chat_mention_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.type = 'chat_mention')
  EXECUTE FUNCTION public.notify_chat_mention_push();

NOTIFY pgrst, 'reload schema';
