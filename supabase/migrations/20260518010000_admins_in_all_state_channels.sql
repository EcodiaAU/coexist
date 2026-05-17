-- ============================================================================
-- Admins + national_staff in every state channel (1.8.7 final)
--
-- Pre-existing 023_staff_chat_channels.sql created state channels and added
-- collective leaders to their own state's channel. But national-level roles
-- (admin, super_admin, national_admin, national_staff) only got the National
-- Staff channel - they couldn't see/post in QLD/VIC/etc unless they happened
-- to also lead a collective in that state. Result: admins ended up with only
-- the state channel that matched their personal home collective (Tate -> NSW),
-- which surfaces as "Only NSW has a state chat" in the UI.
--
-- Fix: auto-add national roles to every state channel, and keep them in sync
-- on role change + state-channel creation.
-- ============================================================================

-- Helper: roles that should see all state channels.
-- Accepts the profiles.role enum via implicit ::text cast at call sites so we
-- don't have to hard-code the enum type name (varies across migrations).
CREATE OR REPLACE FUNCTION public._is_national_role(p_role text) RETURNS boolean AS $$
  SELECT p_role IN ('admin', 'super_admin', 'national_admin', 'national_staff', 'manager')
$$ LANGUAGE sql IMMUTABLE;

-- One-time backfill: every existing national-role user joins every existing
-- staff_state channel.
INSERT INTO chat_channel_members (channel_id, user_id)
SELECT cc.id, p.id
FROM profiles p
CROSS JOIN chat_channels cc
WHERE cc.type = 'staff_state'
  AND public._is_national_role(p.role::text)
ON CONFLICT DO NOTHING;

-- Trigger: when a new state channel is created, add every current national
-- role user to it.
CREATE OR REPLACE FUNCTION public.seed_national_roles_into_state_channel()
RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'staff_state' THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    SELECT NEW.id, p.id
    FROM profiles p
    WHERE public._is_national_role(p.role::text)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_national_roles_into_state_channel ON chat_channels;
CREATE TRIGGER trg_seed_national_roles_into_state_channel
  AFTER INSERT ON chat_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_national_roles_into_state_channel();

-- Trigger: when a user is promoted to a national role, add them to every
-- existing state channel. Existing sync_national_staff_channel handles the
-- staff_national channel but not state channels.
CREATE OR REPLACE FUNCTION public.sync_national_role_to_state_channels()
RETURNS trigger AS $$
BEGIN
  -- Promoted into a national role
  IF public._is_national_role(NEW.role::text) AND NOT public._is_national_role(COALESCE(OLD.role::text, 'participant')) THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    SELECT cc.id, NEW.id
    FROM chat_channels cc
    WHERE cc.type = 'staff_state'
    ON CONFLICT DO NOTHING;
  END IF;

  -- Demoted out of national roles - remove from state channels UNLESS still a
  -- collective leader/co-leader/assist-leader in that state (preserving the
  -- pre-existing sync_collective_staff_channels behaviour).
  IF NOT public._is_national_role(NEW.role::text) AND public._is_national_role(COALESCE(OLD.role::text, 'participant')) THEN
    DELETE FROM chat_channel_members ccm
    USING chat_channels cc
    WHERE ccm.channel_id = cc.id
      AND cc.type = 'staff_state'
      AND ccm.user_id = NEW.id
      AND NOT EXISTS (
        SELECT 1
        FROM collective_members cm
        JOIN collectives c ON c.id = cm.collective_id
        WHERE cm.user_id = NEW.id
          AND cm.status = 'active'
          AND cm.role IN ('assist_leader', 'co_leader', 'leader')
          AND c.state = cc.state
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_national_role_to_state_channels ON profiles;
CREATE TRIGGER trg_sync_national_role_to_state_channels
  AFTER UPDATE OF role ON profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.sync_national_role_to_state_channels();

NOTIFY pgrst, 'reload schema';
