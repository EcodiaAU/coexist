-- Battery for "a waitlist offer holds its seat" (migration 20260925000000).
-- Runs entirely inside a transaction against a fixture event and ROLLS BACK,
-- so it is safe on the live database. Prints one PASS/FAIL line per case.
--
-- Every refusal case asserts WHY it was refused (the waitlist-hold message),
-- not merely that a refusal happened, and case 11 is the control that the same
-- buyer on the same seat is let through when no offer is live. Run this against
-- the pre-migration functions and cases 1, 3, 6a, 7b, 8a, 10, 12a and 12b must FAIL; a battery
-- that passes on the old code is not measuring the hold.
BEGIN;

SET LOCAL client_min_messages TO WARNING;

CREATE TEMP TABLE wh_results(n text, verdict text, detail text) ON COMMIT DROP;

-- Attempt a reservation and undo it, returning 'ok' or the refusal text. The
-- inner block is a subtransaction, so the pending ticket it creates never
-- leaks into the next case.
CREATE FUNCTION pg_temp.try_reserve(p_event uuid, p_type uuid, p_user uuid, p_qty int)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM public.reserve_event_ticket(p_event, p_type, p_user, p_qty, NULL, NULL);
    RAISE EXCEPTION 'WLHOLD_OK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WLHOLD_OK' THEN RETURN 'ok'; END IF;
    RETURN SQLERRM;
  END;
END $$;

-- Join the waitlist as a given viewer (NULL = anonymous), returning the
-- position or the refusal text.
CREATE FUNCTION pg_temp.join_as(p_event uuid, p_viewer uuid, p_email text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb; v text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_viewer::text, ''), true);
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_viewer IS NULL THEN '' ELSE json_build_object('sub', p_viewer)::text END, true);
  BEGIN
    r := public.join_event_waitlist(p_event, p_email, 'Joiner', 1, NULL, 'app');
    v := 'position ' || (r ->> 'position');
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

-- What get_event_ticket_availability tells a given viewer (NULL = anonymous).
CREATE FUNCTION pg_temp.remaining_as(p_event uuid, p_viewer uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_viewer::text, ''), true);
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_viewer IS NULL THEN '' ELSE json_build_object('sub', p_viewer)::text END, true);
  r := public.get_event_ticket_availability(p_event);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN (r -> 0 ->> 'remaining')::int;
END $$;

DO $$
DECLARE
  v_coll      uuid;
  v_event     uuid;
  v_type      uuid;
  v_holder    uuid;
  v_offeree   uuid;
  v_stranger  uuid;
  v_off_email text;
  v_wl        uuid;
  v_txt       text;
  v_txt2      text;
  v_a int; v_b int; v_c int;
  HELD CONSTANT text := '%held for someone on the waitlist%';
BEGIN
  -- ---- fixture: capacity 2, one seat sold, one free ----------------
  SELECT id INTO v_coll FROM collectives ORDER BY created_at LIMIT 1;
  SELECT p.id INTO v_holder   FROM profiles p JOIN auth.users u ON u.id = p.id ORDER BY p.created_at OFFSET 0 LIMIT 1;
  SELECT p.id INTO v_offeree  FROM profiles p JOIN auth.users u ON u.id = p.id ORDER BY p.created_at OFFSET 1 LIMIT 1;
  SELECT p.id INTO v_stranger FROM profiles p JOIN auth.users u ON u.id = p.id ORDER BY p.created_at OFFSET 2 LIMIT 1;
  SELECT lower(email) INTO v_off_email FROM auth.users WHERE id = v_offeree;

  INSERT INTO events (title, description, collective_id, date_start, date_end,
                      capacity, is_ticketed, is_public, status, created_by, activity_type)
  VALUES ('WLHOLD fixture', 'battery', v_coll,
          now() + interval '30 days', now() + interval '31 days',
          2, true, true, 'published', v_holder, 'camp_out')
  RETURNING id INTO v_event;

  INSERT INTO event_ticket_types (event_id, name, price_cents, capacity, is_active, sort_order)
  VALUES (v_event, 'WLHOLD General', 5000, 2, true, 0)
  RETURNING id INTO v_type;

  INSERT INTO event_tickets (event_id, ticket_type_id, user_id, status, price_cents, quantity, ticket_code)
  VALUES (v_event, v_type, v_holder, 'confirmed', 5000, 1, 'WLHOLD01');

  -- ---- 11 (control): no live offer, the stranger buys the free seat ----
  v_txt := pg_temp.try_reserve(v_event, v_type, v_stranger, 1);
  INSERT INTO wh_results VALUES ('11', CASE WHEN v_txt = 'ok' THEN 'PASS' ELSE 'FAIL' END,
    format('control: with no offer live the stranger can buy the free seat (got %s)', v_txt));

  -- ---- live offer to the offeree -----------------------------------
  INSERT INTO event_waitlist (event_id, ticket_type_id, user_id, email, name, quantity, source, notified_at, notify_count)
  VALUES (v_event, v_type, v_offeree, v_off_email, 'Offeree', 1, 'app', now(), 1)
  RETURNING id INTO v_wl;

  -- ---- 1: a walk-up buyer is refused, BECAUSE of the hold ----------
  v_txt := pg_temp.try_reserve(v_event, v_type, v_stranger, 1);
  INSERT INTO wh_results VALUES ('1', CASE WHEN v_txt ILIKE HELD THEN 'PASS' ELSE 'FAIL' END,
    format('a live offer refuses a walk-up buyer with the waitlist message (got %s)', v_txt));

  -- ---- 10: the refusal still routes as a 409 in routeReserveError ----
  INSERT INTO wh_results VALUES ('10', CASE WHEN lower(v_txt) LIKE '%sold out%' THEN 'PASS' ELSE 'FAIL' END,
    'the hold message carries "sold out" so reserve-error.ts maps it to 409');

  -- ---- 2: the offeree takes their own held seat ---------------------
  v_txt := pg_temp.try_reserve(v_event, v_type, v_offeree, 1);
  INSERT INTO wh_results VALUES ('2', CASE WHEN v_txt = 'ok' THEN 'PASS' ELSE 'FAIL' END,
    format('the offeree can buy the seat held for them (got %s)', v_txt));

  -- ---- 6: what each viewer is shown --------------------------------
  v_a := pg_temp.remaining_as(v_event, v_stranger);
  v_b := pg_temp.remaining_as(v_event, v_offeree);
  v_c := pg_temp.remaining_as(v_event, NULL);
  INSERT INTO wh_results VALUES ('6a', CASE WHEN v_a = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('a signed-in stranger is shown 0 remaining (got %s)', v_a));
  INSERT INTO wh_results VALUES ('6b', CASE WHEN v_b = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('the offeree is shown the seat (got %s)', v_b));
  INSERT INTO wh_results VALUES ('6c', CASE WHEN v_c = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('an anonymous viewer is shown the seat, so a guest offeree is never stranded (got %s)', v_c));

  -- ---- 3: a guest offeree is matched on their account email ---------
  UPDATE event_waitlist SET user_id = NULL WHERE id = v_wl;
  v_txt  := pg_temp.try_reserve(v_event, v_type, v_offeree, 1);
  v_txt2 := pg_temp.try_reserve(v_event, v_type, v_stranger, 1);
  INSERT INTO wh_results VALUES ('3', CASE WHEN v_txt = 'ok' AND v_txt2 ILIKE HELD THEN 'PASS' ELSE 'FAIL' END,
    format('an email-only offer exempts the matching account and still holds against others (offeree %s, stranger %s)', v_txt, v_txt2));
  UPDATE event_waitlist SET user_id = v_offeree WHERE id = v_wl;

  -- ---- 4: a lapsed offer releases the seat -------------------------
  UPDATE event_waitlist SET notified_at = now() - interval '25 hours' WHERE id = v_wl;
  v_txt := pg_temp.try_reserve(v_event, v_type, v_stranger, 1);
  INSERT INTO wh_results VALUES ('4', CASE WHEN v_txt = 'ok' THEN 'PASS' ELSE 'FAIL' END,
    format('an offer older than 24h holds nothing (got %s)', v_txt));
  UPDATE event_waitlist SET notified_at = now() WHERE id = v_wl;

  -- ---- 5: a converted offer releases the seat ----------------------
  UPDATE event_waitlist SET converted_at = now() WHERE id = v_wl;
  v_txt := pg_temp.try_reserve(v_event, v_type, v_stranger, 1);
  INSERT INTO wh_results VALUES ('5', CASE WHEN v_txt = 'ok' THEN 'PASS' ELSE 'FAIL' END,
    format('a converted offer holds nothing (got %s)', v_txt));
  UPDATE event_waitlist SET converted_at = NULL WHERE id = v_wl;

  -- ---- 7: one offer holds one seat, not all of them -----------------
  UPDATE events SET capacity = 3 WHERE id = v_event;
  UPDATE event_ticket_types SET capacity = 3 WHERE id = v_type;
  v_txt  := pg_temp.try_reserve(v_event, v_type, v_stranger, 1);
  v_txt2 := pg_temp.try_reserve(v_event, v_type, v_stranger, 2);
  INSERT INTO wh_results VALUES ('7a', CASE WHEN v_txt = 'ok' THEN 'PASS' ELSE 'FAIL' END,
    format('2 free, 1 held: a stranger can still buy 1 (got %s)', v_txt));
  INSERT INTO wh_results VALUES ('7b', CASE WHEN v_txt2 ILIKE HELD THEN 'PASS' ELSE 'FAIL' END,
    format('2 free, 1 held: a stranger cannot buy 2 (got %s)', v_txt2));
  UPDATE events SET capacity = 2 WHERE id = v_event;
  UPDATE event_ticket_types SET capacity = 2 WHERE id = v_type;

  -- ---- 8: a blast (more offers than seats) caps the hold at what is free
  INSERT INTO event_waitlist (event_id, ticket_type_id, email, name, quantity, source, notified_at, notify_count)
  VALUES (v_event, v_type, 'wlhold.guest@example.test', 'Guest', 1, 'public', now(), 1);
  v_txt  := pg_temp.try_reserve(v_event, v_type, v_stranger, 1);
  v_txt2 := pg_temp.try_reserve(v_event, v_type, v_offeree, 1);
  INSERT INTO wh_results VALUES ('8a', CASE WHEN v_txt ILIKE HELD THEN 'PASS' ELSE 'FAIL' END,
    format('2 offers on 1 seat still refuse a stranger (got %s)', v_txt));
  INSERT INTO wh_results VALUES ('8b', CASE WHEN v_txt2 = 'ok' THEN 'PASS' ELSE 'FAIL' END,
    format('2 offers on 1 seat: an offeree is not blocked by the other offer (got %s)', v_txt2));

  -- ---- 12: someone shown "sold out" because of a hold can join the queue
  --     (2 live offers on 1 free seat here, from case 8). Without the join
  --     fix they are refused with "Tickets are still available".
  SELECT lower(email) INTO v_txt2 FROM auth.users WHERE id = v_stranger;
  v_txt := pg_temp.join_as(v_event, v_stranger, v_txt2);
  INSERT INTO wh_results VALUES ('12a', CASE WHEN v_txt LIKE 'position %' THEN 'PASS' ELSE 'FAIL' END,
    format('a signed-in walk-up can join while the only free seat is held (got %s)', v_txt));
  v_txt := pg_temp.join_as(v_event, NULL, 'wlhold.walkup@example.test');
  INSERT INTO wh_results VALUES ('12b', CASE WHEN v_txt LIKE 'position %' THEN 'PASS' ELSE 'FAIL' END,
    format('an anonymous walk-up can join while the only free seat is held (got %s)', v_txt));
  -- control: once no offer is live the seat is genuinely open, so joining is
  -- refused and the honest answer is "buy it".
  UPDATE event_waitlist SET notified_at = now() - interval '25 hours'
  WHERE event_id = v_event AND notified_at IS NOT NULL;
  v_txt := pg_temp.join_as(v_event, NULL, 'wlhold.late@example.test');
  INSERT INTO wh_results VALUES ('12c', CASE WHEN v_txt ILIKE '%still available%' THEN 'PASS' ELSE 'FAIL' END,
    format('control: with no offer live, joining is refused because the seat is open (got %s)', v_txt));

  -- ---- 9: an unbounded event has nothing to hold -------------------
  UPDATE events SET capacity = NULL WHERE id = v_event;
  UPDATE event_ticket_types SET capacity = NULL WHERE id = v_type;
  v_txt := pg_temp.try_reserve(v_event, v_type, v_stranger, 1);
  INSERT INTO wh_results VALUES ('9', CASE WHEN v_txt = 'ok' THEN 'PASS' ELSE 'FAIL' END,
    format('an unbounded event is never held (got %s)', v_txt));
END $$;

SELECT n, verdict, detail FROM wh_results ORDER BY substring(n from '^[0-9]+')::int, n;

ROLLBACK;
