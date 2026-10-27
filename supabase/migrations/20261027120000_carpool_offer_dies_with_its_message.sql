-- ============================================================================
-- A carpool offer dies with the chat message that posted it
--
-- Reported by Yee Zhao (Mornington Peninsula co-leader) via Tate, 2026-10-27:
-- Branden deleted his carpool offer from the Grampians Campout group chat, the
-- offer stayed on the event page, and a member booked a seat on it the next
-- day without anyone knowing the offer was gone.
--
-- Root cause. A carpool offer is two rows: the `carpool_widgets` row (status
-- open/full/cancelled/archived) and the `chat_messages` row of type 'carpool'
-- that renders it as a card. They point at each other (widget.message_id and
-- message.carpool_id). Deleting the post in chat (useDeleteMessage and
-- useDeleteChannelMessage) only sets chat_messages.is_deleted = true. Nothing
-- told the widget, so it stayed 'open'. The event page (useEventCarpools)
-- lists widgets by status, and save_carpool_seat accepts a seat by status, so
-- the offer stayed listed AND bookable for as long as the event lasted.
--
-- Live evidence, read 2026-10-27 on tjutlbzekfouwsiaplbr:
--   widget e82f7944 (driver Brandon, Keilor to Grampians Campout, campout
--   channel 2f806fd5) status 'open'; its message 06a4381b is_deleted since
--   2026-10-20 03:56Z; seat a66c9985 taken 2026-10-21 12:20Z, a day AFTER the
--   delete. A second ghost, ef47f097 (Purlingbrook Falls, Aug), has the same
--   shape. 14 widgets exist, all linked both ways, and only message_type
--   'carpool' rows carry carpool_id.
--
-- The mechanism, in the database so it holds for every client (the 2.2.9
-- Play binary and stale bundles included) and every delete path:
--   1. Deleting the offer's message (soft: is_deleted false->true; hard: a
--      leader or admin DELETE) withdraws the offer: widget open/full ->
--      cancelled, its confirmed seats -> cancelled, and each passenger who
--      lost a seat on an upcoming event gets an in-app notice plus a push.
--   2. save_carpool_seat refuses an offer whose message is deleted, so even a
--      widget left 'open' by some future path cannot take a seat.
--   3. Backfill: the two existing ghosts are cancelled with their seats. Both
--      events are over, so nobody is notified.
--
-- The hard-delete arm is BEFORE DELETE on purpose. widget.message_id is
-- ON DELETE SET NULL, and the RI action runs as an AFTER trigger named
-- RI_ConstraintTrigger_*, which sorts ahead of ours, so an AFTER DELETE arm
-- would find message_id already NULL. It skips cascades (pg_trigger_depth > 1):
-- a message deleted because its collective, channel or event was deleted takes
-- the widget with it through the widget's own CASCADE FKs, and touching those
-- rows from inside the cascade is risk with no benefit (the GDPR erasure job
-- aborts the whole night on any error).
--
-- Notification uses type 'event_updated' with an explicit data.route, which
-- every bundle in the field already renders and routes (a new type would read
-- as a bare bell and route home on old bundles), and which respects the
-- member's existing "event updated" push preference in send-push.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_carpool_widgets_message ON public.carpool_widgets (message_id);

-- ----------------------------------------------------------------------------
-- 1. Withdraw the offer a message posted
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carpool_withdraw_offer_for_message(
  p_message_id uuid,
  p_carpool_id uuid DEFAULT NULL,
  p_notify boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_w record;
  v_passengers uuid[];
  v_event record;
  v_driver text;
  v_title text := 'Carpool cancelled';
  v_body text;
  v_route text;
  v_count integer := 0;
  v_svc_key text;
BEGIN
  FOR v_w IN
    UPDATE carpool_widgets
       SET status = 'cancelled'
     WHERE (message_id = p_message_id
            OR (p_carpool_id IS NOT NULL AND id = p_carpool_id))
       AND status IN ('open', 'full')
    RETURNING id, event_id, driver_id, departure_point_text
  LOOP
    v_count := v_count + 1;

    WITH c AS (
      UPDATE carpool_seats
         SET status = 'cancelled'
       WHERE carpool_id = v_w.id
         AND status = 'confirmed'
      RETURNING passenger_id
    )
    SELECT array_agg(passenger_id) INTO v_passengers FROM c;

    IF NOT p_notify OR v_passengers IS NULL OR cardinality(v_passengers) = 0 THEN
      CONTINUE;
    END IF;

    -- Tell each passenger, but never let a notice failure undo the cancel or
    -- block the delete that caused it.
    BEGIN
      SELECT id, title, date_start, date_end INTO v_event
        FROM events WHERE id = v_w.event_id;

      -- date_start/date_end are floating wall-clock values stored as +00, so a
      -- one-day margin stands in for "the event is not long over".
      IF v_event.id IS NULL
         OR COALESCE(v_event.date_end, v_event.date_start) < now() - interval '1 day' THEN
        CONTINUE;
      END IF;

      SELECT NULLIF(btrim(display_name), '') INTO v_driver
        FROM profiles WHERE id = v_w.driver_id;

      v_body := COALESCE(v_driver, 'The driver') || ' removed their carpool from '
             || COALESCE(NULLIF(btrim(v_w.departure_point_text), ''), 'their pickup point')
             || ' to ' || COALESCE(v_event.title, 'the event')
             || ', so your seat is gone. Check the event page for other rides.';
      v_route := '/events/' || v_event.id::text;

      INSERT INTO notifications (user_id, type, title, body, data)
      SELECT pid, 'event_updated', v_title, v_body,
             jsonb_build_object('event_id', v_event.id::text,
                                'carpool_id', v_w.id::text,
                                'route', v_route,
                                'reason', 'carpool_cancelled')
        FROM unnest(v_passengers) AS pid;

      v_svc_key := (SELECT decrypted_secret FROM vault.decrypted_secrets
                     WHERE name = 'service_role_key' LIMIT 1);
      IF v_svc_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/send-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_svc_key
          ),
          body := jsonb_build_object(
            'userIds', to_jsonb(v_passengers::text[]),
            'title', v_title,
            'body', v_body,
            'data', jsonb_build_object(
              'type', 'event_updated',
              'event_id', v_event.id::text,
              'route', v_route
            )
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'carpool_withdraw_offer_for_message: notice for carpool % failed: %',
        v_w.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.carpool_withdraw_offer_for_message(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.carpool_withdraw_offer_for_message(uuid, uuid, boolean) FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Triggers on chat_messages (soft delete and hard delete)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_chat_message_withdraws_carpool()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- A cascade from a deleted collective / channel / event takes the widget
    -- with it through the widget's own FKs; do not touch rows mid-cascade.
    IF pg_trigger_depth() <= 1 THEN
      PERFORM carpool_withdraw_offer_for_message(
        OLD.id,
        CASE WHEN OLD.message_type = 'carpool' THEN OLD.carpool_id END
      );
    END IF;
    RETURN OLD;
  END IF;

  PERFORM carpool_withdraw_offer_for_message(
    NEW.id,
    CASE WHEN NEW.message_type = 'carpool' THEN NEW.carpool_id END
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_chat_message_withdraws_carpool() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_chat_message_withdraws_carpool() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_messages_withdraw_carpool_on_delete ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_withdraw_carpool_on_delete
  AFTER UPDATE OF is_deleted ON public.chat_messages
  FOR EACH ROW
  WHEN (NEW.is_deleted IS TRUE AND OLD.is_deleted IS DISTINCT FROM TRUE)
  EXECUTE FUNCTION public.trg_chat_message_withdraws_carpool();

DROP TRIGGER IF EXISTS trg_chat_messages_withdraw_carpool_on_hard_delete ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_withdraw_carpool_on_hard_delete
  BEFORE DELETE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_chat_message_withdraws_carpool();

-- ----------------------------------------------------------------------------
-- 3. save_carpool_seat refuses an offer whose message is deleted
--    (built from the live pg_get_functiondef, read 2026-10-27; one added check)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_carpool_seat(p_carpool_id uuid, p_pickup_address_text text, p_pickup_lat numeric DEFAULT NULL::numeric, p_pickup_lng numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT * INTO v_widget FROM carpool_widgets WHERE id = p_carpool_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'carpool not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    (v_widget.collective_id IS NOT NULL AND is_collective_member(v_caller, v_widget.collective_id))
    OR (v_widget.channel_id IS NOT NULL AND is_channel_member(v_caller, v_widget.channel_id))
  ) THEN
    RAISE EXCEPTION 'not a member of this carpool group' USING ERRCODE = '42501';
  END IF;
  IF v_widget.driver_id = v_caller THEN
    RAISE EXCEPTION 'driver cannot claim a seat in own carpool' USING ERRCODE = '42501';
  END IF;
  IF v_widget.status NOT IN ('open') THEN
    RAISE EXCEPTION 'carpool is not accepting seats (status=%)', v_widget.status USING ERRCODE = '22023';
  END IF;
  -- The driver deleted the post that offered this carpool: the offer is gone.
  IF v_widget.message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM chat_messages WHERE id = v_widget.message_id AND is_deleted IS TRUE
  ) THEN
    RAISE EXCEPTION 'carpool is not accepting seats (the offer was removed)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM carpool_seats
    WHERE carpool_id = p_carpool_id AND passenger_id = v_caller AND status = 'confirmed';
  IF FOUND THEN
    RETURN to_jsonb(v_existing);
  END IF;
  SELECT count(*) INTO v_open_count FROM carpool_seats
    WHERE carpool_id = p_carpool_id AND status = 'confirmed';
  IF v_open_count >= v_widget.seats_total THEN
    RAISE EXCEPTION 'no seats remaining' USING ERRCODE = '22023';
  END IF;
  INSERT INTO carpool_seats (carpool_id, passenger_id, pickup_address_text, pickup_lat, pickup_lng, status)
  VALUES (p_carpool_id, v_caller, p_pickup_address_text, p_pickup_lat, p_pickup_lng, 'confirmed')
  ON CONFLICT (carpool_id, passenger_id) DO UPDATE
    SET pickup_address_text = EXCLUDED.pickup_address_text,
        pickup_lat = EXCLUDED.pickup_lat, pickup_lng = EXCLUDED.pickup_lng, status = 'confirmed'
  RETURNING * INTO v_seat;
  IF (v_open_count + 1) >= v_widget.seats_total THEN
    UPDATE carpool_widgets SET status = 'full' WHERE id = p_carpool_id;
  END IF;
  RETURN to_jsonb(v_seat);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. Backfill: every offer whose message is already deleted. No notices, since
--    both affected events (Grampians Campout, Purlingbrook Falls) are over.
-- ----------------------------------------------------------------------------
SELECT public.carpool_withdraw_offer_for_message(m.id, m.carpool_id, false)
  FROM public.chat_messages m
 WHERE m.message_type = 'carpool'
   AND m.is_deleted IS TRUE
   AND m.carpool_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
