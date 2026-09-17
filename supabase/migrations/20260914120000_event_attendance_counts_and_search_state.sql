-- ONE definition of "checked in" for an event, plus attendance state on the
-- walk-in search.
--
-- Origin: Tate, 2026-09-14, mid-event at Captain Burke Park Clean Up.
--   "the here so far card on the event day page and the checked in cards are
--    showing different numbers right now at the coexist event 37 vs 39"
--   "When someone is already checked in as a walk-in ... searching their name
--    up again should show checked in, not show the check in button then an
--    error."
--
-- ROOT CAUSE of the 37-vs-39: two cards, two data paths.
--   * "Here so far" (event-detail) counted event_registrations.status='attended'
--     ONLY. It never read event_walk_ins at all.
--   * "Checked in" (event-day) counted roster.counts.checkedIn + walkIns.length.
-- The gap was therefore EXACTLY the walk-in count. Probed live on the day:
-- Captain Burke Park Clean Up held 2 walk-ins, and Tate saw a 2-wide gap.
--
-- WHY AN RPC AND NOT A SHARED CLIENT FUNCTION. "Here so far" is participant-
-- visible, but RLS on event_walk_ins is leader/staff-only
-- (event_walk_ins_select -> is_collective_staff OR is_admin_or_staff). A
-- client-side shared counter would hand every participant zero walk-ins and
-- leave their card wrong while looking fixed to a staff tester. A count-only
-- SECURITY DEFINER function is the only way both cards can read one number.
-- It returns counts and no PII, so it is safe to expose to authenticated.
--
-- DEDUPLICATION. event_walk_ins carries no unique constraint, so the same
-- person can be recorded twice, and a walk-in can also duplicate somebody who
-- already holds a registration. Both are folded to one identity here:
--   registration identity = profile email, else uid:<user_id>
--   walk-in identity      = linked profile email, else uid:<linked_user_id>,
--                           else walk-in email, else walkin:<row id>
-- A walk-in with no email and no link cannot be matched to anyone, so it keys
-- on its own id and counts exactly once. Measured on the live DB 2026-09-14:
-- 4 duplicate walk-in pairs by email, 6 walk-ins whose email matches a
-- registered attendee at the same event, and linked_user_id populated on 0 of
-- 174 rows (the column is written by nothing today, and is handled here so it
-- works the day something starts writing it).
--
-- Deliberately NOT in this migration: a unique constraint on event_walk_ins.
-- Existing duplicates would make it fail outright, and DDL on a table staff are
-- inserting into mid-event is the wrong risk. Deduping in the count plus the
-- search-state fix below is what stops new duplicates being created.

CREATE OR REPLACE FUNCTION public.event_attendance_counts(p_event_id uuid)
RETURNS TABLE (
  checked_in integer,
  here_total integer,
  walkin_extra integer,
  walkin_duplicates_suppressed integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH reg AS (
    SELECT
      r.status,
      COALESCE(NULLIF(lower(trim(p.email)), ''), 'uid:' || r.user_id::text) AS ident
    FROM public.event_registrations r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.event_id = p_event_id
      AND r.status IN ('registered', 'attended')
  ),
  walk_raw AS (
    SELECT
      COALESCE(
        NULLIF(lower(trim(lp.email)), ''),
        CASE WHEN w.linked_user_id IS NOT NULL THEN 'uid:' || w.linked_user_id::text END,
        NULLIF(lower(trim(w.email)), ''),
        'walkin:' || w.id::text
      ) AS ident
    FROM public.event_walk_ins w
    LEFT JOIN public.profiles lp ON lp.id = w.linked_user_id
    WHERE w.event_id = p_event_id
      AND w.status = 'attended'
  ),
  walk AS (SELECT DISTINCT ident FROM walk_raw),
  present AS (
    SELECT ident FROM reg WHERE status = 'attended'
    UNION
    SELECT ident FROM walk
  ),
  expected AS (
    SELECT ident FROM reg
    UNION
    SELECT ident FROM walk
  )
  SELECT
    (SELECT count(*) FROM present)::integer,
    (SELECT count(*) FROM expected)::integer,
    (SELECT count(*) FROM (SELECT ident FROM walk EXCEPT SELECT ident FROM reg) x)::integer,
    ((SELECT count(*) FROM walk_raw) - (SELECT count(*) FROM walk))::integer;
$$;

COMMENT ON FUNCTION public.event_attendance_counts(uuid) IS
  'One definition of checked-in for an event. checked_in = distinct people present (attended registrations UNION attended walk-ins, deduped by email/linked user). here_total = the same set widened to registered-but-not-yet-arrived, i.e. the denominator for "X of Y here so far". walkin_extra = walk-ins who add a person the registration list does not already hold. walkin_duplicates_suppressed = walk-in rows folded away as duplicates. Count-only and SECURITY DEFINER because event_walk_ins RLS is staff-only while the here-so-far card is participant-visible.';

REVOKE ALL ON FUNCTION public.event_attendance_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_attendance_counts(uuid) TO authenticated;

-- ------------------------------------------------------------------
-- search_app_users_for_event: return the person's attendance state.
--
-- The sheet rendered an unconditional "Check In" button because this function
-- returned profile columns and nothing about the event. Pressing it for someone
-- already on the roster hit UNIQUE (event_id, user_id) and dead-ended. Now the
-- caller knows, so an already-present person renders as checked in with no
-- button, and a registered-but-not-arrived person gets a button that updates
-- their existing row instead of trying to insert a second one.
--
-- ADDITIVE ONLY: the four existing output columns keep their names, types and
-- order, so an older installed app that selects id/display_name/avatar_url/
-- email is unaffected by the extra column. The return type changes, so this is
-- a DROP + CREATE rather than a CREATE OR REPLACE; it runs inside the migration
-- transaction, so there is no window where the function is missing.
-- ------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.search_app_users_for_event(uuid, text, integer);

CREATE FUNCTION public.search_app_users_for_event(
  p_event_id uuid,
  p_query text,
  p_max_results integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  email text,
  attendance_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.email,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.event_registrations r
        WHERE r.event_id = p_event_id AND r.user_id = p.id AND r.status = 'attended'
      )
      OR EXISTS (
        SELECT 1 FROM public.event_walk_ins w
        WHERE w.event_id = p_event_id
          AND w.status = 'attended'
          AND (
            w.linked_user_id = p.id
            OR (
              NULLIF(lower(trim(w.email)), '') IS NOT NULL
              AND NULLIF(lower(trim(p.email)), '') IS NOT NULL
              AND lower(trim(w.email)) = lower(trim(p.email))
            )
          )
      )
        THEN 'checked_in'
      WHEN EXISTS (
        SELECT 1 FROM public.event_registrations r
        WHERE r.event_id = p_event_id
          AND r.user_id = p.id
          AND r.status IN ('registered', 'invited', 'waitlisted')
      )
        THEN 'registered'
      ELSE 'none'
    END AS attendance_state
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

COMMENT ON FUNCTION public.search_app_users_for_event(uuid, text, integer) IS
  'Walk-in search for event staff. attendance_state is checked_in (an attended registration OR an attended walk-in matching this person), registered (on the roster but not yet arrived, including invited/waitlisted), or none. The auth gate is unchanged from 20260518100000.';

REVOKE ALL ON FUNCTION public.search_app_users_for_event(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_app_users_for_event(uuid, text, integer) TO authenticated;
