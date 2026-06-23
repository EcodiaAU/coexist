-- Resolve an existing auth user id by email for the public guest-ticket-checkout
-- function. listUsers(perPage:200) only saw the first page, so an existing
-- account beyond it was missed -> createUser hit a duplicate email -> 500.
-- SECURITY DEFINER + service_role-only so the public function can look up an
-- account without exposing the auth schema.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;
