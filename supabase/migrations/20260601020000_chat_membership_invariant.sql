-- =====================================================================
-- State-leader chat membership invariant (Vic + all states)
-- =====================================================================
-- Origin: 2026-06-01 Tate P0: "Vic leaders report they arent in the
-- victoria leaders group chat. Anyone leading any collective in the state
-- of victoria should be in the vic group chat leaders and same with all
-- other states."
--
-- Current substrate has three load-bearing pieces:
--   - sync_collective_staff_channels (AFTER INSERT/UPDATE/DELETE on
--     collective_members) adds/removes a user from staff_collective +
--     staff_state channels based on collective_members.role.
--   - auto_create_staff_channels (AFTER INSERT on collectives) creates
--     the staff_collective + staff_state channels.
--   - seed_national_roles_into_state_channel (AFTER INSERT on
--     chat_channels) seeds national-role profiles into any new
--     staff_state channel at channel-creation time.
--
-- Two gaps closed here:
--
--   1. _is_national_role missed 'national_leader'. The profile role enum
--      includes national_leader (and is treated as staff by
--      is_admin_or_staff) but the seed function would NOT pull a
--      national_leader user into a state channel at channel-creation
--      time. Adding it.
--
--   2. No trigger re-synced membership when a user's profiles.role
--      changed (e.g. promoted to admin, demoted from manager). A new
--      manager would only appear in state channels that were CREATED
--      after their promotion, not in pre-existing ones. Added a
--      sync_national_role_membership trigger on profiles UPDATE that
--      adds/removes the user across all staff_state channels.
--
-- Plus an idempotent backfill pass: for every active state-leader and
-- every national-role user, ensure they are in the right staff_state +
-- staff_collective channels. ON CONFLICT DO NOTHING means re-running
-- this migration is safe and the current sync gap (if any) closes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. _is_national_role: include national_leader
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._is_national_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_role IN (
    'admin',
    'super_admin',
    'national_admin',
    'national_staff',
    'national_leader',
    'manager'
  )
$$;

COMMENT ON FUNCTION public._is_national_role(text) IS
  'National-role marker used by seed_national_roles_into_state_channel '
  'and sync_national_role_membership to decide who auto-joins every '
  'staff_state channel. national_leader added 2026-06-01 per Tate.';

-- ---------------------------------------------------------------------
-- 2. sync_national_role_membership: keep profiles.role changes in sync
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_national_role_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_national boolean;
  is_national  boolean;
BEGIN
  was_national := (TG_OP = 'UPDATE')
                  AND OLD.role IS NOT NULL
                  AND public._is_national_role(OLD.role::text);
  is_national := NEW.role IS NOT NULL
                 AND public._is_national_role(NEW.role::text);

  -- Promoted INTO a national role: add to every staff_state channel.
  IF is_national AND NOT was_national THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    SELECT ch.id, NEW.id
      FROM chat_channels ch
     WHERE ch.type = 'staff_state'
    ON CONFLICT DO NOTHING;
  END IF;

  -- Demoted OUT of a national role: remove from staff_state channels
  -- UNLESS they are also a state leader via collective_members in that
  -- state (in which case the sync_collective_staff_channels trigger
  -- keeps them in).
  IF was_national AND NOT is_national THEN
    DELETE FROM chat_channel_members ccm
     USING chat_channels ch
     WHERE ccm.user_id = NEW.id
       AND ccm.channel_id = ch.id
       AND ch.type = 'staff_state'
       AND NOT EXISTS (
         SELECT 1
           FROM collective_members cm
           JOIN collectives c ON c.id = cm.collective_id
          WHERE cm.user_id = NEW.id
            AND cm.status = 'active'
            AND cm.role IN ('assist_leader','co_leader','leader')
            AND c.state = ch.state
       );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_national_role_membership ON public.profiles;

CREATE TRIGGER trg_sync_national_role_membership
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.sync_national_role_membership();

COMMENT ON FUNCTION public.sync_national_role_membership() IS
  'Profile-role-change sync: when profiles.role changes into or out of '
  'a national role, ensure chat_channel_members for every staff_state '
  'channel is updated. Demotion preserves rows that are still backed '
  'by an active state-leader collective_members row. 2026-06-01.';

-- ---------------------------------------------------------------------
-- 3. Idempotent backfill: state leaders + national roles
-- ---------------------------------------------------------------------

-- 3a. State leaders into staff_state channels (per state).
INSERT INTO chat_channel_members (channel_id, user_id)
SELECT DISTINCT ch.id, cm.user_id
  FROM collective_members cm
  JOIN collectives c ON c.id = cm.collective_id
  JOIN chat_channels ch ON ch.type = 'staff_state' AND ch.state = c.state
 WHERE cm.status = 'active'
   AND cm.role IN ('assist_leader','co_leader','leader')
   AND c.state IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3b. State leaders into their staff_collective channels.
INSERT INTO chat_channel_members (channel_id, user_id)
SELECT DISTINCT ch.id, cm.user_id
  FROM collective_members cm
  JOIN chat_channels ch ON ch.type = 'staff_collective' AND ch.collective_id = cm.collective_id
 WHERE cm.status = 'active'
   AND cm.role IN ('assist_leader','co_leader','leader')
ON CONFLICT DO NOTHING;

-- 3c. National-role users into every staff_state channel.
INSERT INTO chat_channel_members (channel_id, user_id)
SELECT ch.id, p.id
  FROM chat_channels ch
 CROSS JOIN profiles p
 WHERE ch.type = 'staff_state'
   AND p.role IS NOT NULL
   AND public._is_national_role(p.role::text)
ON CONFLICT DO NOTHING;
