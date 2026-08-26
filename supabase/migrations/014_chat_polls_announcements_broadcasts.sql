-- ============================================================
-- 014: Chat Polls, Announcements, and Broadcast Notification Tracking
-- Also fixes: superadmin access to all chat + collective features
-- ============================================================

-- 1. Chat Polls
CREATE TABLE chat_polls (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id   uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  question        text NOT NULL,
  options         jsonb NOT NULL DEFAULT '[]',       -- [{id: uuid, text: string}]
  allow_multiple  boolean DEFAULT false,
  anonymous       boolean DEFAULT false,
  closes_at       timestamptz,                        -- null = never closes
  is_closed       boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- 2. Poll Votes
CREATE TABLE chat_poll_votes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id     uuid NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_id   text NOT NULL,                          -- matches options[].id
  created_at  timestamptz DEFAULT now(),
  UNIQUE (poll_id, user_id, option_id)
);

-- 3. Chat Announcements (event invites, general announcements, interactive cards)
CREATE TABLE chat_announcements (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id   uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  type            text NOT NULL CHECK (type IN ('announcement', 'event_invite', 'rsvp', 'checklist')),
  title           text NOT NULL,
  body            text,
  metadata        jsonb DEFAULT '{}',                 -- {event_id, checklist_items, rsvp_options, etc.}
  expires_at      timestamptz,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- 4. Announcement Responses (RSVPs, checklist ticks)
CREATE TABLE chat_announcement_responses (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id   uuid NOT NULL REFERENCES chat_announcements(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  response          text NOT NULL,                    -- 'going', 'not_going', 'maybe', checked item id, etc.
  created_at        timestamptz DEFAULT now(),
  UNIQUE (announcement_id, user_id, response)
);

-- 5. Broadcast Notification Log (dedup: staff can see who already sent what)
CREATE TABLE chat_broadcast_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id   uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  sent_by         uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  type            text NOT NULL CHECK (type IN ('push_notification', 'announcement', 'event_invite', 'poll')),
  title           text NOT NULL,
  body            text,
  metadata        jsonb DEFAULT '{}',
  recipient_count int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- 6. Extend chat_messages to support special message types
-- Split into separate statements: column first, then constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='message_type') THEN
    ALTER TABLE chat_messages ADD COLUMN message_type text DEFAULT 'text';
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
      CHECK (message_type IN ('text', 'image', 'voice', 'video', 'poll', 'announcement', 'system'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='poll_id') THEN
    ALTER TABLE chat_messages ADD COLUMN poll_id uuid;
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_poll_id_fkey
      FOREIGN KEY (poll_id) REFERENCES chat_polls(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='announcement_id') THEN
    ALTER TABLE chat_messages ADD COLUMN announcement_id uuid;
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_announcement_id_fkey
      FOREIGN KEY (announcement_id) REFERENCES chat_announcements(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Force PostgREST to reload schema cache by notifying
NOTIFY pgrst, 'reload schema';

-- Indexes
CREATE INDEX idx_chat_polls_collective ON chat_polls(collective_id);
CREATE INDEX idx_chat_poll_votes_poll ON chat_poll_votes(poll_id);
CREATE INDEX idx_chat_poll_votes_user ON chat_poll_votes(user_id);
CREATE INDEX idx_chat_announcements_collective ON chat_announcements(collective_id);
CREATE INDEX idx_chat_announcement_responses_ann ON chat_announcement_responses(announcement_id);
CREATE INDEX idx_chat_broadcast_log_collective ON chat_broadcast_log(collective_id);
CREATE INDEX idx_chat_broadcast_log_created ON chat_broadcast_log(created_at DESC);
CREATE INDEX idx_chat_messages_type ON chat_messages(message_type);

-- Helper: includes assist_leader (broader than is_collective_leader_or_above)
CREATE OR REPLACE FUNCTION is_collective_staff(uid uuid, cid uuid)
RETURNS boolean AS $$
  -- guard: this definer takes a uid, so a bare body answers role questions
  -- about third parties to anon. See 20260826090000.
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1 FROM collective_members
      WHERE user_id = uid AND collective_id = cid
        AND status = 'active'
        AND role IN ('leader', 'co_leader', 'assist_leader')
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- FIX: Super admin / national staff bypass for EXISTING chat tables
-- These users should have full access to all collective chats
-- without needing to be a collective_member
-- ============================================================

-- chat_messages: admin can SELECT all
CREATE POLICY "chat_select_admin"
  ON chat_messages FOR SELECT TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- chat_messages: admin can INSERT (for system messages, etc.)
CREATE POLICY "chat_insert_admin"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_admin_or_staff(auth.uid())
  );

-- chat_messages: admin can UPDATE any message
CREATE POLICY "chat_update_admin"
  ON chat_messages FOR UPDATE TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- chat_messages: admin can DELETE any message
CREATE POLICY "chat_delete_admin"
  ON chat_messages FOR DELETE TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- chat_read_receipts: admin can manage their own
CREATE POLICY "chat_receipts_admin"
  ON chat_read_receipts FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- ============================================================
-- RLS for new tables (with admin bypass on all policies)
-- ============================================================

ALTER TABLE chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_announcement_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_broadcast_log ENABLE ROW LEVEL SECURITY;

-- Polls: members can view, staff/admin can create
CREATE POLICY "polls_select" ON chat_polls FOR SELECT TO authenticated
  USING (is_collective_member(auth.uid(), collective_id) OR is_admin_or_staff(auth.uid()));

CREATE POLICY "polls_insert" ON chat_polls FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (is_collective_staff(auth.uid(), collective_id) OR is_admin_or_staff(auth.uid()))
  );

CREATE POLICY "polls_update" ON chat_polls FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR is_collective_staff(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

-- Poll votes: members + admin can see, members + admin can vote
CREATE POLICY "poll_votes_select" ON chat_poll_votes FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM chat_polls p WHERE p.id = poll_id AND is_collective_member(auth.uid(), p.collective_id))
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "poll_votes_insert" ON chat_poll_votes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM chat_polls p WHERE p.id = poll_id AND is_collective_member(auth.uid(), p.collective_id) AND NOT p.is_closed)
      OR is_admin_or_staff(auth.uid())
    )
  );

CREATE POLICY "poll_votes_delete" ON chat_poll_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- Announcements: members + admin view, staff + admin create
CREATE POLICY "announcements_select" ON chat_announcements FOR SELECT TO authenticated
  USING (is_collective_member(auth.uid(), collective_id) OR is_admin_or_staff(auth.uid()));

CREATE POLICY "announcements_insert" ON chat_announcements FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (is_collective_staff(auth.uid(), collective_id) OR is_admin_or_staff(auth.uid()))
  );

CREATE POLICY "announcements_update" ON chat_announcements FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR is_collective_staff(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

-- Announcement responses: members + admin can respond
CREATE POLICY "ann_responses_select" ON chat_announcement_responses FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM chat_announcements a WHERE a.id = announcement_id AND is_collective_member(auth.uid(), a.collective_id))
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "ann_responses_insert" ON chat_announcement_responses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM chat_announcements a WHERE a.id = announcement_id AND is_collective_member(auth.uid(), a.collective_id) AND a.is_active)
      OR is_admin_or_staff(auth.uid())
    )
  );

CREATE POLICY "ann_responses_delete" ON chat_announcement_responses FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- Broadcast log: staff + admin can view and insert
CREATE POLICY "broadcast_log_select" ON chat_broadcast_log FOR SELECT TO authenticated
  USING (is_collective_staff(auth.uid(), collective_id) OR is_admin_or_staff(auth.uid()));

CREATE POLICY "broadcast_log_insert" ON chat_broadcast_log FOR INSERT TO authenticated
  WITH CHECK (
    sent_by = auth.uid()
    AND (is_collective_staff(auth.uid(), collective_id) OR is_admin_or_staff(auth.uid()))
  );

-- Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE chat_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_announcement_responses;
