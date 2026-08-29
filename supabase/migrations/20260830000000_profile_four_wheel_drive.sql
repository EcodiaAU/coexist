-- =====================================================================
-- profiles.has_four_wheel_drive
-- =====================================================================
-- Origin: Tate 2026-08-30, relaying Co-Exist's need to know who can carry
-- gear and people over the last unsealed kilometres into a camp-out site.
-- The retreat safety set is now FOUR things asked at one point: dietary,
-- medical/allergy, emergency contact, and whether the person has a 4WD.
--
-- Nullable ON PURPOSE. Three states, and the third is the one that makes
-- the gates work:
--   NULL  -> never answered, so every intake surface still asks
--   true  -> has a 4WD
--   false -> answered, does not have one
-- A NOT NULL DEFAULT false would silently answer for all 2,581 existing
-- profiles and permanently disarm the backfill prompt for every one of
-- them, which is exactly the data Kurt is chasing.
--
-- This is a PROFILE-level standing fact ("do you own a 4WD"), which is a
-- different question from the per-event event_ticket_questions row
-- ("Will you have a 4WD at THIS camp-out?"). Both are live and both are
-- wanted: the organiser-authored per-event question feeds the attendee
-- export via event_tickets.custom_answers and is not touched here.
--
-- Purely additive and idempotent.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_four_wheel_drive boolean;

COMMENT ON COLUMN public.profiles.has_four_wheel_drive IS
  'Does this member have a four-wheel drive. NULL = never answered (intake gates stay armed), true/false = answered. Collected in the combined safety intake alongside dietary_requirements, medical_requirements and emergency_contact_*.';
