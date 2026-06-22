-- ============================================================================
-- Drop the chat-message push DB trigger to kill double push notifications.
--
-- ROOT CAUSE (diagnosed 2026-06-22): every chat message fired TWO pushes.
--   Path 1 (original, since 2026-03-21, commit 8db908d): the client
--           useSendMessage mutation onSuccess invokes the send-push edge
--           function directly for every message (src/hooks/use-chat.ts).
--   Path 2 (added 2026-05-18, commit 249d208, 1.8.7): this AFTER INSERT
--           trigger on chat_messages ALSO invokes send-push for every message.
--   Both target the same recipients (active collective members minus sender)
--   with the same title/body, so every member received exactly two identical
--   notifications.
--
-- DECISION: the client-side invoke is the canonical single path. It predates
-- the trigger, is present in every shipped build (force-update floor >= 1.9.5),
-- deep-links correctly (resolveNotificationRoute derives /chat/<collective_id>
-- from data.collective_id, no explicit route needed), and even classifies
-- reply pushes better (chat_reply + "Replied: ..."). Dropping the trigger is
-- server-side, so it takes effect instantly for ALL existing installs without
-- waiting on an app-store update.
--
-- The mention push trigger (trg_notify_chat_mention_push on notifications) is
-- left intact: it has no client-side duplicate.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_notify_chat_message_push ON public.chat_messages;
DROP FUNCTION IF EXISTS public.notify_chat_message_push();

NOTIFY pgrst, 'reload schema';
