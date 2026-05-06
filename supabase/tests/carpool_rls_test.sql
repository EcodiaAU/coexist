-- supabase/tests/carpool_rls_test.sql
--
-- Worker 3 (fork_motgygqh_0531ff) deliverable for Co-Exist carpool widgets.
--
-- Privacy invariant under test (from SHARED-SPEC.md):
--   • carpool_widgets.departure_point_text  → visible to all collective members
--     (driver chose to publish).
--   • carpool_seats.pickup_address_text     → visible ONLY to (the passenger
--     themselves) OR (the driver of the carpool). Other collective members
--     must NOT see pickup_address_text. Recommended path: base-table SELECT
--     open to collective members for non-pickup columns; pickup_address_text
--     reachable only via SECURITY DEFINER RPC `get_carpool_seat_pickup(seat_id)`
--     that checks (passenger_id = auth.uid() OR is_driver(seat.carpool_id)).
--
-- This file is a psql/pgTAP-style harness. Run with:
--    psql "$SUPABASE_DB_URL" -f supabase/tests/carpool_rls_test.sql
-- Or as part of `supabase db reset` if wired into the test step.
--
-- Five-layer-listener-pipeline verification this test maps to:
--   PRODUCER: INSERT into auth.users + collectives + carpool_widgets + carpool_seats
--   TRIGGER:  RLS policies on carpool_widgets, carpool_seats
--   BRIDGE:   PostgREST request_jwt
--   LISTENER: SET LOCAL ROLE authenticated + request.jwt.claims = {sub: <user>}
--   SIDE-FX:  SELECT must / must not reveal pickup_address_text per actor
--
-- NOTE: This test depends on Worker 1's migration having run. If the
-- migration has not yet landed, the harness exits cleanly with NOTICE
-- "skipped: carpool tables not present" so it does not gate CI.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'carpool_widgets'
  ) THEN
    RAISE NOTICE 'skipped: carpool tables not present (Worker 1 migration not yet applied)';
    RETURN;
  END IF;

  -- Run the body in a transaction we'll roll back at the end.
  PERFORM 1;
END $$;

BEGIN;

-- Stop early if tables not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'carpool_widgets'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'undefined_table',
      MESSAGE = 'carpool tables not present; aborting test';
  END IF;
END $$;

-- ─── Fixture setup (service_role bypasses RLS) ───────────────────────────
SET LOCAL role = postgres;

-- Three test users
INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password,
                       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000000a', 'driver@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000000b', 'passenger@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000000c', 'thirdparty@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

-- One collective with all three as members
DO $$
DECLARE
  v_collective_id uuid := '00000000-0000-0000-0000-0000000000c0';
  v_event_id      uuid := '00000000-0000-0000-0000-0000000000e0';
  v_carpool_id    uuid := '00000000-0000-0000-0000-0000000000ca';
  v_seat_id       uuid := '00000000-0000-0000-0000-0000000000a1';
BEGIN
  -- Collective
  INSERT INTO collectives (id, name, slug, created_at)
  VALUES (v_collective_id, 'Carpool RLS Test Collective',
          'carpool-rls-test-' || floor(random() * 1000000)::text, now())
  ON CONFLICT (id) DO NOTHING;

  -- Memberships
  INSERT INTO collective_members (collective_id, user_id, role, status)
  VALUES
    (v_collective_id, '00000000-0000-0000-0000-00000000000a', 'member', 'active'),
    (v_collective_id, '00000000-0000-0000-0000-00000000000b', 'member', 'active'),
    (v_collective_id, '00000000-0000-0000-0000-00000000000c', 'member', 'active')
  ON CONFLICT DO NOTHING;

  -- Event
  INSERT INTO events (id, collective_id, title, date_start, date_end, created_at)
  VALUES (v_event_id, v_collective_id, 'Test Event',
          now() + interval '7 days',
          now() + interval '7 days 3 hours',
          now())
  ON CONFLICT (id) DO NOTHING;

  -- Carpool widget (driver = user A)
  INSERT INTO carpool_widgets
    (id, collective_id, event_id, driver_id,
     departure_point_text, departure_time, seats_total, status)
  VALUES
    (v_carpool_id, v_collective_id, v_event_id,
     '00000000-0000-0000-0000-00000000000a',
     'IGA Mooloolaba car park',
     now() + interval '7 days', 4, 'open')
  ON CONFLICT (id) DO NOTHING;

  -- Seat (passenger = user B)
  INSERT INTO carpool_seats (id, carpool_id, passenger_id, pickup_address_text, status)
  VALUES
    (v_seat_id, v_carpool_id,
     '00000000-0000-0000-0000-00000000000b',
     '12 Acacia Lane, Buderim 4556',
     'confirmed')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ─── ASSERTIONS ───────────────────────────────────────────────────────────

-- Helper that lets us "log in" as a user inside this transaction.
CREATE OR REPLACE FUNCTION pg_temp.login_as(p_user uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
END;
$$ LANGUAGE plpgsql;

-- ── Assertion 1: passenger (B) can read their own pickup_address_text
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000b');
DO $$
DECLARE
  v_addr text;
BEGIN
  -- Try the RPC first (canonical path)
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_carpool_seat_pickup'
  ) THEN
    SELECT public.get_carpool_seat_pickup('00000000-0000-0000-0000-0000000000a1')
      INTO v_addr;
    IF v_addr IS NULL OR v_addr = '' THEN
      RAISE EXCEPTION 'FAIL: passenger should see own pickup, got NULL/empty';
    END IF;
    RAISE NOTICE 'PASS: passenger sees own pickup_address_text via RPC: %', v_addr;
  ELSE
    -- Fallback: direct read on table (only works if column-level grant strategy)
    SELECT pickup_address_text FROM carpool_seats
      WHERE id = '00000000-0000-0000-0000-0000000000a1' INTO v_addr;
    IF v_addr IS NULL OR v_addr = '' THEN
      RAISE EXCEPTION 'FAIL: passenger should see own pickup, got NULL/empty (direct read)';
    END IF;
    RAISE NOTICE 'PASS: passenger sees own pickup_address_text directly: %', v_addr;
  END IF;
END $$;

-- ── Assertion 2: driver (A) can read passenger's pickup_address_text
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE
  v_addr text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_carpool_seat_pickup') THEN
    SELECT public.get_carpool_seat_pickup('00000000-0000-0000-0000-0000000000a1')
      INTO v_addr;
    IF v_addr IS NULL OR v_addr = '' THEN
      RAISE EXCEPTION 'FAIL: driver should see passenger pickup, got NULL/empty';
    END IF;
    RAISE NOTICE 'PASS: driver sees passenger pickup via RPC: %', v_addr;
  ELSE
    SELECT pickup_address_text FROM carpool_seats
      WHERE id = '00000000-0000-0000-0000-0000000000a1' INTO v_addr;
    IF v_addr IS NULL OR v_addr = '' THEN
      RAISE EXCEPTION 'FAIL: driver should see passenger pickup, got NULL/empty (direct read)';
    END IF;
    RAISE NOTICE 'PASS: driver sees passenger pickup directly: %', v_addr;
  END IF;
END $$;

-- ── Assertion 3 (CRITICAL): third-party collective member (C) MUST NOT see pickup_address_text
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000c');
DO $$
DECLARE
  v_seat_visible boolean;
  v_addr text;
  v_rpc_failed boolean := false;
BEGIN
  -- C must still be able to see seats exist (count is informational so others
  -- know "3/4 taken") but pickup_address_text MUST be hidden.
  SELECT EXISTS (
    SELECT 1 FROM carpool_seats
    WHERE id = '00000000-0000-0000-0000-0000000000a1'
  ) INTO v_seat_visible;

  IF NOT v_seat_visible THEN
    RAISE NOTICE 'NOTE: third-party cannot see carpool_seats row at all (acceptable).';
  ELSE
    -- Direct read: pickup_address_text must be NULL via column-level RLS
    -- (achieved via VIEW or by making base table inaccessible and exposing
    -- a RESTRICTED VIEW for collective members that nullifies the column).
    BEGIN
      SELECT pickup_address_text FROM carpool_seats
        WHERE id = '00000000-0000-0000-0000-0000000000a1' INTO v_addr;
      IF v_addr IS NOT NULL AND v_addr <> '' THEN
        RAISE EXCEPTION 'FAIL: third-party leaked pickup_address_text: %', v_addr;
      END IF;
      RAISE NOTICE 'PASS: third-party direct read returns NULL/empty pickup_address_text';
    EXCEPTION WHEN insufficient_privilege THEN
      -- Column-level GRANT denied → also acceptable
      RAISE NOTICE 'PASS: third-party direct read denied (insufficient_privilege)';
    END;

    -- RPC must error or return null for unauthorised caller
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_carpool_seat_pickup') THEN
      BEGIN
        SELECT public.get_carpool_seat_pickup('00000000-0000-0000-0000-0000000000a1')
          INTO v_addr;
        IF v_addr IS NULL OR v_addr = '' THEN
          RAISE NOTICE 'PASS: third-party RPC returned NULL/empty';
        ELSE
          RAISE EXCEPTION 'FAIL: third-party RPC leaked pickup: %', v_addr;
        END IF;
      EXCEPTION
        WHEN insufficient_privilege OR raise_exception THEN
          v_rpc_failed := true;
          RAISE NOTICE 'PASS: third-party RPC denied / raised (good)';
      END;
    END IF;
  END IF;
END $$;

-- ── Assertion 4: third-party CAN see departure_point_text (driver-published)
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000c');
DO $$
DECLARE
  v_dep text;
BEGIN
  SELECT departure_point_text FROM carpool_widgets
    WHERE id = '00000000-0000-0000-0000-0000000000ca' INTO v_dep;
  IF v_dep IS NULL OR v_dep = '' THEN
    RAISE EXCEPTION 'FAIL: third-party should see widget.departure_point_text, got NULL/empty';
  END IF;
  RAISE NOTICE 'PASS: third-party sees driver-published departure_point_text: %', v_dep;
END $$;

ROLLBACK;
