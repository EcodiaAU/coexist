-- Fix admin_list_users return type mismatch
-- display_name is varchar in profiles, function declared text
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
  display_name varchar,
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
    COALESCE(au.email, '')::text AS email,
    p.display_name,
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
