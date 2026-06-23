-- =====================================================================
-- Campout group chats: channel schema + channel-membership RLS + auto-join
-- =====================================================================
-- Origin: Tate 2026-06-23. Each campout event gets its own group chat. A
-- person is auto-added when their Stripe ticket is confirmed; removed on
-- refund/cancel (unless they hold another active ticket for the event).
--
-- Built on the carpool_breakout pattern (event-adjacent, membership-based
-- channel surfaced via /chat/channel/:id). Two new pieces the carpool path
-- did not need, because campout members are ticket-buyers from anywhere and
-- are NOT members of any collective:
--   1. chat_messages SELECT/INSERT policies keyed on CHANNEL membership
--      (the existing policies key only on is_collective_member(collective_id),
--       so a collective-less campout channel would be unreadable/unpostable).
--   2. a channel-scoped rate-limit twin of check_chat_rate_limit.
-- Idempotent + transactional.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Link channels to events + allow the new 'campout' type
-- ---------------------------------------------------------------------
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_event_campout
  ON public.chat_channels (event_id)
  WHERE type = 'campout';

ALTER TABLE public.chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE public.chat_channels ADD CONSTRAINT chat_channels_type_check CHECK (
  (type = 'staff_collective'  AND collective_id IS NOT NULL) OR
  (type = 'staff_state'       AND state IS NOT NULL)         OR
  (type = 'staff_national')                                  OR
  (type = 'carpool_breakout'  AND collective_id IS NOT NULL) OR
  (type = 'campout'           AND event_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- 2. Channel-scoped chat rate limit (mirror of check_chat_rate_limit)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_channel_rate_limit(p_user_id uuid, p_channel_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE recent_count integer;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.chat_messages
  WHERE user_id = p_user_id
    AND channel_id = p_channel_id
    AND created_at > now() - interval '10 seconds';
  RETURN recent_count < 5;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. chat_messages RLS: read/post for CHANNEL members (the gap)
--    Additive to the existing collective-based policies (policies OR together).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS chat_select_channel_member ON public.chat_messages;
CREATE POLICY chat_select_channel_member ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    channel_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_channel_members ccm
      WHERE ccm.channel_id = chat_messages.channel_id
        AND ccm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_insert_channel_member ON public.chat_messages;
CREATE POLICY chat_insert_channel_member ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND channel_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_channel_members ccm
      WHERE ccm.channel_id = chat_messages.channel_id
        AND ccm.user_id = auth.uid()
    )
    AND public.check_channel_rate_limit(auth.uid(), channel_id)
  );

-- ---------------------------------------------------------------------
-- 4. Auto-membership: ticket confirmed -> in the chat; refunded -> out
--    Path-agnostic (Stripe webhook, admin comp, RPC all confirm tickets).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_campout_chat_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_channel uuid;
BEGIN
  SELECT id INTO v_channel
  FROM public.chat_channels
  WHERE event_id = NEW.event_id AND type = 'campout'
  LIMIT 1;

  IF v_channel IS NULL THEN
    RETURN NEW;  -- not a campout-with-chat event
  END IF;

  IF NEW.status IN ('confirmed', 'checked_in') THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (v_channel, NEW.user_id)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  ELSIF NEW.status IN ('cancelled', 'refunded') THEN
    -- keep them in if they still hold another active ticket for this event
    IF NOT EXISTS (
      SELECT 1 FROM public.event_tickets t
      WHERE t.event_id = NEW.event_id
        AND t.user_id = NEW.user_id
        AND t.status IN ('confirmed', 'checked_in')
        AND t.id <> NEW.id
    ) THEN
      DELETE FROM public.chat_channel_members
      WHERE channel_id = v_channel AND user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_campout_chat_membership ON public.event_tickets;
CREATE TRIGGER trg_sync_campout_chat_membership
AFTER INSERT OR UPDATE OF status ON public.event_tickets
FOR EACH ROW EXECUTE FUNCTION public.sync_campout_chat_membership();

-- ---------------------------------------------------------------------
-- 5. Create one campout channel per campout event (idempotent)
-- ---------------------------------------------------------------------
INSERT INTO public.chat_channels (type, event_id, collective_id, name)
SELECT 'campout', e.id, NULL, e.title
FROM public.events e
JOIN public.collectives c ON c.id = e.collective_id AND c.slug = 'campouts'
WHERE e.activity_type = 'camp_out'
  AND NOT EXISTS (
    SELECT 1 FROM public.chat_channels ch
    WHERE ch.event_id = e.id AND ch.type = 'campout'
  );

COMMIT;
