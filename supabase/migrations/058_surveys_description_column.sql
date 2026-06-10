-- Add description column to surveys table
-- Used to show respondents a brief intro before they start the survey
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS description text;
