-- ============================================================================
-- 060: Survey → Impact Stats Linkage
--
-- Allows admin to tag post-event survey questions with an impact_metric,
-- so that leader survey responses automatically feed into event_impact.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add impact mapping columns to post_event_survey_templates
-- ---------------------------------------------------------------------------

ALTER TABLE post_event_survey_templates
  ADD COLUMN IF NOT EXISTS impact_metric text,
  ADD COLUMN IF NOT EXISTS impact_unit text;

-- ---------------------------------------------------------------------------
-- 2. Seed obvious mappings for existing template questions
-- ---------------------------------------------------------------------------

-- Tree planting: "How many trees did you help plant?" → trees_planted
UPDATE post_event_survey_templates
SET impact_metric = 'trees_planted'
WHERE question_key = 'trees_count' AND activity_type = 'tree_planting';

-- Wildlife survey: "How many species did you record?" → wildlife_sightings
UPDATE post_event_survey_templates
SET impact_metric = 'wildlife_sightings'
WHERE question_key = 'species_count' AND activity_type = 'wildlife_survey';

-- Nature walk: "How many species did you spot?" → wildlife_sightings
UPDATE post_event_survey_templates
SET impact_metric = 'wildlife_sightings'
WHERE question_key = 'species_seen' AND activity_type = 'nature_walk';

-- Seed collecting: "How many species did you collect seeds from?" → native_plants
UPDATE post_event_survey_templates
SET impact_metric = 'native_plants'
WHERE question_key = 'species_collected' AND activity_type = 'seed_collecting';
