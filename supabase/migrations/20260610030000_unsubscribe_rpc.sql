-- ============================================================
-- 20260610030000: unsubscribe_by_email RPC
--
-- Allows an unauthenticated recipient to flip marketing_opt_in to
-- false by tapping the Unsubscribe link in any campaign or system
-- email. The link in the footer of every send-email / send-campaign
-- message lands on the React /unsubscribe?email=... page, which
-- invokes this RPC.
--
-- Security model: this is an idempotent opt-out, not an account
-- mutation. The email address itself is the bearer (it lives in the
-- recipient's inbox). The RPC returns silently whether the email
-- matches a profile or not, so it cannot be used to enumerate
-- subscribers. Lookup is exact-match on profiles.email; case folded
-- via LOWER to mirror Resend behaviour.
-- ============================================================

CREATE OR REPLACE FUNCTION public.unsubscribe_by_email(p_email text)
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
  SET marketing_opt_in = false
  WHERE LOWER(email) = LOWER(trim(p_email))
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsubscribe_by_email(text) TO anon, authenticated;

COMMENT ON FUNCTION public.unsubscribe_by_email(text) IS
  'Anonymous opt-out helper for the Unsubscribe link in campaign and '
  'system emails. Flips marketing_opt_in=false on the profile whose '
  'email matches. Returns silently so an attacker cannot use it to '
  'enumerate subscribers. Companion: send-email + send-campaign render '
  'the link as APP_URL/unsubscribe?email=<urlencoded> in the footer.';
