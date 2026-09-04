-- ============================================================================
-- 20260905000000: revoke browser-role EXECUTE on all ten public.cron_*
-- pg_cron entry points, which anon could call to fire member email on demand.
--
-- Origin: found 2026-09-05 by the Co-Exist anon SECURITY DEFINER audit.
-- Board row: 98dad934
-- Doctrine: backend/patterns/a-revoke-naming-roles-leaves-public-executing-2026-09-04.md
-- Template: 20260904090000_revoke_public_execute_ticket_definers.sql
--
-- THE DEFECT. Every one of these functions is a pg_cron entry point. cron.job
-- invokes all of them as username=postgres (jobids 11,12,13,14,15,16,17,19,26
-- and the stats-drift row), so the scheduler never needs a browser-role grant.
-- All ten nonetheless carried grants reaching anon. Nine of the ten carried the
-- PUBLIC entry =X/postgres in their ACL alongside an explicit anon=X/postgres,
-- which is why this statement names PUBLIC first: a revoke that names only roles
-- leaves the PUBLIC default in place and anon stays a member of PUBLIC. That is
-- the exact class the 2026-09-04 ticket-definer migration was written for.
--
-- WHY IT MATTERED. Six of these bodies read the service_role key out of
-- vault.decrypted_secrets and net.http_post it as a Bearer token to an Edge
-- Function. Four of those Edge Functions send email to Co-Exist members
-- (event-day-notify, event-post-photo-invite, event-post-survey-invite,
-- event-post-impact-log-invite). Anyone holding the publishable anon key, which
-- ships in the web bundle, could therefore fire member notifications on demand
-- from Co-Exist's own system, at any rate they liked, outside the schedule.
-- That harm needs no privilege escalation and was the fully-demonstrated one.
--
-- HONEST BOUND. No key-exfiltration path was demonstrated. anon cannot CREATE
-- objects in schema public on Supabase by default, so the classic search_path
-- hijack against these unpinned definers had no writable schema to land in.
-- The search_path pins ride in the sibling migration 20260905000100.
--
-- WHY REVOKING FROM authenticated IS SAFE. A grep of src, supabase/functions,
-- scripts, web and shared for rpc('cron_...') returns zero call sites: no page
-- and no Edge Function invokes any of these by RPC. The only caller is cron.job
-- as postgres. service_role keeps its own explicit entry, which a PUBLIC revoke
-- does not touch.
--
-- cron_excel_to_sync is SECURITY INVOKER rather than DEFINER, so it is not in
-- the definer audit population, but it is the same kind of entry point and anon
-- calling it still reaches the excel-sync Edge Function with a service_role
-- bearer. It is revoked here with its nine siblings.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.cron_carpool_archive_sweep()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_collective_event_invite()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_event_day_notify()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_event_post_impact_log_invite() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_event_post_photo_invite()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_event_post_survey_invite()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_event_reengagement()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_excel_from_sync()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_excel_to_sync()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_stats_drift_check()            FROM PUBLIC, anon, authenticated;

-- Idempotent on a fresh db reset: postgres owns these and pg_cron runs as
-- postgres, so no grant is added back. service_role is left with whatever
-- explicit entry it already holds.
