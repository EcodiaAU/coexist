-- Align activity_type enum with UI/TypeScript values
-- UI expects: clean_up, tree_planting, ecosystem_restoration, nature_hike, camp_out, spotlighting, other
-- DB currently has: shore_cleanup, tree_planting, land_regeneration, nature_walk, camp_out, retreat, film_screening, marine_restoration, workshop

-- Add missing values the UI needs
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'clean_up';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'ecosystem_restoration';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'nature_hike';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'spotlighting';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'other';
