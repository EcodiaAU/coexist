-- =====================================================================
-- Carpool widgets: channel scope (campout group chats)
-- Migration: 20260803010000_carpool_channel_scope.sql
-- =====================================================================
-- Origin: Tate 2026-08-03. In a campout event chat (chat_channels.type=
-- 'campout', a collective-less channel reached via /chat/channel/:id) nobody
-- could send a carpool widget: the entire carpool subsystem was scoped to a
-- collective (carpool_widgets.collective_id NOT NULL, RLS + save_carpool_seat
-- keyed on is_collective_member). Campout chat members are ticket-buyers,
-- explicitly NOT collective members, so every membership predicate returned
-- false. Carpooling matters MOST for campouts (remote outback drives), so the
-- fix is to make a carpool scopable to a chat_channel as well as a collective.
--
-- This migration:
--   1. is_channel_member(uid, channel_id) helper (mirrors is_collective_member).
--   2. carpool_widgets.collective_id -> nullable; add channel_id; a CHECK that
--      exactly one scope is set (num_nonnulls = 1); index on channel_id.
--   3. carpool_widgets SELECT/INSERT + carpool_seats SELECT policies gain a
--      channel-member branch alongside the existing collective-member branch.
--   4. save_carpool_seat's membership guard accepts collective OR channel
--      members.
--
-- Privacy invariant is UNCHANGED: pickup_address_text is still exposed only via
-- get_carpool_seat_pickup / v_carpool_seats_safe, both gated on
-- (passenger OR driver), which is membership-independent. Channel members gain
-- exactly the visibility collective members already had (seats exist + who the
-- driver is), scoped to the campout's own ticket-buyers.
--
-- Breakout-chat handling for channel-scoped carpools lives in the
-- carpool-save-seat edge function: it skips breakout creation when the widget
-- is channel-scoped (chat_channels.type='carpool_breakout' requires a
-- collective), because the campout channel is already the coordination surface.
-- Idempotent + transactional.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Channel-membership helper (twin of is_collective_member)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_channel_member(p_user_id uuid, p_channel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members ccm
    WHERE ccm.channel_id = p_channel_id
      AND ccm.user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. carpool_widgets: allow channel-scoped widgets
-- ---------------------------------------------------------------------
ALTER TABLE public.carpool_widgets ALTER COLUMN collective_id DROP NOT NULL;

ALTER TABLE public.carpool_widgets
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_carpool_widgets_channel ON public.carpool_widgets(channel_id);

-- Exactly one scope (collective XOR channel). num_nonnulls keeps old
-- collective rows valid and forbids an unscoped widget.
ALTER TABLE public.carpool_widgets DROP CONSTRAINT IF EXISTS carpool_widgets_scope_chk;
ALTER TABLE public.carpool_widgets ADD CONSTRAINT carpool_widgets_scope_chk
  CHECK (num_nonnulls(collective_id, channel_id) = 1);

-- ---------------------------------------------------------------------
-- 3. RLS: add the channel-member branch (NULL-guarded so the helper is
--    never called with a NULL scope id)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "carpool_widgets_select" ON public.carpool_widgets;
CREATE POLICY "carpool_widgets_select"
  ON public.carpool_widgets FOR SELECT TO authenticated
  USING (
    is_admin_or_staff(auth.uid())
    OR (collective_id IS NOT NULL AND is_collective_member(auth.uid(), collective_id))
    OR (channel_id IS NOT NULL AND is_channel_member(auth.uid(), channel_id))
  );

DROP POLICY IF EXISTS "carpool_widgets_insert" ON public.carpool_widgets;
CREATE POLICY "carpool_widgets_insert"
  ON public.carpool_widgets FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND (
      (collective_id IS NOT NULL AND is_collective_member(auth.uid(), collective_id))
      OR (channel_id IS NOT NULL AND is_channel_member(auth.uid(), channel_id))
    )
  );

DROP POLICY IF EXISTS "carpool_seats_select" ON public.carpool_seats;
CREATE POLICY "carpool_seats_select"
  ON public.carpool_seats FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carpool_widgets w
      WHERE w.id = carpool_id
        AND (
          is_admin_or_staff(auth.uid())
          OR (w.collective_id IS NOT NULL AND is_collective_member(auth.uid(), w.collective_id))
          OR (w.channel_id IS NOT NULL AND is_channel_member(auth.uid(), w.channel_id))
        )
    )
  );

-- ---------------------------------------------------------------------
-- 4. save_carpool_seat: membership guard accepts collective OR channel.
--    Full body re-declared (only the membership block changed vs
--    20260506010000).
-- ---------------------------------------------------------------------
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

  -- Caller must be a member of the carpool's group (collective OR channel)
  IF NOT (
    (v_widget.collective_id IS NOT NULL AND is_collective_member(v_caller, v_widget.collective_id))
    OR (v_widget.channel_id IS NOT NULL AND is_channel_member(v_caller, v_widget.channel_id))
  ) THEN
    RAISE EXCEPTION 'not a member of this carpool group' USING ERRCODE = '42501';
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

-- Force PostgREST to reload schema cache so the new column/policies are exposed.
NOTIFY pgrst, 'reload schema';

COMMIT;
