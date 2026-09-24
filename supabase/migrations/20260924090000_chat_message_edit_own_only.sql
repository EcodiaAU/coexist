-- Message editing in every chat, own messages only (Tate, 2026-09-24).
--
-- Editing existed for collective chats only and was enforced in the UI alone.
-- The database let far more through than the UI offered:
--
--   * chat_update_leader's USING clause is (own row) OR (leader of the
--     collective) OR (admin/staff), with no WITH CHECK, so any collective
--     leader and any admin could rewrite the CONTENT of another member's
--     message with one PATCH. The policy exists so leaders can pin and
--     soft-delete; it was never meant to let them put words in someone's mouth.
--   * A member could PATCH channel_id / collective_id / user_id on their own
--     row. WITH CHECK defaults to USING, whose first arm is user_id = auth.uid(),
--     so a member could move their own message into a channel they are not in.
--   * The "(edited)" label read updated_at <> created_at, and updated_at is
--     bumped by every UPDATE, so pinning a message marked it edited.
--
-- RLS stays the visibility gate. This trigger is the column-level rule RLS
-- cannot express: WHICH columns a user session may change, and on whose row.
--
-- It applies only to end-user sessions (current_user authenticated / anon).
-- SECURITY DEFINER functions run as their owner and service_role / postgres
-- keep manual repair open, so handle_content_report_removal (soft delete) and
-- every edge function are unaffected.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

COMMENT ON COLUMN public.chat_messages.edited_at IS
  'Set by trg_chat_messages_guard_edit when the author changes content. NULL = never edited. Not writable by clients.';

CREATE OR REPLACE FUNCTION public.chat_messages_guard_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_new text;
BEGIN
  -- Privileged sessions (service_role, postgres, SECURITY DEFINER owners)
  -- are not end users and keep full write access.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- 1. Identity and media are immutable from a client. Nothing in the app
  --    writes these on an existing row; a change is either a bug or an attempt
  --    to move or re-attribute a message.
  IF NEW.user_id         IS DISTINCT FROM OLD.user_id
  OR NEW.collective_id   IS DISTINCT FROM OLD.collective_id
  OR NEW.channel_id      IS DISTINCT FROM OLD.channel_id
  OR NEW.created_at      IS DISTINCT FROM OLD.created_at
  OR NEW.message_type    IS DISTINCT FROM OLD.message_type
  OR NEW.client_action_id IS DISTINCT FROM OLD.client_action_id
  OR NEW.image_url       IS DISTINCT FROM OLD.image_url
  OR NEW.image_path      IS DISTINCT FROM OLD.image_path
  OR NEW.voice_url       IS DISTINCT FROM OLD.voice_url
  OR NEW.video_url       IS DISTINCT FROM OLD.video_url
  THEN
    RAISE EXCEPTION 'chat message identity and media cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Content: the author, and only the author, may change it. This is the
  --    rule that holds even for a leader or admin whom RLS lets see the row.
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF v_uid IS NULL OR OLD.user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'only the author can edit a message'
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(OLD.is_deleted, false) THEN
      RAISE EXCEPTION 'a deleted message cannot be edited'
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(OLD.message_type, 'text') NOT IN ('text', 'image') THEN
      RAISE EXCEPTION 'this kind of message cannot be edited'
        USING ERRCODE = '42501';
    END IF;

    v_new := btrim(COALESCE(NEW.content, ''));
    IF v_new = '' AND OLD.image_url IS NULL AND OLD.image_path IS NULL THEN
      RAISE EXCEPTION 'an edited message cannot be empty; delete it instead'
        USING ERRCODE = '22023';
    END IF;

    IF length(NEW.content) > 4000 THEN
      RAISE EXCEPTION 'message too long'
        USING ERRCODE = '22001';
    END IF;

    NEW.edited_at := now();
  ELSE
    -- 3. edited_at is stamped here and nowhere else, so a client cannot forge
    --    or clear the "edited" label.
    NEW.edited_at := OLD.edited_at;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_chat_messages_guard_edit ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_guard_edit
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_guard_edit();
