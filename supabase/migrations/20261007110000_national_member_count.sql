-- National member count as one owner-rights number.
--
-- RECORD OF A PRODUCTION CHANGE. Applied to tjutlbzekfouwsiaplbr on 2026-10-07 through
-- pgq.sh (not supabase db push) by EcodiaOS on Tate's grant (iMessage 3693), after a
-- rolled-back dry run proved it from the anon role. Read back: SECURITY DEFINER,
-- search_path=public, EXECUTE for anon and authenticated only, returns 3,344.
--
-- WHY. useNationalImpact counted members with a head count over public_profiles. After
-- 20261007080800 anon has no grant on that view, so the count answered 401 and the whole
-- national query failed: the logged-out /download page showed "..." for all four stats.
-- The same count was already wrong for a signed-in member, who only sees co-members (208
-- for an Adelaide member instead of the national figure). Re-granting anon SELECT on the
-- view was ruled out: the view's anon revoke is part of the privacy fix.
--
-- WHAT. One number, no row data. Counts accounts that are not deleted and not pending
-- deletion, so it reads a few below the admin dashboard Members tile, which counts every
-- profiles row (3,344 against 3,347 on 2026-10-07). No view is touched, so the
-- eos_force_view_invoker_trg bracket does not apply.

CREATE OR REPLACE FUNCTION public.get_national_member_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::bigint
  FROM public.profiles p
  WHERE p.deleted_at IS NULL
    AND coalesce(p.deletion_status, 'active') = 'active';
$function$;

REVOKE ALL ON FUNCTION public.get_national_member_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_national_member_count() TO anon, authenticated;

COMMENT ON FUNCTION public.get_national_member_count() IS
  'National member count for the public /download page and /impact/national (Active Members). '
  'Owner rights on purpose: anon has no read on profiles or public_profiles since Stage 2 '
  '(2026-10-07), and a signed-in member only sees co-members, so neither can count the nation. '
  'Returns one number and no row data. Counts accounts not deleted and not pending deletion, '
  'so it reads a few below the admin dashboard Members tile, which counts every profiles row. '
  'Applied 2026-10-07 by EcodiaOS on Tate grant imessage:3693, board 7783780a.';
