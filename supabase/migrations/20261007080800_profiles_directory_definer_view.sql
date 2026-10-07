-- Member data visibility, Stage 2: the member directory view becomes the visibility
-- boundary and co-members lose their read on the base profiles table.
--
-- RECORD OF A PRODUCTION CHANGE. Applied to tjutlbzekfouwsiaplbr on 2026-10-07 08:08 UTC
-- through pgq.sh (not supabase db push) by EcodiaOS on Tate's grant (iMessage 3693), and
-- written into the repo afterwards so the repo and production agree. Every statement
-- below was rebuilt from the live pg_get_viewdef / pg_get_functiondef / reloptions / ACL
-- read back on 2026-10-07, not from an older migration. It supersedes what
-- 068_security_audit_hardening.sql says about public_profiles (an invoker view).
--
-- WHY. Under profiles_select_fellow_member any signed-in member could read the full
-- profiles row of every member sharing a collective with them. Measured on a tracked
-- member before the change: 1,347 other profiles, 1,006 dates of birth, 494 emergency
-- phones and 75 medical rows readable. After: 0 / 0 / 0 / 0, with the directory still
-- answering 1,347 names through public_profiles.
--
-- WHAT CHANGES.
--   A. public_profiles becomes SECURITY DEFINER + security_barrier with its own row
--      predicate and 11 non-sensitive columns, SELECT for authenticated only. The
--      auth.uid() IS NOT NULL gate is load-bearing: under definer semantics no RLS sits
--      underneath, so without it anon would read every name and avatar.
--   B. profiles_select_fellow_member is dropped. profiles answers self, global staff and
--      the bounded organiser arm (C).
--   C. is_event_registrant_of_led_collective is bounded to registered / attended /
--      waitlisted / cancelled registrants of published / completed events within
--      90 days ahead and 365 days back ('invited' deliberately excluded).
--   D. is_trusted_backend_caller no longer trusts an unset role GUC by default; with no
--      role GUC it trusts only a privileged session_user.
--
-- ANON. Anon has no grant on public_profiles. Anything logged-out that needs a count of
-- members uses public.get_national_member_count() (20261007110000), never this view.
--
-- GUARD. Production carries a fleet event trigger, eos_force_view_invoker_trg, that heals
-- any CREATE/ALTER VIEW in public back to security_invoker=true, which would turn this
-- view into a self-only directory. The DDL is bracketed with DISABLE / ENABLE when that
-- trigger exists; on a database without it (a fresh local replay) the bracket is a no-op.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'eos_force_view_invoker_trg') THEN
    EXECUTE 'ALTER EVENT TRIGGER eos_force_view_invoker_trg DISABLE';
  END IF;
END $$;

-- A. The directory view. The column list IS the security boundary: never add a column
--    without deciding, in writing, that every co-member may read it.
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.pronouns,
    p.interests,
    p.membership_level,
    p.points,
    p.role,
    p.onboarding_completed,
    p.created_at
  FROM public.profiles p
  WHERE
    auth.uid() IS NOT NULL
    AND (
      p.id = auth.uid()
      OR public.is_admin_or_staff(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.collective_members cm_self
        JOIN public.collective_members cm_other
          ON cm_other.collective_id = cm_self.collective_id
        WHERE cm_self.user_id  = auth.uid()
          AND cm_other.user_id = p.id
          AND cm_self.status  = 'active'
          AND cm_other.status = 'active'
      )
      OR public.is_event_registrant_of_led_collective(auth.uid(), p.id)
    );

ALTER VIEW public.public_profiles
  SET (security_invoker = false, security_barrier = true);

-- Read-only and authenticated-only. The view is single-table and so auto-updatable, and
-- it exposes role: without this REVOKE a definer view plus an UPDATE grant would let a
-- member promote themselves.
REVOKE ALL ON public.public_profiles FROM anon, authenticated;
GRANT SELECT ON public.public_profiles TO authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Member directory. SECURITY DEFINER by design: it carries its own row '
  'predicate because the base table is restricted to self and global staff. '
  'The column list IS the security boundary. Do not add a column without '
  'deciding, in writing, that every co-member may read it. '
  'GUARD: event trigger eos_force_view_invoker_trg re-heals any CREATE/ALTER VIEW '
  'in public to security_invoker=true. Any DDL on this view must be bracketed with '
  'ALTER EVENT TRIGGER eos_force_view_invoker_trg DISABLE / ENABLE in the same '
  'transaction, or the directory silently shows each member only themselves. '
  'Applied 2026-10-07 by EcodiaOS on Tate grant imessage:3693.';

-- B. Co-members no longer read the base table.
DROP POLICY IF EXISTS profiles_select_fellow_member ON public.profiles;

-- C. The organiser arm, bounded to the event window.
CREATE OR REPLACE FUNCTION public.is_event_registrant_of_led_collective(viewer uuid, target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN viewer IS NULL THEN false
    WHEN viewer IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller() THEN EXISTS (
      SELECT 1
      FROM event_registrations er
      JOIN events e ON e.id = er.event_id
      WHERE er.user_id = target
        AND is_collective_staff(viewer, e.collective_id)
        AND er.status IN ('registered', 'attended', 'waitlisted', 'cancelled')
        AND e.status IN ('published', 'completed')
        AND e.date_start <= now() + interval '90 days'
        AND coalesce(e.date_end, e.date_start) >= now() - interval '365 days'
    )
    ELSE false
  END;
$function$;

-- D. No trust by default when the role GUC is unset. session_user, not current_user:
--    inside a SECURITY DEFINER caller current_user is the function owner.
CREATE OR REPLACE FUNCTION public.is_trusted_backend_caller()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN coalesce(pg_catalog.current_setting('role', true), 'none')
         IN ('service_role', 'postgres', 'supabase_admin')
      THEN true
    WHEN coalesce(pg_catalog.current_setting('role', true), 'none') = 'none'
      THEN session_user::text IN ('postgres', 'supabase_admin', 'service_role')
    ELSE false
  END;
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'eos_force_view_invoker_trg') THEN
    EXECUTE 'ALTER EVENT TRIGGER eos_force_view_invoker_trg ENABLE';
  END IF;
END $$;
