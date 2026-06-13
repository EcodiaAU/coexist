-- Migration: 20260613010000_assist_leader_rls_sweep_phase2
--
-- PURPOSE
-- -------
-- Phase 2 of the assist_leader RLS sweep. Phase 1 = 20260523000000 fixed
-- event_walk_ins (Issy Calderwood Brisbane walk-ins). Phase 1.5 =
-- 20260613000000 fixed event_registrations (Issy Perth Port Beach
-- check-in). This migration walks the remaining 22 policies that still
-- gate on is_collective_leader_or_above and widens the day-of operational
-- ones to is_collective_staff. Doctrine:
-- patterns/rls-sweep-must-enumerate-sibling-tables-2026-06-13.md.
--
-- DECISION PER TABLE
-- ------------------
-- The structural rule established by Phase 1 is: assist_leader is
-- operational day-of staff for the collective's events, NOT a leadership-
-- tier role. So we widen day-of-event operations and leave
-- leadership-tier operations narrow.
--
-- WIDENED (5 policies, 4 tables):
--   * event_invites.event_invites_insert_leader        - sending invites for events they help run
--   * surveys.surveys_insert_leader                    - creating post-event surveys
--   * event_organisations.event_organisations_manage_leader - adding partner orgs to events
--   * impact_species.impact_species_insert_leader      - MUST widen, parent event_impact already includes assist_leader
--   * impact_areas.impact_areas_insert_leader          - same as species
--
-- KEPT NARROW (deliberate, 12 policies):
--   * collectives.collectives_update_leader            - renaming a collective is leadership
--   * collective_members.collective_members_update_leader     - assigning roles is leadership
--   * collective_members.collective_members_delete_self_or_leader - removing other members is leadership (own-row branch unaffected)
--   * events.events_insert_leader, events_update_leader - creating/editing the event itself is leadership-tier; revisit if Co-Exist culture says otherwise
--   * event_series.event_series_manage_leader          - recurring-series planning is leadership
--   * collective_event_collaborators.collab_*_leader   x3 - cross-collective co-host invites are leadership
--   * dev_assignments.dev_assignments_*                x3 - training assignments are leadership
--   * surveys.surveys_delete_owner_or_admin, surveys_update_owner_or_admin - assist_leader covers via own-row branch
--
-- ALREADY INCLUDES assist_leader (no change needed, 3 policies):
--   * event_registrations.registrations_select_visible - sibling registrations_select_own_or_leader was widened in 20260613000000; RLS ORs across policies
--   * event_impact.event_impact_insert_leader          - has explicit cm.role = ANY (leader, co_leader, assist_leader) branch
--   * task_instances.task_instances_select_member      - same explicit-branch shape
--
-- VERIFICATION
-- ------------
-- Re-run backend/tools/rls-sweep-helper-audit.sh tjutlbzekfouwsiaplbr
-- is_collective_leader_or_above immediately after applying. Expected
-- remaining count: 17 (22 - 5 widened). The remaining 17 are the
-- KEPT-NARROW + ALREADY-INCLUDES rows above and are the documented
-- structural intent of the sweep.

-- ============================================================
-- 1. event_invites_insert_leader
-- ============================================================

DROP POLICY IF EXISTS event_invites_insert_leader ON event_invites;

CREATE POLICY event_invites_insert_leader
  ON event_invites FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (
       SELECT 1 FROM events e
        WHERE e.id = event_invites.event_id
          AND is_collective_staff(auth.uid(), e.collective_id)
     ))
    OR is_admin_or_staff(auth.uid())
  );

-- ============================================================
-- 2. surveys_insert_leader
-- ============================================================

DROP POLICY IF EXISTS surveys_insert_leader ON surveys;

CREATE POLICY surveys_insert_leader
  ON surveys FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (
       SELECT 1 FROM events e
        WHERE e.id = surveys.event_id
          AND is_collective_staff(auth.uid(), e.collective_id)
     ))
    OR is_admin_or_staff(auth.uid())
  );

-- ============================================================
-- 3. event_organisations_manage_leader (ALL operations)
-- ============================================================

DROP POLICY IF EXISTS event_organisations_manage_leader ON event_organisations;

CREATE POLICY event_organisations_manage_leader
  ON event_organisations FOR ALL TO authenticated
  USING (
    (EXISTS (
       SELECT 1 FROM events e
        WHERE e.id = event_organisations.event_id
          AND is_collective_staff(auth.uid(), e.collective_id)
     ))
    OR is_admin_or_staff(auth.uid())
  );

-- ============================================================
-- 4. impact_species_insert_leader
-- ============================================================

DROP POLICY IF EXISTS impact_species_insert_leader ON impact_species;

CREATE POLICY impact_species_insert_leader
  ON impact_species FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM event_impact ei
        JOIN events e ON e.id = ei.event_id
       WHERE ei.id = impact_species.event_impact_id
         AND (
           is_collective_staff(auth.uid(), e.collective_id)
           OR is_admin_or_staff(auth.uid())
         )
    )
  );

-- ============================================================
-- 5. impact_areas_insert_leader
-- ============================================================

DROP POLICY IF EXISTS impact_areas_insert_leader ON impact_areas;

CREATE POLICY impact_areas_insert_leader
  ON impact_areas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM event_impact ei
        JOIN events e ON e.id = ei.event_id
       WHERE ei.id = impact_areas.event_impact_id
         AND (
           is_collective_staff(auth.uid(), e.collective_id)
           OR is_admin_or_staff(auth.uid())
         )
    )
  );
