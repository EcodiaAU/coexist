-- ============================================================
-- 20260428: Chat Message Reactions
-- Allows members to react to chat messages with a fixed set of emojis.
-- One row per (message, user, emoji). Realtime-published.
-- ============================================================

CREATE TABLE IF NOT EXISTS message_reactions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id    uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  collective_id uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

-- Indexes for the hot read paths: per-message aggregation + per-collective
-- realtime filtering.
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_collective
  ON message_reactions(collective_id);

-- ============================================================
-- RLS
-- Members of the collective (or admins) can SELECT all reactions
-- on messages in that collective.
-- Users can INSERT only their own reactions, and only if they are a
-- member of (or admin over) the message's collective.
-- Users can DELETE only their own reactions (admins can delete any).
-- ============================================================

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_reactions_select"
  ON message_reactions FOR SELECT TO authenticated
  USING (
    is_collective_member(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "message_reactions_insert"
  ON message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      is_collective_member(auth.uid(), collective_id)
      OR is_admin_or_staff(auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = message_id
        AND m.collective_id = message_reactions.collective_id
        AND m.is_deleted = false
    )
  );

CREATE POLICY "message_reactions_delete_own"
  ON message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "message_reactions_delete_admin"
  ON message_reactions FOR DELETE TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- ============================================================
-- Realtime publication
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;

-- Force PostgREST schema cache reload so the new table is queryable
-- from supabase-js immediately after migration.
NOTIFY pgrst, 'reload schema';
