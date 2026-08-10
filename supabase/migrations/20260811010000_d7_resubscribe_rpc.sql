-- ============================================================
-- 20260811010000: resubscribe_by_email RPC (D7 GDPR/account-loss cluster)
--
-- Mirror of unsubscribe_by_email (20260610030000). The public
-- /unsubscribe page shows a "Wait, put me back on the list" button
-- after an accidental unsubscribe. That handler previously ran a
-- direct  profiles.update({ marketing_opt_in: true })  from the
-- anonymous client, but there is NO anon UPDATE policy on profiles,
-- so the update matched 0 rows, returned no error, and the page
-- toasted "You're back on the list" while the recipient stayed
-- opted out (silent false success). unsubscribe itself works
-- because it already uses the anon-granted unsubscribe_by_email RPC;
-- resubscribe had no companion. This adds it.
--
-- Security model: identical to unsubscribe_by_email. This is an
-- idempotent opt-IN keyed on the email address in the recipient's
-- own inbox (the bearer). SECURITY DEFINER so it runs past RLS, but
-- it only ever flips ONE boolean (marketing_opt_in) on the profile
-- whose email matches exactly (case-folded). It returns silently
-- whether or not the email matches, so it cannot be used to
-- enumerate subscribers. It never touches any other column, so it
-- cannot be used to mutate an account. deleted_at IS NULL guards a
-- soft-deleted / pending-deletion account from being reactivated
-- into the marketing list.
-- ============================================================

CREATE OR REPLACE FUNCTION public.resubscribe_by_email(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN;
  END IF;

  UPDATE profiles
  SET marketing_opt_in = true
  WHERE LOWER(email) = LOWER(trim(p_email))
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resubscribe_by_email(text) TO anon, authenticated;

COMMENT ON FUNCTION public.resubscribe_by_email(text) IS
  'Anonymous opt-IN helper for the "put me back on the list" button on '
  'the /unsubscribe page. Flips marketing_opt_in=true on the profile whose '
  'email matches (case-folded, exact). Returns silently so an attacker '
  'cannot use it to enumerate subscribers. Companion/mirror of '
  'unsubscribe_by_email. Only mutates marketing_opt_in; guarded by '
  'deleted_at IS NULL so a pending-deletion account is not reactivated.';
