-- UNIFIED ROLE SYSTEM - Part 2: Migrate data and update functions
-- Must be a separate migration so new enum values are committed and usable.

-- 1. Migrate national_leader → leader in profiles
UPDATE profiles SET role = 'leader'::user_role WHERE role = 'national_leader'::user_role;

-- 2. Migrate member → participant in collective_members
UPDATE collective_members SET role = 'participant'::collective_role WHERE role = 'member'::collective_role;

-- 3. Update default for collective_members
ALTER TABLE collective_members ALTER COLUMN role SET DEFAULT 'participant'::collective_role;

-- 4. Update role-checking functions to include 'leader' alongside legacy 'national_leader'
CREATE OR REPLACE FUNCTION is_admin_or_staff(uid uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = uid AND role::text IN ('national_leader', 'leader', 'manager', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. Update staff channel sync
DROP TRIGGER IF EXISTS trg_national_staff_channel ON profiles;

CREATE OR REPLACE FUNCTION sync_national_staff_channel()
RETURNS trigger AS $$
DECLARE
  staff_channel_id uuid;
BEGIN
  SELECT id INTO staff_channel_id
  FROM chat_channels WHERE slug = 'staff_national' LIMIT 1;

  IF staff_channel_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.role::text IN ('national_leader', 'leader', 'manager', 'admin') THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    VALUES (staff_channel_id, NEW.id)
    ON CONFLICT DO NOTHING;
  ELSE
    IF OLD IS NOT NULL AND OLD.role::text IN ('national_leader', 'leader', 'manager', 'admin') THEN
      DELETE FROM chat_channel_members
      WHERE channel_id = staff_channel_id AND user_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_national_staff_channel
  AFTER INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_national_staff_channel();

-- 6. Update admin_list_users to return text for role
DROP FUNCTION IF EXISTS admin_list_users(text, text, int, int);
CREATE OR REPLACE FUNCTION admin_list_users(
  search_term text DEFAULT '',
  role_filter text DEFAULT '',
  result_limit int DEFAULT 50,
  offset_val int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  collective_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    COALESCE(au.email, '') AS email,
    COALESCE(p.display_name, '') AS display_name,
    p.avatar_url,
    p.role::text,
    p.created_at,
    au.last_sign_in_at,
    (SELECT count(*) FROM collective_members cm WHERE cm.user_id = p.id AND cm.status = 'active') AS collective_count
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE
    (search_term = '' OR p.display_name ILIKE '%' || search_term || '%' OR au.email ILIKE '%' || search_term || '%')
    AND (role_filter = '' OR p.role::text = role_filter)
  ORDER BY p.created_at DESC
  LIMIT result_limit OFFSET offset_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
