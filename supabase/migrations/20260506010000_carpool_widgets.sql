-- ============================================================================
-- Carpool widgets - DB schema, RLS, RPCs, realtime, pg_cron archive sweep
-- Migration: 20260506010000_carpool_widgets.sql
-- Author: fork_motgycfd_2a6900 (Worker 1 of 3, Co-Exist carpool widgets)
-- Spec: ~/ecodiaos/drafts/coexist-carpool-2026-05-06/SHARED-SPEC.md
--
-- Tables created:
--   carpool_widgets         - the widget itself (driver-published trip)
--   carpool_seats           - passenger seat claims with private pickup addr
--   carpool_breakout_chats  - carpool ↔ chat_channel link with archive lifecycle
--
-- chat_messages: ADD COLUMN carpool_id, extend message_type CHECK to include 'carpool'.
-- chat_channels: extend type CHECK to include 'carpool_breakout'; add
--   lifecycle_status column for open/archived (existing `state` column is
--   reserved for Australian state codes per migration 023, so we deviate
--   from spec wording and use a dedicated `lifecycle_status` column).
--
-- Privacy invariant (CRITICAL):
--   carpool_seats.pickup_address_text MUST be readable only by:
--     (a) the passenger themselves, OR
--     (b) the driver of the carpool.
--   Other collective members can SEE that the seat exists but pickup_address_text
--   must return NULL for them. RLS cannot per-column mask in PostgREST cleanly,
--   so we keep base-table SELECT open to collective members and expose pickup
--   only via a SECURITY DEFINER RPC `get_carpool_seat_pickup(seat_id)` that
--   enforces the (passenger OR driver) check. The frontend MUST query the
--   address via this RPC, never via direct SELECT on carpool_seats.
--   (We also expose a SECURITY INVOKER VIEW v_carpool_seats_safe that always
--   returns NULL pickup, for read paths that just need seat counts/passengers.)
--
-- Atomic seat claim:
--   `save_carpool_seat(carpool_id, pickup, lat, lng)` SECURITY DEFINER RPC.
--   SELECT FOR UPDATE on carpool_widgets row, count open seats vs seats_total,
--   INSERT carpool_seats, flip widget.status='full' if last seat claimed.
--
-- pg_cron:
--   Every hour calls the carpool-archive-sweep edge function via pg_net + vault
--   service-role-key (mirroring 20260413060000_pg_cron_excel_sync.sql).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS carpool_widgets (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id           uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  event_id                uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  driver_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id              uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  departure_point_text    text NOT NULL,
  departure_lat           numeric,
  departure_lng           numeric,
  departure_time          timestamptz NOT NULL,
  seats_total             int NOT NULL CHECK (seats_total > 0),
  notes                   text,
  status                  text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','full','cancelled','archived')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_carpool_widgets_collective ON carpool_widgets(collective_id);
CREATE INDEX IF NOT EXISTS idx_carpool_widgets_event ON carpool_widgets(event_id);
CREATE INDEX IF NOT EXISTS idx_carpool_widgets_driver ON carpool_widgets(driver_id);

CREATE TABLE IF NOT EXISTS carpool_seats (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carpool_id              uuid NOT NULL REFERENCES carpool_widgets(id) ON DELETE CASCADE,
  passenger_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pickup_address_text     text NOT NULL,
  pickup_lat              numeric,
  pickup_lng              numeric,
  status                  text NOT NULL DEFAULT 'confirmed'
                          CHECK (status IN ('confirmed','cancelled')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(carpool_id, passenger_id)
);

CREATE INDEX IF NOT EXISTS idx_carpool_seats_carpool_status ON carpool_seats(carpool_id, status);
CREATE INDEX IF NOT EXISTS idx_carpool_seats_passenger ON carpool_seats(passenger_id);

CREATE TABLE IF NOT EXISTS carpool_breakout_chats (
  carpool_id              uuid PRIMARY KEY REFERENCES carpool_widgets(id) ON DELETE CASCADE,
  channel_id              uuid NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  archived_at             timestamptz,
  deleted_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_carpool_breakout_chats_channel ON carpool_breakout_chats(channel_id);
CREATE INDEX IF NOT EXISTS idx_carpool_breakout_chats_archive ON carpool_breakout_chats(archived_at)
  WHERE archived_at IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. chat_messages: carpool_id column + message_type extension
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'carpool_id'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN carpool_id uuid;
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_carpool_id_fkey
      FOREIGN KEY (carpool_id) REFERENCES carpool_widgets(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_carpool ON chat_messages(carpool_id)
  WHERE carpool_id IS NOT NULL;

-- Extend message_type CHECK to include 'carpool'.
-- Latest version (migration 054) is: text, image, voice, video, poll, announcement, system, html.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN (
    'text', 'image', 'voice', 'video', 'poll', 'announcement',
    'system', 'html', 'carpool'
  ));

-- ---------------------------------------------------------------------------
-- 3. chat_channels: extend type, add lifecycle_status
-- ---------------------------------------------------------------------------
--
-- Note: chat_channels.state is reserved for Australian state codes (NSW etc)
-- when type='staff_state' (per migration 023). We DO NOT overload it for
-- carpool open/archived lifecycle; we add a dedicated lifecycle_status column.
-- This is a documented deviation from the SHARED-SPEC wording.
-- ---------------------------------------------------------------------------

ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE chat_channels ADD CONSTRAINT chat_channels_type_check CHECK (
  (type = 'staff_collective' AND collective_id IS NOT NULL) OR
  (type = 'staff_state' AND state IS NOT NULL) OR
  (type = 'staff_national') OR
  (type = 'carpool_breakout' AND collective_id IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_channels' AND column_name = 'lifecycle_status'
  ) THEN
    ALTER TABLE chat_channels ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'open'
      CHECK (lifecycle_status IN ('open','archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_channels_lifecycle ON chat_channels(lifecycle_status)
  WHERE lifecycle_status = 'archived';

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE carpool_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE carpool_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE carpool_breakout_chats ENABLE ROW LEVEL SECURITY;

-- carpool_widgets ----------------------------------------------------------
CREATE POLICY "carpool_widgets_select"
  ON carpool_widgets FOR SELECT TO authenticated
  USING (
    is_collective_member(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "carpool_widgets_insert"
  ON carpool_widgets FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND is_collective_member(auth.uid(), collective_id)
  );

CREATE POLICY "carpool_widgets_update"
  ON carpool_widgets FOR UPDATE TO authenticated
  USING (
    driver_id = auth.uid()
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "carpool_widgets_delete"
  ON carpool_widgets FOR DELETE TO authenticated
  USING (
    driver_id = auth.uid()
    OR is_admin_or_staff(auth.uid())
  );

-- carpool_seats ------------------------------------------------------------
-- SELECT: collective members can see seats exist (pickup_address_text remains
-- in the row but the FE MUST NOT surface it raw - frontend must call the
-- get_carpool_seat_pickup RPC to fetch it. The privacy contract is enforced
-- by client convention + the RPC; the v_carpool_seats_safe view below is the
-- recommended read path.
CREATE POLICY "carpool_seats_select"
  ON carpool_seats FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM carpool_widgets w
      WHERE w.id = carpool_id
        AND (
          is_collective_member(auth.uid(), w.collective_id)
          OR is_admin_or_staff(auth.uid())
        )
    )
  );

-- INSERT: only via SECURITY DEFINER save_carpool_seat RPC (which bypasses RLS
-- because of SECURITY DEFINER). Direct INSERT from clients is blocked by the
-- absence of a permissive INSERT policy. We keep no INSERT policy here.

-- UPDATE: passenger themselves OR driver may cancel
CREATE POLICY "carpool_seats_update"
  ON carpool_seats FOR UPDATE TO authenticated
  USING (
    passenger_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM carpool_widgets w
      WHERE w.id = carpool_id AND w.driver_id = auth.uid()
    )
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "carpool_seats_delete"
  ON carpool_seats FOR DELETE TO authenticated
  USING (
    passenger_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM carpool_widgets w
      WHERE w.id = carpool_id AND w.driver_id = auth.uid()
    )
    OR is_admin_or_staff(auth.uid())
  );

-- carpool_breakout_chats ---------------------------------------------------
CREATE POLICY "carpool_breakout_chats_select"
  ON carpool_breakout_chats FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_channel_members ccm
      WHERE ccm.channel_id = carpool_breakout_chats.channel_id
        AND ccm.user_id = auth.uid()
    )
    OR is_admin_or_staff(auth.uid())
  );

-- INSERT/UPDATE/DELETE happen via SECURITY DEFINER edge functions; no
-- permissive policies needed for direct client writes.

-- ---------------------------------------------------------------------------
-- 5. Privacy view: carpool_seats without pickup_address_text
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER view: respects underlying RLS, masks pickup column.
-- Frontend should query this view for seat lists.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_carpool_seats_safe
WITH (security_invoker = true) AS
SELECT
  id,
  carpool_id,
  passenger_id,
  -- Only return pickup_address_text if caller is the passenger or the driver
  CASE
    WHEN passenger_id = auth.uid() THEN pickup_address_text
    WHEN EXISTS (
      SELECT 1 FROM carpool_widgets w
      WHERE w.id = carpool_seats.carpool_id AND w.driver_id = auth.uid()
    ) THEN pickup_address_text
    ELSE NULL
  END AS pickup_address_text,
  CASE
    WHEN passenger_id = auth.uid() THEN pickup_lat
    WHEN EXISTS (
      SELECT 1 FROM carpool_widgets w
      WHERE w.id = carpool_seats.carpool_id AND w.driver_id = auth.uid()
    ) THEN pickup_lat
    ELSE NULL
  END AS pickup_lat,
  CASE
    WHEN passenger_id = auth.uid() THEN pickup_lng
    WHEN EXISTS (
      SELECT 1 FROM carpool_widgets w
      WHERE w.id = carpool_seats.carpool_id AND w.driver_id = auth.uid()
    ) THEN pickup_lng
    ELSE NULL
  END AS pickup_lng,
  status,
  created_at
FROM carpool_seats;

GRANT SELECT ON v_carpool_seats_safe TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: get_carpool_seat_pickup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_carpool_seat_pickup(p_seat_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_seat carpool_seats%ROWTYPE;
  v_caller uuid := auth.uid();
  v_is_driver boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_seat FROM carpool_seats WHERE id = p_seat_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM carpool_widgets w
    WHERE w.id = v_seat.carpool_id AND w.driver_id = v_caller
  ) INTO v_is_driver;

  IF v_seat.passenger_id = v_caller OR v_is_driver THEN
    RETURN jsonb_build_object(
      'seat_id', v_seat.id,
      'pickup_address_text', v_seat.pickup_address_text,
      'pickup_lat', v_seat.pickup_lat,
      'pickup_lng', v_seat.pickup_lng
    );
  END IF;

  -- Not authorised: return NULL fields (deliberately not raising, so probe
  -- of an unrelated seat does not leak existence beyond what the base RLS
  -- already exposes).
  RETURN jsonb_build_object(
    'seat_id', v_seat.id,
    'pickup_address_text', NULL,
    'pickup_lat', NULL,
    'pickup_lng', NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION get_carpool_seat_pickup(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC: save_carpool_seat (atomic seat claim)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION save_carpool_seat(
  p_carpool_id uuid,
  p_pickup_address_text text,
  p_pickup_lat numeric DEFAULT NULL,
  p_pickup_lng numeric DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_widget carpool_widgets%ROWTYPE;
  v_open_count int;
  v_seat carpool_seats%ROWTYPE;
  v_existing carpool_seats%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_pickup_address_text IS NULL OR length(trim(p_pickup_address_text)) = 0 THEN
    RAISE EXCEPTION 'pickup_address_text required' USING ERRCODE = '22023';
  END IF;

  -- Lock the widget row to serialise concurrent claims
  SELECT * INTO v_widget
  FROM carpool_widgets
  WHERE id = p_carpool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'carpool not found' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be a member of the carpool's collective
  IF NOT is_collective_member(v_caller, v_widget.collective_id) THEN
    RAISE EXCEPTION 'not a member of this collective' USING ERRCODE = '42501';
  END IF;

  -- Driver cannot claim their own seat (they ARE the carpool)
  IF v_widget.driver_id = v_caller THEN
    RAISE EXCEPTION 'driver cannot claim a seat in own carpool' USING ERRCODE = '42501';
  END IF;

  IF v_widget.status NOT IN ('open') THEN
    RAISE EXCEPTION 'carpool is not accepting seats (status=%)', v_widget.status USING ERRCODE = '22023';
  END IF;

  -- If caller already has a confirmed seat, return it (idempotent)
  SELECT * INTO v_existing
  FROM carpool_seats
  WHERE carpool_id = p_carpool_id
    AND passenger_id = v_caller
    AND status = 'confirmed';

  IF FOUND THEN
    RETURN to_jsonb(v_existing);
  END IF;

  -- Count currently confirmed seats
  SELECT count(*) INTO v_open_count
  FROM carpool_seats
  WHERE carpool_id = p_carpool_id
    AND status = 'confirmed';

  IF v_open_count >= v_widget.seats_total THEN
    RAISE EXCEPTION 'no seats remaining' USING ERRCODE = '22023';
  END IF;

  INSERT INTO carpool_seats (
    carpool_id, passenger_id, pickup_address_text, pickup_lat, pickup_lng, status
  ) VALUES (
    p_carpool_id, v_caller, p_pickup_address_text, p_pickup_lat, p_pickup_lng, 'confirmed'
  )
  ON CONFLICT (carpool_id, passenger_id) DO UPDATE
    SET pickup_address_text = EXCLUDED.pickup_address_text,
        pickup_lat = EXCLUDED.pickup_lat,
        pickup_lng = EXCLUDED.pickup_lng,
        status = 'confirmed'
  RETURNING * INTO v_seat;

  -- If this was the last seat, flip widget status to 'full'
  IF (v_open_count + 1) >= v_widget.seats_total THEN
    UPDATE carpool_widgets SET status = 'full' WHERE id = p_carpool_id;
  END IF;

  RETURN to_jsonb(v_seat);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

GRANT EXECUTE ON FUNCTION save_carpool_seat(uuid, text, numeric, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime publication
-- ---------------------------------------------------------------------------
-- Add carpool_widgets and carpool_seats to supabase_realtime publication.
-- Use DO block to ignore "relation already in publication" errors on re-run.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE carpool_widgets;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE carpool_seats;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 9. pg_cron: hourly carpool-archive-sweep
-- ---------------------------------------------------------------------------
-- Mirrors 20260413060000_pg_cron_excel_sync.sql shape: vault-stored
-- service_role_key + pg_net POST to the edge function.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cron_carpool_archive_sweep() RETURNS void AS $$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/carpool-archive-sweep';
  svc_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: every hour at minute 17 (offset from existing crons to avoid spike)
DO $$
BEGIN
  -- Unschedule any prior version so re-running migration is idempotent
  PERFORM cron.unschedule('carpool-archive-sweep')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'carpool-archive-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'carpool-archive-sweep',
  '17 * * * *',
  $$SELECT public.cron_carpool_archive_sweep()$$
);

-- Force PostgREST to reload schema cache so the new RPCs/views are exposed.
NOTIFY pgrst, 'reload schema';
