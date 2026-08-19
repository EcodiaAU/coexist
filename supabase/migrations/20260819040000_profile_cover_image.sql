-- Profile cover image (Jess 2026-08-19): let members upload their own profile
-- cover photo instead of only inheriting a collective's hero landscape.
--
-- 1. Add the column. Not sensitive PII, so it is returned unconditionally
--    (same tier as avatar_url) by get_user_profile_v1 - a new column is
--    otherwise INVISIBLE to non-self viewers because the RPC hand-builds its
--    jsonb payload (see the accessibility/dietary column history).

alter table public.profiles add column if not exists cover_image_url text;

-- 2. Re-declare get_user_profile_v1 to surface cover_image_url on every read,
--    right after avatar_url. Body is otherwise identical to the prior version;
--    every privacy tier gate is preserved verbatim.

CREATE OR REPLACE FUNCTION public.get_user_profile_v1(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile profiles%ROWTYPE;
  v_is_self boolean;
  v_is_global_staff boolean;    -- national_leader / manager / admin (cross-collective)
  v_shares_collective boolean;  -- caller & target share an active collective
  v_can_see_sensitive boolean;
  v_can_see_profile boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = target_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_is_self         := v_caller = target_user_id;
  v_is_global_staff := is_admin_or_staff(v_caller);

  v_shares_collective := EXISTS (
    SELECT 1
    FROM collective_members a
    JOIN collective_members b ON b.collective_id = a.collective_id
    WHERE a.user_id = v_caller       AND a.status = 'active'
      AND b.user_id = target_user_id AND b.status = 'active'
  );

  v_can_see_sensitive :=
        v_is_self
     OR v_is_global_staff
     OR (is_collective_staff_or_above(v_caller) AND v_shares_collective);

  v_can_see_profile :=
        v_is_self
     OR v_is_global_staff
     OR v_shares_collective
     OR is_profile_visible(target_user_id);

  RETURN jsonb_build_object(
    'id',                   v_profile.id,
    'display_name',         v_profile.display_name,
    'avatar_url',           v_profile.avatar_url,
    'cover_image_url',      v_profile.cover_image_url,
    'bio',                  CASE WHEN v_can_see_profile THEN v_profile.bio                  ELSE NULL END,
    'pronouns',             CASE WHEN v_can_see_profile THEN v_profile.pronouns             ELSE NULL END,
    'interests',            CASE WHEN v_can_see_profile THEN v_profile.interests            ELSE NULL END,
    'membership_level',     CASE WHEN v_can_see_profile THEN v_profile.membership_level     ELSE NULL END,
    'points',               CASE WHEN v_can_see_profile THEN v_profile.points               ELSE NULL END,
    'role',                 CASE WHEN v_can_see_profile THEN v_profile.role                 ELSE NULL END,
    'onboarding_completed', CASE WHEN v_can_see_profile THEN v_profile.onboarding_completed ELSE NULL END,
    'created_at',           v_profile.created_at,
    'updated_at',           v_profile.updated_at,
    'instagram_handle',     CASE WHEN v_can_see_profile THEN v_profile.instagram_handle     ELSE NULL END,
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
    'medical_requirements',           CASE WHEN v_can_see_sensitive THEN v_profile.medical_requirements           ELSE NULL END,
    'emergency_contact_name',         CASE WHEN v_can_see_sensitive THEN v_profile.emergency_contact_name         ELSE NULL END,
    'emergency_contact_phone',        CASE WHEN v_can_see_sensitive THEN v_profile.emergency_contact_phone        ELSE NULL END,
    'emergency_contact_relationship', CASE WHEN v_can_see_sensitive THEN v_profile.emergency_contact_relationship ELSE NULL END,
    'collective_discovery',           CASE WHEN v_can_see_sensitive THEN v_profile.collective_discovery           ELSE NULL END,
    'is_suspended',                   CASE WHEN v_can_see_sensitive THEN v_profile.is_suspended                   ELSE NULL END,
    'suspended_reason',               CASE WHEN v_can_see_sensitive THEN v_profile.suspended_reason               ELSE NULL END,
    'suspended_until',                CASE WHEN v_can_see_sensitive THEN v_profile.suspended_until                ELSE NULL END,
    'viewer_can_see_sensitive', v_can_see_sensitive,
    'viewer_can_see_profile',   v_can_see_profile,
    'is_self',                  v_is_self
  );
END;
$function$;
