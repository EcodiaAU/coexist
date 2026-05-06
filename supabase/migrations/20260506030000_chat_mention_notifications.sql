-- ============================================================================
-- Migration 080: Chat @mention notification RPC
--
-- Goal: Allow regular collective members to write notifications rows for
-- users they `@mention` in chat. Direct INSERT into `notifications` is
-- gated by `notifications_insert_admin_only` (migration 005), so non-staff
-- mentions need a SECURITY DEFINER RPC that validates:
--   1. Caller authored the cited message
--   2. Mentioned users are active members of the same collective
--
-- This avoids granting blanket INSERT permission while still letting
-- members notify each other.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_chat_mentions(
  p_message_id uuid,
  p_mentioned_user_ids uuid[]
)
RETURNS integer AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_msg chat_messages%ROWTYPE;
  v_sender_name text;
  v_inserted integer := 0;
  v_target uuid;
  v_preview text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_message_id IS NULL OR array_length(p_mentioned_user_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_msg FROM chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  IF v_msg.user_id <> v_caller THEN
    RAISE EXCEPTION 'caller did not author this message';
  END IF;

  IF v_msg.collective_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(display_name, 'Someone') INTO v_sender_name
  FROM profiles WHERE id = v_caller;

  v_preview := COALESCE(left(v_msg.content, 200), 'mentioned you');

  -- For each candidate, verify they're an active member of the same
  -- collective before inserting. Self-mentions are silently skipped.
  FOREACH v_target IN ARRAY p_mentioned_user_ids LOOP
    IF v_target = v_caller THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM collective_members
      WHERE collective_id = v_msg.collective_id
        AND user_id = v_target
        AND status = 'active'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_target,
      'chat_mention',
      v_sender_name || ' mentioned you',
      v_preview,
      jsonb_build_object(
        'collective_id', v_msg.collective_id,
        'message_id',    v_msg.id,
        'sender_id',     v_caller
      )
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

GRANT EXECUTE ON FUNCTION notify_chat_mentions(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION notify_chat_mentions(uuid, uuid[]) IS
  'Insert chat_mention notifications for users @mentioned in a chat message. '
  'SECURITY DEFINER bypass for notifications_insert_admin_only RLS. '
  'Validates caller authored the message and targets are same-collective. '
  'Origin: 1.8.4 item 1 - chat replies + @mentions, 6 May 2026.';
