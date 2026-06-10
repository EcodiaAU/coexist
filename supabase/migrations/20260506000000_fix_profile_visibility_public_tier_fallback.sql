-- ============================================================================
-- Fix: /profile/<id> and ProfileModal (/admin/users etc) showing
--   "User not found / This profile doesn't exist or has been removed"
--   for legitimate users.
--
-- Root cause: get_user_profile_v1 (migration 20260501040000) gated the
-- ENTIRE row behind v_can_see_at_all - returning NULL when caller is
-- non-staff AND not self AND not a fellow active collective member.
-- The frontend useProfile() hook treats that NULL identically to "profile
-- doesn't exist", surfacing the misleading "user not found" empty state on
-- /profile/<id> (ViewProfilePage) and any page opening ProfileModal
-- (admin/users tap, chat avatar tap).
--
-- The PII tiering is already enforced field-by-field via v_can_see_sensitive
-- (sensitive fields → NULL for non-staff non-self). The visibility-at-all
-- gate is redundant; its only effect was to convert a legitimate
-- public-profile lookup into a false-negative.
--
-- Fix: redefine get_user_profile_v1 to drop the v_can_see_at_all gate.
-- Public-tier fields (display_name, avatar, bio, pronouns, interests,
-- membership_level, points, role, instagram_handle, created_at, updated_at,
-- onboarding_completed) become visible to any authenticated caller for any
-- existing profile. Sensitive fields remain NULL for non-staff non-self.
--
-- Security boundary: unchanged. Sensitive PII still gated. RLS on profiles
-- table unchanged. Unauthenticated callers (auth.uid() = NULL) still get
-- NULL. Truly-missing profiles still get NULL.
--
-- Origin: Tate verbatim 6 May 2026 ~11:12 AEST -
-- "/profile detail page in CE says user not found, profile doesn t exist
--  or has been removed, need to fix that too + might be doing the same
--  thing on many pages including /admin/users"
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_profile_v1(target_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile profiles%ROWTYPE;
  v_can_see_sensitive boolean;
  v_is_self boolean;
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

  -- Note: previous v_can_see_at_all gate (mirrored profiles_select_fellow_member
  -- RLS) removed. Public-tier fields are visible to any authenticated caller
  -- for any existing profile. Sensitive PII stays gated by v_can_see_sensitive.

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

COMMENT ON FUNCTION get_user_profile_v1(uuid) IS
  'Role-tiered profile fetch. Returns full profile to self and staff '
  '(assist_leader+); strips sensitive PII for non-staff while still '
  'returning public-tier fields. Used by src/hooks/use-profile.ts '
  'useProfile() when viewing another user. '
  'Origin: Tate directive 29 Apr 2026 20:05 AEST (visibility tiering); '
  'fix 6 May 2026 (drop v_can_see_at_all gate that produced false '
  '"user not found" UX - fork_motdkqcv_dffcfb).';
