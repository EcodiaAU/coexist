-- ============================================================================
-- 20260905000200: take anon off the SECURITY DEFINER writers that no logged-out
-- page calls, and stop one signed-in member acting on another member's row in
-- the two that carry a user id.
--
-- Origin: found 2026-09-05 by the Co-Exist anon SECURITY DEFINER audit.
-- Board row: 98dad934
-- Siblings: 20260905000000 (cron entry points), 20260905000100 (search_path).
-- Doctrine: backend/patterns/a-revoke-naming-roles-leaves-public-executing-2026-09-04.md
--
-- WHY THESE AND NOT THE OTHERS. Every function below was grepped against the
-- Co-Exist frontend at /Users/ecodia/.code/coexist before being touched, across
-- src, supabase/functions, scripts, web and shared, and every in-database caller
-- was enumerated from pg_proc.prosrc. A function is only revoked from a role
-- that no live caller uses. The tiers:
--
--   pg_cron only, no application caller at all
--     cleanup_deleted_accounts       cron.job 22, as postgres
--     cleanup_expired_reservations   cron.job 7,  as postgres
--   Edge Function only, which authenticates as service_role
--     increment_stock                stripe-webhook, stripe-webhook-test
--     decrement_stock                stripe-webhook, stripe-webhook-test
--     increment_promo_uses           stripe-webhook, create-checkout-test
--   trigger only, reached through the postgres-owned SECURITY DEFINER
--   tg_ensure_campout_chat_channel, which keeps its own postgres grant
--     ensure_campout_chat_channel
-- Those six lose anon AND authenticated, because no browser tier calls them.
--
--   signed-in application callers, so authenticated is kept and only anon goes
--     reserve_stock, release_reservation, release_all_reservations
--         src/hooks/use-stock-reservation.ts, each behind an if (!user) return,
--         plus create-checkout and stripe-webhook as service_role
--     recover_pending_deletion
--         src/components/pending-deletion-banner.tsx, src/pages/settings/account.tsx
--     adjust_variant_stock, sync_variant_inventory
--         src/hooks/use-admin-merch.ts, src/pages/admin/merch/products-tab.tsx
--     merge_email_tags, sync_auto_tags
--         src/pages/admin/email/tags-tab.tsx, subscribers-tab.tsx
--
-- LEFT ANON ON PURPOSE. unsubscribe_by_email and resubscribe_by_email are both
-- called from src/pages/public/unsubscribe.tsx, which is the logged-out landing
-- page for the unsubscribe link in the footer of every Co-Exist email. Revoking
-- either one breaks a flow the client is legally required to offer, so neither
-- is touched here. resubscribe_by_email is nonetheless the live abuse surface:
-- it takes a bare email address with no token and flips marketing_opt_in back to
-- true, so anyone holding the publishable anon key can re-subscribe an address
-- that asked to be left alone. The fix is a signed token in the unsubscribe
-- link, which changes the email templates and the page and is therefore a
-- client-visible design change rather than an audit patch. It is boarded, not
-- silently left open.
--
-- THE OWNERSHIP GUARDS. release_all_reservations and recover_pending_deletion
-- both take a user id and neither checks it, so before this migration any
-- signed-in member could pass somebody else's id and delete their cart or undo
-- their account deletion. The guard has to let the backend through: stripe-webhook
-- calls release_all_reservations with an arbitrary p_user_id as service_role, and
-- a bare auth.uid() = p_user_id test would break checkout. is_trusted_backend_caller()
-- is the helper this database already uses for exactly that, reading current_setting('role')
-- and admitting service_role, postgres and supabase_admin. Signed-in callers are
-- held to their own id; the backend is unaffected.
-- ============================================================================

-- Tier 1: no browser caller of any kind.
REVOKE EXECUTE ON FUNCTION public.cleanup_deleted_accounts()                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reservations()                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_stock(uuid, text, integer)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, text, integer)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_promo_uses(uuid, integer)                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_campout_chat_channel(uuid)                             FROM PUBLIC, anon, authenticated;

-- Tier 2: signed-in callers exist, so only the logged-out tier goes.
REVOKE EXECUTE ON FUNCTION public.reserve_stock(uuid, uuid, text, integer, integer)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_reservation(uuid, text)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_all_reservations(uuid)                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recover_pending_deletion(uuid)                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_variant_stock(uuid, text, integer)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_variant_inventory(uuid)                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_email_tags(uuid, uuid)                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_auto_tags()                                              FROM PUBLIC, anon;

-- Tier 2 keeps working for the signed-in app and the Edge Functions.
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid, uuid, text, integer, integer)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_reservation(uuid, text)                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_all_reservations(uuid)                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recover_pending_deletion(uuid)                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_variant_stock(uuid, text, integer)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_variant_inventory(uuid)                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_email_tags(uuid, uuid)                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_auto_tags()                                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_stock(uuid, text, integer)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, text, integer)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_promo_uses(uuid, integer)                            TO service_role;

-- Pin the definers in this set that had no search_path.
ALTER FUNCTION public.increment_stock(uuid, text, integer)        SET search_path = public, pg_temp;
ALTER FUNCTION public.decrement_stock(uuid, text, integer)        SET search_path = public, pg_temp;
ALTER FUNCTION public.adjust_variant_stock(uuid, text, integer)   SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_variant_inventory(uuid)                SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_promo_uses(uuid, integer)         SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_auto_tags()                            SET search_path = public, pg_temp;
ALTER FUNCTION public.recover_pending_deletion(uuid)              SET search_path = public, pg_temp;

-- Ownership guards. Both bodies are otherwise unchanged.
CREATE OR REPLACE FUNCTION public.release_all_reservations(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_trusted_backend_caller() AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authorized to release reservations for another user'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM cart_reservations WHERE user_id = p_user_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.recover_pending_deletion(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_trusted_backend_caller() AND auth.uid() IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'not authorized to recover another account'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET deletion_status = 'active',
      deleted_at = NULL,
      deletion_requested_at = NULL
  WHERE id = uid
    AND deletion_status = 'pending_deletion';
END;
$fn$;
