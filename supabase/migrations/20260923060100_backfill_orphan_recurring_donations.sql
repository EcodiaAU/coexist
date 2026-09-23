-- Backfill the two orphaned recurring_donations rows from the Stripe customer
-- record, which is the identity Stripe held all along and the webhook never read.
--
-- Values read live from the Co-Exist LIVE Stripe account acct_1MTfbPCNw9X8EsOR
-- on 2026-09-23 via scripts/stripeq.sh:
--   sub_1PxEtBCNw9X8EsOR9DBrNvuX -> cus_Qose375YkTPhRZ redangel22575@icloud.com
--                                   price 2500 aud / year, status canceled
--   sub_1PsG9aCNw9X8EsORMtDGMLAh -> cus_Qjjc6Ai10DxWof sarahfcoates@gmail.com
--                                   price 2500 aud / year, status active
-- Both gifts are ANNUAL, not monthly. Both rows are is_public=false, so no
-- donor-wall surface is touched. donor_name is left alone for the second row:
-- Stripe holds the handle "sfco", not a person's name.

UPDATE public.recurring_donations
   SET donor_email      = COALESCE(donor_email, 'redangel22575@icloud.com'),
       billing_interval = 'year',
       updated_at       = now()
 WHERE stripe_subscription_id = 'sub_1PxEtBCNw9X8EsOR9DBrNvuX';

UPDATE public.recurring_donations
   SET donor_email      = COALESCE(donor_email, 'sarahfcoates@gmail.com'),
       billing_interval = 'year',
       updated_at       = now()
 WHERE stripe_subscription_id = 'sub_1PsG9aCNw9X8EsORMtDGMLAh';

-- Now let every already-confirmed account claim what it owns. This is the same
-- function the auth.users trigger calls, so this backfill exercises the live
-- path rather than a parallel one.
SELECT u.id, u.email, c.recurring_claimed, c.donations_claimed
  FROM auth.users u
 CROSS JOIN LATERAL public.claim_orphan_donations(u.id) c
 WHERE lower(btrim(u.email)) IN (
         SELECT lower(btrim(donor_email))
           FROM public.recurring_donations
          WHERE user_id IS NULL AND donor_email IS NOT NULL
         UNION
         SELECT lower(btrim(donor_email))
           FROM public.donations
          WHERE user_id IS NULL AND donor_email IS NOT NULL
       );
