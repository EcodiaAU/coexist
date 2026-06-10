-- 1. Fix the staff channel sync trigger - use type not slug
CREATE OR REPLACE FUNCTION sync_national_staff_channel()
RETURNS trigger AS $$
DECLARE
  staff_channel_id uuid;
BEGIN
  SELECT id INTO staff_channel_id
  FROM chat_channels WHERE type = 'staff_national' LIMIT 1;

  IF staff_channel_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.role::text IN ('leader', 'national_leader', 'manager', 'admin') THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    VALUES (staff_channel_id, NEW.id)
    ON CONFLICT DO NOTHING;
  ELSE
    IF OLD IS NOT NULL AND OLD.role::text IN ('leader', 'national_leader', 'manager', 'admin') THEN
      DELETE FROM chat_channel_members
      WHERE channel_id = staff_channel_id AND user_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper to map role to rank
CREATE OR REPLACE FUNCTION role_rank(r text) RETURNS int AS $$
  SELECT CASE r
    WHEN 'participant' THEN 0
    WHEN 'member'      THEN 0
    WHEN 'assist_leader' THEN 1
    WHEN 'co_leader'   THEN 2
    WHEN 'leader'      THEN 3
    WHEN 'manager'     THEN 4
    WHEN 'admin'       THEN 5
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;

-- 3. Sync profiles.role to highest collective role
UPDATE profiles p
SET role = (
  SELECT CASE max_rank
    WHEN 0 THEN 'participant'
    WHEN 1 THEN 'assist_leader'
    WHEN 2 THEN 'co_leader'
    WHEN 3 THEN 'leader'
    WHEN 4 THEN 'manager'
    WHEN 5 THEN 'admin'
    ELSE 'participant'
  END
  FROM (
    SELECT GREATEST(
      role_rank(p.role::text),
      COALESCE((
        SELECT MAX(role_rank(cm.role::text))
        FROM collective_members cm
        WHERE cm.user_id = p.id AND cm.status = 'active'
      ), 0)
    ) AS max_rank
  ) sub
)::user_role
WHERE EXISTS (
  SELECT 1 FROM collective_members cm
  WHERE cm.user_id = p.id
    AND cm.status = 'active'
    AND role_rank(cm.role::text) > role_rank(p.role::text)
);
