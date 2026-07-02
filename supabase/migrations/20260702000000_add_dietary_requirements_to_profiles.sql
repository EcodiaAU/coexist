-- 20260702000000: Add dietary_requirements to profiles
-- Campouts (e.g. Wild Mountains 10 July) previously needed a manual Eventbrite
-- custom-questions export every event to learn attendee dietary needs. This adds
-- a first-class dietary field on the profile so future events surface it straight
-- from the roster, mirroring the existing accessibility_requirements field.
-- Medical conditions are deliberately NOT stored here: they are safety-sensitive
-- and stay in the organiser-facing summary, never a member-visible profile field.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dietary_requirements text;

-- The role-tiered profile fetch (get_user_profile_v1) hand-builds its jsonb
-- payload, so a new column is invisible to non-self viewers until it is added
-- here. Redefine it to also return dietary_requirements, gated by the same
-- v_can_see_sensitive tier as the other safety fields (staff + self only).
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
    'dietary_requirements',           CASE WHEN v_can_see_sensitive THEN v_profile.dietary_requirements           ELSE NULL END,
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
