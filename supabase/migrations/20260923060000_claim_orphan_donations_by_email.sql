-- Recurring donations made without an account were unreachable forever.
--
-- recurring_donations.user_id is populated ONLY from Stripe subscription
-- metadata (stripe-webhook recurringRowFromSubscription). Subscriptions created
-- before that metadata existed carry {} , so the row lands with user_id NULL,
-- donor_email NULL and donor_name NULL. RLS on this table is
-- (user_id = auth.uid() OR is_admin_or_staff), so a NULL user_id row is
-- invisible to every donor on /profile/donations, and create-checkout's
-- cancel_subscription case authorises on the same user_id, so it is also
-- uncancellable in-app. Measured 2026-09-23: 2 of 2 live rows were orphaned
-- this way, both $25/year gifts started in 2024.
--
-- The link Stripe already holds is the CUSTOMER email. This migration makes an
-- account claim its own orphaned gifts at the moment its email is confirmed.
--
-- ORDERING, which decides where the trigger hangs: the profiles row is INSERTed
-- ~329us BEFORE the auth.users row and email_confirmed_at lands ~73ms AFTER it
-- (measured on user 491ad699). A confirmation-guarded claim on profiles INSERT
-- would therefore no-op on every real signup. It hangs off auth.users instead.

ALTER TABLE public.recurring_donations
  ADD COLUMN IF NOT EXISTS billing_interval text;

COMMENT ON COLUMN public.recurring_donations.billing_interval IS
  'Stripe price recurring.interval (month|year|week|day). The profile donations card rendered a hardcoded "/ month" before this existed, which mislabelled every annual gift.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurring_donations_billing_interval_check'
  ) THEN
    ALTER TABLE public.recurring_donations
      ADD CONSTRAINT recurring_donations_billing_interval_check
      CHECK (billing_interval IS NULL OR billing_interval IN ('day','week','month','year'));
  END IF;
END $$;

-- Claim every orphaned gift whose donor_email matches this user's CONFIRMED
-- auth email. Resolves the email and the confirmation from auth.users itself so
-- a caller cannot assert either one.
CREATE OR REPLACE FUNCTION public.claim_orphan_donations(p_user_id uuid)
RETURNS TABLE(recurring_claimed integer, donations_claimed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email     text;
  v_confirmed boolean;
  v_rec       integer := 0;
  v_don       integer := 0;
BEGIN
  SELECT lower(btrim(u.email)), (u.email_confirmed_at IS NOT NULL)
    INTO v_email, v_confirmed
    FROM auth.users u
   WHERE u.id = p_user_id;

  IF v_email IS NULL OR v_email = '' OR NOT v_confirmed THEN
    recurring_claimed := 0; donations_claimed := 0; RETURN NEXT; RETURN;
  END IF;

  UPDATE public.recurring_donations
     SET user_id = p_user_id, updated_at = now()
   WHERE user_id IS NULL
     AND donor_email IS NOT NULL
     AND lower(btrim(donor_email)) = v_email;
  GET DIAGNOSTICS v_rec = ROW_COUNT;

  UPDATE public.donations
     SET user_id = p_user_id
   WHERE user_id IS NULL
     AND donor_email IS NOT NULL
     AND lower(btrim(donor_email)) = v_email;
  GET DIAGNOSTICS v_don = ROW_COUNT;

  recurring_claimed := v_rec; donations_claimed := v_don; RETURN NEXT; RETURN;
END $$;

-- Definer-rights function: never callable by a client role.
REVOKE ALL ON FUNCTION public.claim_orphan_donations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_orphan_donations(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_orphan_donations(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.tg_claim_orphan_donations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.claim_orphan_donations(NEW.id);
  RETURN NEW;
END $$;

-- Fires the instant a confirmation lands (this project auto-confirms: 3,074 of
-- 3,090 users confirm within 5s of creation), and again if a confirmed address
-- is later changed to one that owns orphaned gifts.
DROP TRIGGER IF EXISTS trg_auth_users_claim_orphan_donations ON auth.users;
CREATE TRIGGER trg_auth_users_claim_orphan_donations
AFTER INSERT OR UPDATE OF email_confirmed_at, email ON auth.users
FOR EACH ROW
WHEN (NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.tg_claim_orphan_donations();

-- The other direction: a gift arrives (webhook) for an email that ALREADY has a
-- confirmed account. stripe-webhook calls this after recording the row, so the
-- link is made whichever of the two happens first, with one implementation.
CREATE OR REPLACE FUNCTION public.claim_donations_for_email(p_email text)
RETURNS TABLE(recurring_claimed integer, donations_claimed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    recurring_claimed := 0; donations_claimed := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT u.id INTO v_user_id
    FROM auth.users u
   WHERE lower(btrim(u.email)) = lower(btrim(p_email))
     AND u.email_confirmed_at IS NOT NULL
   ORDER BY u.created_at
   LIMIT 1;

  IF v_user_id IS NULL THEN
    recurring_claimed := 0; donations_claimed := 0; RETURN NEXT; RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.claim_orphan_donations(v_user_id);
END $$;

REVOKE ALL ON FUNCTION public.claim_donations_for_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_donations_for_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_donations_for_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_donations_for_email(text) TO service_role;
