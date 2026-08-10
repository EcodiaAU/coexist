-- 20260811000000  D5: Donate money-path hardening (additive, reversible)
--
-- Fixes (backlog 2026-08-10):
--   PB6  Anonymous recurring donations silently lost.
--        recurring_donations.user_id was uuid NOT NULL, so an anonymous
--        subscription (public-checkout sends user_id='') errored on insert and NO
--        row was created; then every monthly invoice.payment_succeeded found no
--        row and broke. Stripe kept billing while the app recorded nothing.
--        Make user_id nullable and carry the anon donor identity + the recognition
--        context (is_public/message/project_name/on_behalf_of) on the row, so the
--        webhook records each charge (auth OR anon) from a single source of truth.
--   PB2  (paired, code-side) The recurring first charge is now owned solely by
--        invoice.payment_succeeded; these columns let that handler reproduce the
--        exact row the checkout.session.completed block used to write (incl. the
--        donor-wall opt-in on the first gift), so nothing regresses.
--   DGR  Real receipt numbers. donations.receipt_number (added in 012) was never
--        populated. Add a sequence + SECURITY DEFINER minting RPC (CE-YYYY-NNNNNN).
--
-- Non-destructive: only DROP NOT NULL, ADD COLUMN IF NOT EXISTS, CREATE SEQUENCE/FN.
-- Reverse: ALTER ... SET NOT NULL / DROP COLUMN / DROP SEQUENCE / DROP FUNCTION.

BEGIN;

-- 1. recurring_donations: allow anonymous subscriptions + carry recognition context
ALTER TABLE recurring_donations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE recurring_donations ADD COLUMN IF NOT EXISTS donor_email  text;
ALTER TABLE recurring_donations ADD COLUMN IF NOT EXISTS donor_name   text;
ALTER TABLE recurring_donations ADD COLUMN IF NOT EXISTS is_public    boolean NOT NULL DEFAULT false;
ALTER TABLE recurring_donations ADD COLUMN IF NOT EXISTS message      text;
ALTER TABLE recurring_donations ADD COLUMN IF NOT EXISTS project_name text;
ALTER TABLE recurring_donations ADD COLUMN IF NOT EXISTS on_behalf_of text;

-- 2. Donation receipt numbers: CE-YYYY-NNNNNN, monotonic via a dedicated sequence.
--    Globally unique + monotonic (not reset per year) is sufficient for a receipt id.
CREATE SEQUENCE IF NOT EXISTS donation_receipt_seq START 1;

CREATE OR REPLACE FUNCTION next_donation_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('donation_receipt_seq');
  RETURN 'CE-'
    || to_char(now() AT TIME ZONE 'Australia/Brisbane', 'YYYY')
    || '-' || lpad(n::text, 6, '0');
END;
$$;

-- Only the webhook (service_role) mints numbers; a client must not be able to
-- burn the sequence.
REVOKE ALL ON FUNCTION next_donation_receipt_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION next_donation_receipt_number() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION next_donation_receipt_number() TO service_role;

COMMIT;
