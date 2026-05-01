-- Reduce pending ticket expiry from 30 to 15 minutes.
-- Abandoned checkouts release capacity faster during high-demand events.

CREATE OR REPLACE FUNCTION expire_stale_pending_tickets() RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE status = 'pending'
    AND created_at < now() - INTERVAL '15 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reserve_event_ticket(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_user_id uuid,
  p_quantity integer DEFAULT 1,
  p_stripe_session_id text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_ticket_type event_ticket_types;
  v_sold integer;
  v_ticket_id uuid;
  v_code text;
  v_attempts integer := 0;
BEGIN
  -- Clean up stale pending tickets for this type
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE ticket_type_id = p_ticket_type_id
    AND status = 'pending'
    AND created_at < now() - INTERVAL '15 minutes';

  -- Cancel any existing pending ticket for this user+event (abandoned checkout)
  UPDATE event_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE event_id = p_event_id
    AND user_id = p_user_id
    AND status = 'pending';

  -- Lock the ticket type row
  SELECT * INTO v_ticket_type
  FROM event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket type not found or inactive';
  END IF;

  -- Check sale window
  IF v_ticket_type.sale_start IS NOT NULL AND now() < v_ticket_type.sale_start THEN
    RAISE EXCEPTION 'Tickets not on sale yet';
  END IF;
  IF v_ticket_type.sale_end IS NOT NULL AND now() > v_ticket_type.sale_end THEN
    RAISE EXCEPTION 'Ticket sales have ended';
  END IF;

  -- Check capacity (only count non-stale tickets)
  IF v_ticket_type.capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_sold
    FROM event_tickets
    WHERE ticket_type_id = p_ticket_type_id
      AND status IN ('pending', 'confirmed', 'checked_in')
      AND (status != 'pending' OR created_at > now() - INTERVAL '15 minutes');

    IF v_sold + p_quantity > v_ticket_type.capacity THEN
      RAISE EXCEPTION 'Sold out — only % tickets remaining', v_ticket_type.capacity - v_sold;
    END IF;
  END IF;

  -- Generate unique ticket code
  LOOP
    v_code := generate_ticket_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM event_tickets WHERE ticket_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique ticket code';
    END IF;
  END LOOP;

  -- Insert ticket
  INSERT INTO event_tickets (
    event_id, ticket_type_id, user_id, status, price_cents, quantity,
    stripe_checkout_session_id, ticket_code
  ) VALUES (
    p_event_id, p_ticket_type_id, p_user_id, 'pending',
    v_ticket_type.price_cents * p_quantity, p_quantity,
    p_stripe_session_id, v_code
  )
  RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$ LANGUAGE plpgsql;
