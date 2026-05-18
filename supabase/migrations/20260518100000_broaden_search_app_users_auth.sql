-- Broaden the auth gate on search_app_users_for_event.
--
-- The original (migration 027 era) check was:
--   is_collective_leader_or_above(auth.uid(), <event.collective_id>)
-- which only matches collective_members.role IN ('leader','co_leader').
-- That excluded:
--   - assist_leader of the collective (they help run the event)
--   - global staff: role IN ('admin','manager','national_leader')
--
-- Result: when Jess (manager) or an assist_leader hit the "Add walk-in"
-- search, every query returned zero rows even when matches existed. The
-- new gate accepts any of those roles.
--
-- Idempotent CREATE OR REPLACE FUNCTION - safe to re-run.

CREATE OR REPLACE FUNCTION public.search_app_users_for_event(
  p_event_id uuid,
  p_query text,
  p_max_results integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.email
  FROM public.profiles p
  WHERE length(p_query) >= 2
    AND (
      p.display_name ILIKE '%' || p_query || '%'
      OR p.email ILIKE '%' || p_query || '%'
      OR p.first_name ILIKE '%' || p_query || '%'
      OR p.last_name ILIKE '%' || p_query || '%'
    )
    AND (
      -- Global staff tier sees everyone
      EXISTS (
        SELECT 1 FROM public.profiles caller
        WHERE caller.id = auth.uid()
          AND caller.role IN ('admin', 'manager', 'national_leader')
      )
      -- Or any collective-level leader/co/assist of the event's collective
      OR EXISTS (
        SELECT 1 FROM public.collective_members cm
        JOIN public.events e ON e.collective_id = cm.collective_id
        WHERE cm.user_id = auth.uid()
          AND e.id = p_event_id
          AND cm.role IN ('leader', 'co_leader', 'assist_leader')
      )
    )
  ORDER BY p.display_name NULLS LAST
  LIMIT p_max_results;
$$;
