-- =====================================================================
-- Drift repair: three events columns that exist on prod but had no
-- migration file (QA P2-2). Any fresh environment built from migrations
-- alone was missing them, breaking event create/edit/detail which all
-- read and write these columns.
--
-- Types/defaults probed READ-ONLY from prod information_schema.columns
-- (project tjutlbzekfouwsiaplbr, 2026-07-06):
--   checkin_window_minutes    integer  NULL  DEFAULT 30
--   external_registration_url text     NULL  DEFAULT NULL
--   is_external_collaboration boolean  NULL  DEFAULT false
--
-- Idempotent: IF NOT EXISTS makes this a no-op on prod itself.
-- =====================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS checkin_window_minutes integer DEFAULT 30;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS external_registration_url text;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_external_collaboration boolean DEFAULT false;

COMMENT ON COLUMN public.events.checkin_window_minutes IS
  'Minutes before event start that self check-in opens (default 30).';
COMMENT ON COLUMN public.events.external_registration_url IS
  'When set, RSVP/ticket CTAs deep-link to this external registration page.';
COMMENT ON COLUMN public.events.is_external_collaboration IS
  'True when the event is co-hosted across collectives (multi-host).';
