-- Fix profiles.role to match collective role for non-manager/admin users.
-- The old national_leader → leader migration over-promoted everyone.
-- Under the unified system, profiles.role should match the user's
-- actual collective role, not the inflated global role.
--
-- Rule: for users who are manager or admin, keep that role.
-- For everyone else, use their highest collective role.

UPDATE profiles p
SET role = COALESCE(
  (
    SELECT cm.role::text
    FROM collective_members cm
    WHERE cm.user_id = p.id AND cm.status = 'active'
    ORDER BY role_rank(cm.role::text) DESC
    LIMIT 1
  ),
  'participant'
)::user_role
WHERE p.role::text NOT IN ('manager', 'admin')
  AND EXISTS (
    SELECT 1 FROM collective_members cm
    WHERE cm.user_id = p.id AND cm.status = 'active'
  );
