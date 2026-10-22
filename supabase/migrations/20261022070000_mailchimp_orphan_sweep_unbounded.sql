-- The Mailchimp orphan sweep compared state rows against
-- mailchimp_contacts(NULL, NULL, 5000), and mailchimp_contacts caps its result
-- at 5,000 rows. Past 5,000 contacts (3,610 on 2026-10-22) every member whose
-- address sorts after the 5,000th would read as "no longer a contact", and the
-- next full sync would ARCHIVE them from the live Mailchimp audience.
--
-- The sweep now walks state rows in chunks of 1,000 and asks mailchimp_contacts
-- about exactly those addresses, so there is no ceiling anywhere in the check.
-- Same signature, same grants, same caller (the full sync's last page).
CREATE OR REPLACE FUNCTION public.mailchimp_orphaned_state(p_audience_id text, p_limit integer DEFAULT 200)
RETURNS TABLE (email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_want  integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_after text := '';
  v_chunk text[];
  v_live  text[];
  v_gone  text[];
BEGIN
  LOOP
    SELECT array_agg(x.addr ORDER BY x.addr) INTO v_chunk
    FROM (
      SELECT s.email AS addr
      FROM public.mailchimp_sync_state s
      WHERE s.audience_id = p_audience_id
        AND s.mc_status IS DISTINCT FROM 'archived'
        AND s.email > v_after
      ORDER BY s.email
      LIMIT 1000
    ) x;
    EXIT WHEN v_chunk IS NULL;

    SELECT coalesce(array_agg(c.email), '{}') INTO v_live
    FROM public.mailchimp_contacts(v_chunk, NULL, 5000) c;

    SELECT array_agg(u.addr ORDER BY u.addr) INTO v_gone
    FROM unnest(v_chunk) AS u(addr)
    WHERE NOT (u.addr = ANY (v_live));

    IF v_gone IS NOT NULL THEN
      RETURN QUERY SELECT g.addr FROM unnest(v_gone[1:v_want]) AS g(addr);
      v_want := v_want - least(array_length(v_gone, 1), v_want);
      EXIT WHEN v_want <= 0;
    END IF;

    v_after := v_chunk[array_length(v_chunk, 1)];
  END LOOP;
END;
$function$;

-- Grants: unchanged from 20261022060000. Service role only, because the sweep
-- reads every member's address; no API role may call it.
REVOKE ALL ON FUNCTION public.mailchimp_orphaned_state(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailchimp_orphaned_state(text, integer) TO service_role;
