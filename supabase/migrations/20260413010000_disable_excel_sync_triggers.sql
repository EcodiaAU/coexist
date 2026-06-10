-- EMERGENCY: Disable Excel sync triggers
-- The auto-sync overwrote historical data in the Master Impact Data Sheet.
-- Triggers disabled until sync logic is fixed to only handle 2026+ data
-- and to prioritise Excel values over DB values for existing rows.

DROP TRIGGER IF EXISTS excel_sync_on_survey_response ON public.survey_responses;
DROP TRIGGER IF EXISTS excel_sync_on_event_impact ON public.event_impact;
