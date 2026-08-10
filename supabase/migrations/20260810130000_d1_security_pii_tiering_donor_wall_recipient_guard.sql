-- ============================================================
-- 20260810130000  D1 Security A: PII tiering + anon-callable RPC guards
--
-- Cluster D1 of the Co-Exist backlog remediation program (2026-08-10).
-- Three independent, additive + reversible security fixes.
--
-- 301  recipient_next_events was SECURITY DEFINER with the default PUBLIC
--      EXECUTE never revoked, so anon could call it with an arbitrary uuid[]
--      and harvest each user's next event time + street address + collective.
--      Add an is_admin_tier caller guard and REVOKE from PUBLIC/anon. Internal
--      callers - the send-campaign edge function (service_role) and the
--      event_digest / event_reengagement SECURITY DEFINER engines run by
--      pg_cron/service_role - call with auth.uid() = NULL and pass the guard;
--      internal SQL calls resolve EXECUTE against the owner, so the REVOKE
--      only blocks direct PostgREST calls by anon.
--
-- 292  donations_select_public granted every authenticated user whole-row
-- 295  SELECT of every public+succeeded donation (donor_email, donor_name,
--      stripe_payment_id) - RLS is row-level, never column-level. The donor
--      wall also embedded profiles(...) under profiles RLS, collapsing most
--      opted-in donors to "Anonymous". Replace both with the
--      get_public_donor_wall SECURITY DEFINER projection (recognition columns
--      only; resolves display_name/avatar inside the definer) and DROP the
--      over-broad policy. Own-donation reads (donations_select_own_or_admin)
--      and admin reads are untouched.
--
-- 496  get_user_profile_v1 never consulted is_profile_visible, so the "Only
-- 542  collective members" toggle was a no-op; and it gated the sensitive-PII
--      tier on the caller's GLOBAL role via is_collective_staff_or_above,
--      letting any of ~69 staff-tier accounts read email/phone/DOB/GPS/medical/
--      emergency PII of ANY of ~2019 users nationwide. Rewrite the tiering:
--        - sensitive PII: is_self OR is_admin_or_staff(caller)
--          [national_leader/manager/admin keep cross-collective] OR
--          (staff-tier caller AND shares an active collective with the target).
--        - public-but-personal tier: honour is_profile_visible(target); a
--          private profile returns name + avatar only to non-members, flagged
--          with viewer_can_see_profile = false.
--
-- Non-destructive: CREATE OR REPLACE + one DROP POLICY whose only consumer
-- (the donor wall) is repointed to the RPC in the same ship. Fully reversible.
-- ============================================================

-- ---- 301: recipient_next_events caller guard + REVOKE ---------------------
CREATE OR REPLACE FUNCTION public.recipient_next_events(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  event_id uuid,
  title text,
  date_start timestamptz,
  address text,
  collective_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deny plain authenticated (non-admin) callers. service_role and the
  -- internal SECURITY DEFINER engines call with auth.uid() = NULL and pass;
  -- anon is blocked by the REVOKE below (the privilege check precedes the body).
  IF auth.uid() IS NOT NULL AND NOT is_admin_tier(auth.uid()) THEN
    RAISE EXCEPTION 'recipient_next_events: admin tier required'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (cm.user_id)
    cm.user_id,
    e.id AS event_id,
    e.title,
    e.date_start,
    e.address,
    c.name AS collective_name
  FROM collective_members cm
  JOIN events e ON e.collective_id = cm.collective_id
  JOIN collectives c ON c.id = e.collective_id
  WHERE cm.user_id = ANY(p_user_ids)
    AND cm.status = 'active'
    AND e.status = 'published'
    AND e.date_start > now()
  ORDER BY cm.user_id, e.date_start ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recipient_next_events(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recipient_next_events(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.recipient_next_events(uuid[]) IS
  'Per-user earliest upcoming published event across active collective '
  'memberships. Admin-tier (manager/admin) direct callers only; service_role '
  'and internal engines pass with auth.uid() NULL; anon REVOKEd. Backlog D1/301.';

-- ---- 292 + 295: donor wall PII projection ---------------------------------
CREATE OR REPLACE FUNCTION public.get_public_donor_wall(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  on_behalf_of text,
  amount numeric,
  message text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    COALESCE(p.display_name, d.donor_name) AS display_name,
    p.avatar_url,
    d.on_behalf_of,
    d.amount,
    d.message,
    d.created_at
  FROM donations d
  LEFT JOIN profiles p ON p.id = d.user_id
  WHERE d.status = 'succeeded'
    AND d.is_public = true
  ORDER BY d.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_donor_wall(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_public_donor_wall(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_public_donor_wall(integer) IS
  'Public donor wall projection: recognition fields only (name/avatar/amount/'
  'message/date) - never donor_email or stripe id. Resolves display_name/avatar '
  'inside the definer to fix the profiles-RLS "Anonymous" collapse. Backlog D1/292,295.';

-- Drop the over-broad row policy that leaked donor PII (donor_email/donor_name/
-- stripe_payment_id) to every authenticated user. The donor wall, its only
-- consumer, now reads get_public_donor_wall; own-donation reads keep
-- donations_select_own_or_admin. Reversible: recreate the policy to restore
-- the prior (leaky) behaviour.
DROP POLICY IF EXISTS donations_select_public ON public.donations;

-- ---- 496 + 542-546: profile PII tiering -----------------------------------
CREATE OR REPLACE FUNCTION public.get_user_profile_v1(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Does the caller share an ACTIVE collective membership with the target?
  v_shares_collective := EXISTS (
    SELECT 1
    FROM collective_members a
    JOIN collective_members b ON b.collective_id = a.collective_id
    WHERE a.user_id = v_caller       AND a.status = 'active'
      AND b.user_id = target_user_id AND b.status = 'active'
  );

  -- Sensitive PII (email/phone/DOB/GPS/medical/emergency/etc): self, a
  -- cross-collective admin/national tier, or a staff-tier caller who shares an
  -- active collective with the target. Closes the nationwide staff leak - a
  -- collective-level leader can no longer read PII of users in collectives they
  -- have no relationship with.
  v_can_see_sensitive :=
        v_is_self
     OR v_is_global_staff
     OR (is_collective_staff_or_above(v_caller) AND v_shares_collective);

  -- Public-but-personal tier (bio/pronouns/interests/points/role/instagram):
  -- honour the "Only collective members" toggle. A public profile (the default)
  -- is visible to every authenticated caller as before; a private profile is
  -- visible only to self / a fellow active member / admin. When sensitive is
  -- visible, profile is necessarily visible too.
  v_can_see_profile :=
        v_is_self
     OR v_is_global_staff
     OR v_shares_collective
     OR is_profile_visible(target_user_id);

  RETURN jsonb_build_object(
    'id',                   v_profile.id,
    'display_name',         v_profile.display_name,
    'avatar_url',           v_profile.avatar_url,
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
$$;

COMMENT ON FUNCTION public.get_user_profile_v1(uuid) IS
  'Tier-aware profile read. Sensitive PII: self / national+manager+admin / '
  'staff-tier sharing an active collective with the target. Public tier honours '
  'is_profile_visible (private => name+avatar only, viewer_can_see_profile=false). '
  'Backlog D1/496,542.';
