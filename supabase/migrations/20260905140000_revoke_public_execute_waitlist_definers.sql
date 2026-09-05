-- ============================================================================
-- 20260905140000: take PUBLIC, anon and authenticated off the three waitlist
-- SECURITY DEFINER writers. Two of them were already revoked from anon and
-- authenticated by name and stayed anon-callable anyway, because PUBLIC still
-- carried the grant. The third was never revoked at all.
--
-- Origin: found 2026-09-05 by assertion 6 (the census arm) of
-- backend/scripts/coexist-secdef-guard-canary.cjs on its first live run, hours
-- after 20260905000000 / 000100 / 000200 closed the same class.
-- Board row: 98dad934
-- Doctrine: backend/patterns/a-revoke-naming-roles-leaves-public-executing-2026-09-04.md
--           backend/patterns/a-canary-of-named-assertions-cannot-see-what-nobody-named-2026-09-05.md
--
-- LIVE ACL BEFORE THIS MIGRATION, read from pg_proc.proacl on
-- tjutlbzekfouwsiaplbr, 2026-09-05:
--
--   cron_waitlist_notify()
--     {=X/postgres,postgres=X/postgres,anon=X/postgres,
--      authenticated=X/postgres,service_role=X/postgres}
--     anon holds EXECUTE EXPLICITLY here, not merely through PUBLIC. This one
--     reads the service_role key out of vault.decrypted_secrets and POSTs it to
--     the waitlist-notify Edge Function, which emails Co-Exist members. It is
--     pg_cron job 29 (*/5 * * * *, as postgres). Anyone holding the publishable
--     anon key that ships in the web bundle could fire member mail on demand.
--     20260905000000 enumerated the cron entry points that existed when it was
--     written and this one is not in that list.
--
--   mark_waitlist_notified(uuid[])
--   waitlist_drain_candidates(uuid, boolean)
--     {=X/postgres,postgres=X/postgres,service_role=X/postgres}
--     Their REVOKE ALL ... FROM anon, authenticated at lines 587 and 611 of
--     20260905120000_event_waitlist.sql DID land: neither role has an explicit
--     entry. The leading =X/postgres is the PUBLIC grant, and PUBLIC covers
--     every role, so has_function_privilege('anon', oid, 'EXECUTE') stayed true.
--     An anon caller could force-drain a waitlist through the p_force argument,
--     or stamp notified_at on entries so the real notification never goes out.
--
-- WHY NO CALLER BREAKS. Every caller was enumerated before this was written,
-- both directions, per the gotcha recorded on 20260904090000:
--   in-database  pg_proc.prosrc sweep for all three names returns ZERO callers
--                other than the functions themselves.
--   pg_cron      job 29 runs SELECT public.cron_waitlist_notify() as postgres,
--                which owns all three and is unaffected by a PUBLIC revoke.
--   Edge         supabase/functions/waitlist-notify/index.ts builds its client
--                with SUPABASE_SERVICE_ROLE_KEY and calls waitlist_drain_
--                candidates and mark_waitlist_notified. service_role keeps its
--                own explicit =X/postgres entry, which a PUBLIC revoke does not
--                touch.
--   browser      a grep of src, supabase/functions, scripts, web and shared
--                finds no anon or authenticated caller of any of the three. The
--                only src hits are generated rows in src/types/database.types.ts.
-- The public join and leave paths are join_event_waitlist, leave_event_waitlist
-- and my_event_waitlist_state, which keep their anon and authenticated grants
-- and are NOT touched here.
--
-- VERIFY AFTER APPLYING (all three must read false/false/true):
--   SELECT p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_x,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc_x,
--          p.proacl::text
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('cron_waitlist_notify','mark_waitlist_notified',
--                       'waitlist_drain_candidates');
-- then re-run backend/scripts/coexist-secdef-guard-canary.cjs and expect the
-- three census.unguarded failures and census.cron_grants.cron_waitlist_notify
-- to become notes.
-- ============================================================================

-- PUBLIC first. Naming only anon and authenticated is what left this open.
REVOKE ALL ON FUNCTION public.cron_waitlist_notify()                        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_waitlist_notified(uuid[])                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.waitlist_drain_candidates(uuid, boolean)      FROM PUBLIC;

-- Then the explicit role entries. Only cron_waitlist_notify actually carries
-- them today; the other two are stated so a later CREATE OR REPLACE that
-- re-grants cannot quietly reopen the hole.
REVOKE ALL ON FUNCTION public.cron_waitlist_notify()                        FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_waitlist_notified(uuid[])                FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.waitlist_drain_candidates(uuid, boolean)      FROM anon, authenticated;

-- Restate the two principals that genuinely call these, so the grant is
-- explicit rather than inherited from PUBLIC.
GRANT EXECUTE ON FUNCTION public.cron_waitlist_notify()                     TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_waitlist_notified(uuid[])             TO service_role;
GRANT EXECUTE ON FUNCTION public.waitlist_drain_candidates(uuid, boolean)   TO service_role;
