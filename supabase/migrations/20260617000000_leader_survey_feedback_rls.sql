-- Leader-suite event survey feedback visibility.
--
-- Context: Co-Exist leaders asked to see the survey feedback attendees give
-- about their events. It was admin-only because survey_responses SELECT had
-- no per-collective leader clause: the policy was named
-- "survey_responses_select_own_or_leader" but only ever allowed
--   user_id = auth.uid()  (your own response)
--   OR is_admin_or_staff() (global national_leader/manager/admin)
-- with no clause for a collective's leader/co_leader/assist_leader.
--
-- This widens SELECT so a collective's staff (leader, co_leader, assist_leader
-- per is_collective_staff) can read responses tied to an event in that
-- collective. Managers and admins remain covered by is_admin_or_staff (global)
-- and are scoped to a focused collective in the UI layer. assist_leader is
-- included deliberately (is_collective_staff, not is_collective_leader_or_above)
-- per the RLS-sweep doctrine: assist_leader is staff for collective-scoped reads.
--
-- Responses with a NULL event_id (non-event surveys, e.g. standalone impact
-- tasks) stay admin/owner-only: they are not attributable to a collective.

DROP POLICY IF EXISTS "survey_responses_select_own_or_leader" ON survey_responses;

CREATE POLICY "survey_responses_select_own_or_leader"
  ON survey_responses FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_staff(auth.uid())
    OR (
      event_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = survey_responses.event_id
          AND is_collective_staff(auth.uid(), e.collective_id)
      )
    )
  );
