-- ============================================================================
-- 20260826001000: revoke anon/authenticated EXECUTE on the mass-send runners
--
-- Origin: 2026-08-26, found while auditing the authenticated-tier SECDEF
-- residual from the 2026-08-20 anon-past-RLS stress test.
-- Doctrine: backend/patterns/anon-definer-view-is-a-fleet-invariant-2026-08-20.md
--
-- The 2026-08-20 remediation revoked anon/authenticated EXECUTE on the bulk-data
-- target functions (email_digest_targets, reengagement_targets,
-- collective_event_invite_targets) and that revoke is intact.
--
-- It was LAUNDERED. Each *_run wrapper is SECURITY DEFINER owned by postgres and
-- calls its locked target function as the definer, and the wrappers themselves
-- kept explicit anon + authenticated EXECUTE grants. Proven live 2026-08-26:
-- SET LOCAL role anon; SELECT public.event_digest_run(true) returned
-- {"targets": 93, "sample": [...]} with 5 real member emails and names.
--
-- p_dry_run DEFAULTS TO FALSE, so an unauthenticated caller invoking
-- event_digest_run() with no arguments would have inserted 93 email_digest_sent
-- rows and fired a real mass email through net.http_post using the vault
-- service_role_key. Same shape for event_reengagement_run and
-- collective_event_invite_run (push notifications).
--
-- pg_cron runs these as `postgres` (jobs event-digest, event-reengagement call
-- them directly; collective-event-invite goes via cron_collective_event_invite),
-- and no application or edge-function code calls them, so revoking the caller
-- tiers does not affect any live path.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.event_digest_run(boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.event_reengagement_run(boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.collective_event_invite_run(boolean, uuid[]) FROM PUBLIC, anon, authenticated;
