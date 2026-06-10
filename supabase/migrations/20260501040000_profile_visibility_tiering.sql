-- ============================================================================
-- Migration 079: Role-tiered participant profile visibility
--
-- Goal: Non-leaders (role='participant') must NOT see sensitive PII on other
-- users' profiles when accessed via /chat avatar tap (ProfileModal) or
-- /profile/:userId (ViewProfilePage). Staff-tier roles
-- (assist_leader, co_leader, leader, national_leader, manager, admin)
-- continue to see everything.
--
-- Background: useProfile() in src/hooks/use-profile.ts calls
-- supabase.from('profiles').select('*'). RLS policy
-- profiles_select_fellow_member (added in 068) grants any same-collective
-- member SELECT on the full row. PostgreSQL RLS does not support
-- column-level scoping per role, so the security boundary is moved into a
-- SECURITY DEFINER RPC that returns a role-aware projection.
--
-- This migration:
--   1. Adds is_collective_staff_or_above(uid) - matches all staff-tier roles
--      (extends is_admin_or_staff which only matched national_leader+).
--   2. Adds get_user_profile_v1(target_user_id) RPC that returns a
--      role-tiered jsonb payload. Non-staff viewers receive NULL for every
--      sensitive field plus viewer_can_see_sensitive=false. Staff and self
--      receive the full record with viewer_can_see_sensitive=true.
--   3. Backward-compat: leaves existing RLS policies untouched, so any
--      caller that still selects from profiles directly continues to work.
--      Frontend useProfile() is updated to use the RPC for non-self lookups.
--
-- Field classification (Tate directive 29 Apr 2026 20:05 AEST: "non-leaders
-- can't see any semi or fully sensetive information about someone"):
--   PUBLIC (always visible):
--     id, display_name, avatar_url, bio, pronouns, interests,
--     membership_level, points, role, onboarding_completed, created_at,
--     instagram_handle
--   STAFF-ONLY (visible to assist_leader+ and self):
--     first_name, last_name, email, phone, age, date_of_birth, gender,
--     postcode, location, location_point, accessibility_requirements,
--     emergency_contact_name, emergency_contact_phone,
--     emergency_contact_relationship, collective_discovery, is_suspended,
--     suspended_reason, suspended_until
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper: is_collective_staff_or_above
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_collective_staff_or_above(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid
      AND role IN (
        'assist_leader',
        'co_leader',
        'leader',
        'national_leader',
        'manager',
        'admin'
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION is_collective_staff_or_above(uuid) TO authenticated;

COMMENT ON FUNCTION is_collective_staff_or_above(uuid) IS
  'Returns true if the user has any staff-tier role (assist_leader through admin). '
  'Used by get_user_profile_v1 to gate sensitive PII visibility. '
  'Distinct from is_admin_or_staff which only matches national_leader+.';

-- ----------------------------------------------------------------------------
-- 2. RPC: get_user_profile_v1
-- ----------------------------------------------------------------------------
-- Returns a role-tiered profile payload. Acts as the canonical entry point
-- for fetching another user's profile. SECURITY DEFINER so the function
-- itself can read the full profiles row, then projects only what the caller
-- is allowed to see.
--
-- Returns null if no profile exists, or if the caller has no relationship
-- to the target user (not staff, not self, not a fellow collective member).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_profile_v1(target_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile profiles%ROWTYPE;
  v_can_see_sensitive boolean;
  v_is_self boolean;
  v_can_see_at_all boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = target_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_is_self := v_caller = target_user_id;
  v_can_see_sensitive := v_is_self OR is_collective_staff_or_above(v_caller);

  -- Visibility-at-all check mirrors the existing
  -- profiles_select_fellow_member RLS policy: caller must be self,
  -- staff, or a fellow active collective member.
  IF v_can_see_sensitive THEN
    v_can_see_at_all := true;
  ELSE
    v_can_see_at_all := EXISTS (
      SELECT 1
      FROM collective_members cm1
      JOIN collective_members cm2 ON cm1.collective_id = cm2.collective_id
      WHERE cm1.user_id = v_caller
        AND cm2.user_id = target_user_id
        AND cm1.status = 'active'
        AND cm2.status = 'active'
    );
  END IF;

  IF NOT v_can_see_at_all THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    -- Always-public fields
    'id',                   v_profile.id,
    'display_name',         v_profile.display_name,
    'avatar_url',           v_profile.avatar_url,
    'bio',                  v_profile.bio,
    'pronouns',             v_profile.pronouns,
    'interests',            v_profile.interests,
    'membership_level',     v_profile.membership_level,
    'points',               v_profile.points,
    'role',                 v_profile.role,
    'onboarding_completed', v_profile.onboarding_completed,
    'created_at',           v_profile.created_at,
    'updated_at',           v_profile.updated_at,
    'instagram_handle',     v_profile.instagram_handle,

    -- Staff-only fields (NULL for non-staff non-self)
    'first_name',                     CASE WHEN v_can_see_sensitive THEN v_profile.first_name                     ELSE NULL END,
    'last_name',                      CASE WHEN v_can_see_sensitive THEN v_profile.last_name                      ELSE NULL END,
    'email',                          CASE WHEN v_can_see_sensitive THEN v_profile.email                          ELSE NULL END,
    'phone',                          CASE WHEN v_can_see_sensitive THEN v_profile.phone                          ELSE NULL END,
    'age',                            CASE WHEN v_can_see_sensitive THEN v_profile.age                            ELSE NULL END,
    'date_of_birth',                  CASE WHEN v_can_see_sensitive THEN v_profile.date_of_birth                  ELSE NULL END,
    'gender',                         CASE WHEN v_can_see_sensitive THEN v_profile.gender                         ELSE NULL END,
    'postcode',                       CASE WHEN v_can_see_sensitive THEN v_profile.postcode                       ELSE NULL END,
    'location',                       CASE WHEN v_can_see_sensitive THEN v_profile.location                       ELSE NULL END,
    'location_point',                 CASE WHEN v_can_see_sensitive THEN v_profile.location_point::text           ELSE NULL END,
    'accessibility_requirements',     CASE WHEN v_can_see_sensitive THEN v_profile.accessibility_requirements     ELSE NULL END,
    'emergency_contact_name',         CASE WHEN v_can_see_sensitive THEN v_profile.emergency_contact_name         ELSE NULL END,
    'emergency_contact_phone',        CASE WHEN v_can_see_sensitive THEN v_profile.emergency_contact_phone        ELSE NULL END,
    'emergency_contact_relationship', CASE WHEN v_can_see_sensitive THEN v_profile.emergency_contact_relationship ELSE NULL END,
    'collective_discovery',           CASE WHEN v_can_see_sensitive THEN v_profile.collective_discovery           ELSE NULL END,
    'is_suspended',                   CASE WHEN v_can_see_sensitive THEN v_profile.is_suspended                   ELSE NULL END,
    'suspended_reason',               CASE WHEN v_can_see_sensitive THEN v_profile.suspended_reason               ELSE NULL END,
    'suspended_until',                CASE WHEN v_can_see_sensitive THEN v_profile.suspended_until                ELSE NULL END,

    -- Tier flag for the UI to render [redacted] placeholders consistently
    'viewer_can_see_sensitive', v_can_see_sensitive,
    'is_self',                  v_is_self
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION get_user_profile_v1(uuid) TO authenticated;

COMMENT ON FUNCTION get_user_profile_v1(uuid) IS
  'Role-tiered profile fetch. Returns full profile to self and staff '
  '(assist_leader+); strips sensitive PII for non-staff. Used by '
  'src/hooks/use-profile.ts useProfile() when viewing another user. '
  'Origin: Tate directive 29 Apr 2026 20:05 AEST - non-leaders must not '
  'see semi-sensitive or fully-sensitive information.';
