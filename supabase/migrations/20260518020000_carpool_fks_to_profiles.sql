-- ============================================================================
-- Carpool driver_id + passenger_id FKs -> profiles, not auth.users
--
-- PostgREST embed `profiles!carpool_widgets_driver_id_fkey(...)` was failing
-- with PGRST200 because the FK pointed at auth.users(id), not public.profiles.
-- Every other user-referencing table in the schema (collective_members,
-- events.created_by, event_registrations) points at profiles so the embed
-- works. Carpool tables (added later) followed the wrong pattern.
--
-- profiles.id is 1:1 with auth.users.id (FK profiles.id -> auth.users.id ON
-- DELETE CASCADE) so re-pointing is a no-op at the data level.
-- ============================================================================

ALTER TABLE public.carpool_widgets
  DROP CONSTRAINT IF EXISTS carpool_widgets_driver_id_fkey,
  ADD  CONSTRAINT carpool_widgets_driver_id_fkey
       FOREIGN KEY (driver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.carpool_seats
  DROP CONSTRAINT IF EXISTS carpool_seats_passenger_id_fkey,
  ADD  CONSTRAINT carpool_seats_passenger_id_fkey
       FOREIGN KEY (passenger_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
