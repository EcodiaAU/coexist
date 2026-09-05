-- Battery for the ticketed-event waitlist (migration 20260905120000).
-- Runs entirely inside a transaction against a fixture event and ROLLS BACK,
-- so it is safe on the live database. Prints one PASS/FAIL line per case.
--
-- Negative controls are included on purpose: cases 3, 4, 5 and 11 must FAIL to
-- join, and a battery where everything passes trivially proves nothing.
BEGIN;

SET LOCAL client_min_messages TO WARNING;

CREATE TEMP TABLE wl_results(n int, verdict text, detail text) ON COMMIT DROP;

DO $$
DECLARE
  v_coll     uuid;
  v_event    uuid;
  v_free_ev  uuid;
  v_type     uuid;
  v_buyer    uuid;
  v_res      jsonb;
  v_free     integer;
  v_n        integer;
  v_pass     boolean;
  v_txt      text;
  v_ids      uuid[];

BEGIN
  -- ---- fixture ----------------------------------------------------
  SELECT id INTO v_coll FROM collectives ORDER BY created_at LIMIT 1;
  SELECT id INTO v_buyer FROM profiles ORDER BY created_at LIMIT 1;

  INSERT INTO events (title, description, collective_id, date_start, date_end,
                      capacity, is_ticketed, is_public, status, created_by, activity_type)
  VALUES ('WLTEST sold out fixture', 'battery', v_coll,
          now() + interval '30 days', now() + interval '31 days',
          2, true, true, 'published', v_buyer, 'camp_out')
  RETURNING id INTO v_event;

  INSERT INTO event_ticket_types (event_id, name, price_cents, capacity, is_active, sort_order)
  VALUES (v_event, 'WLTEST General', 5000, 2, true, 0)
  RETURNING id INTO v_type;

  INSERT INTO events (title, description, collective_id, date_start, date_end,
                      capacity, is_ticketed, is_public, status, created_by, activity_type)
  VALUES ('WLTEST free fixture', 'battery', v_coll,
          now() + interval '30 days', now() + interval '31 days',
          2, false, true, 'published', v_buyer, 'camp_out')
  RETURNING id INTO v_free_ev;

  -- ---- 1: an event with seats is NOT sold out ---------------------
  v_free := public.event_free_seats(v_event);
  INSERT INTO wl_results VALUES (1, CASE WHEN v_free = 2 THEN 'PASS' ELSE 'FAIL' END, format('open event reports free seats (got %s)', v_free));

  -- ---- 2: NEGATIVE CONTROL - cannot join a waitlist with seats free
  BEGIN
    v_res := public.join_event_waitlist(v_event, 'early@example.test', 'Early', 1, v_type, 'public');
    INSERT INTO wl_results VALUES (2, 'FAIL', 'joined an event that still had seats');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO wl_results VALUES (2, CASE WHEN SQLERRM LIKE '%still available%' THEN 'PASS' ELSE 'FAIL' END, format('refused join while seats remain (%s)', SQLERRM));
  END;

  -- ---- fill it -----------------------------------------------------
  INSERT INTO event_tickets (event_id, ticket_type_id, user_id, status, price_cents, quantity, ticket_code)
  VALUES (v_event, v_type, v_buyer, 'confirmed', 5000, 2, 'WLTEST01');

  -- ---- 3: now it is sold out ---------------------------------------
  v_free := public.event_free_seats(v_event);
  INSERT INTO wl_results VALUES (3, CASE WHEN v_free = 0 THEN 'PASS' ELSE 'FAIL' END, format('full event reports 0 free (got %s)', v_free));

  -- ---- 4: a guest can join -----------------------------------------
  v_res := public.join_event_waitlist(v_event, 'Guest.One@Example.Test', 'Guest One', 2, v_type, 'public');
  INSERT INTO wl_results VALUES (4, CASE WHEN (v_res->>'position')::int = 1 AND (v_res->>'already_waiting')::boolean = false
         THEN 'PASS' ELSE 'FAIL' END, format('guest joined at position 1 (got %s)', v_res));

  -- ---- 5: idempotent, case-insensitive, keeps the place ------------
  v_res := public.join_event_waitlist(v_event, 'guest.one@example.test', 'Guest One Fixed', 1, v_type, 'public');
  SELECT COUNT(*) INTO v_n FROM event_waitlist WHERE event_id = v_event AND removed_at IS NULL;
  INSERT INTO wl_results VALUES (5, CASE WHEN v_n = 1 AND (v_res->>'position')::int = 1 AND (v_res->>'already_waiting')::boolean
         THEN 'PASS' ELSE 'FAIL' END, format('rejoin is idempotent, 1 row, still position 1 (rows=%s, pos=%s, already=%s)', v_n, v_res->>'position', v_res->>'already_waiting'));

  -- ---- 6: FIFO ordering --------------------------------------------
  v_res := public.join_event_waitlist(v_event, 'guest.two@example.test', 'Guest Two', 1, v_type, 'public');
  INSERT INTO wl_results VALUES (6, CASE WHEN (v_res->>'position')::int = 2 THEN 'PASS' ELSE 'FAIL' END, format('second joiner is position 2 (got %s)', v_res->>'position'));

  -- ---- 7: NEGATIVE CONTROL - a ticket holder cannot join -----------
  BEGIN
    v_res := public.join_event_waitlist(
      v_event,
      (SELECT email FROM auth.users WHERE id = v_buyer),
      'Holder', 1, v_type, 'app');
    INSERT INTO wl_results VALUES (7, 'FAIL', 'ticket holder was allowed onto the waitlist');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO wl_results VALUES (7, CASE WHEN SQLERRM LIKE '%already have a ticket%' THEN 'PASS' ELSE 'FAIL' END, format('refused a live ticket holder (%s)', SQLERRM));
  END;

  -- ---- 8: NEGATIVE CONTROL - free events are refused ---------------
  BEGIN
    v_res := public.join_event_waitlist(v_free_ev, 'nope@example.test', 'Nope', 1, NULL, 'app');
    INSERT INTO wl_results VALUES (8, 'FAIL', 'joined the waitlist on a non-ticketed event');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO wl_results VALUES (8, CASE WHEN SQLERRM LIKE '%not ticketed%' THEN 'PASS' ELSE 'FAIL' END, format('refused a non-ticketed event (%s)', SQLERRM));
  END;

  -- ---- 9: NEGATIVE CONTROL - a malformed email is refused ----------
  BEGIN
    v_res := public.join_event_waitlist(v_event, 'not-an-email', 'Bad', 1, v_type, 'public');
    INSERT INTO wl_results VALUES (9, 'FAIL', 'accepted a malformed email');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO wl_results VALUES (9, CASE WHEN SQLERRM LIKE '%valid email%' THEN 'PASS' ELSE 'FAIL' END, format('refused a malformed email (%s)', SQLERRM));
  END;

  -- ---- 10: nothing to drain while the event is still full ----------
  SELECT COUNT(*) INTO v_n FROM public.waitlist_drain_candidates(v_event, false);
  INSERT INTO wl_results VALUES (10, CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, format('no drain candidates while full (got %s)', v_n));

  -- ---- 11: one seat frees, exactly ONE person is offered it --------
  UPDATE event_tickets SET quantity = 1, status = 'confirmed'
  WHERE event_id = v_event AND ticket_code = 'WLTEST01';

  v_free := public.event_free_seats(v_event);
  SELECT COUNT(*) INTO v_n FROM public.waitlist_drain_candidates(v_event, false);
  INSERT INTO wl_results VALUES (11, CASE WHEN v_free = 1 AND v_n = 1 THEN 'PASS' ELSE 'FAIL' END, format('one free seat offers exactly one person (free=%s, offered=%s)', v_free, v_n));

  -- ---- 12: it is the OLDEST person, not any person -----------------
  SELECT email INTO v_txt FROM public.waitlist_drain_candidates(v_event, false) LIMIT 1;
  INSERT INTO wl_results VALUES (12, CASE WHEN v_txt = 'guest.one@example.test' THEN 'PASS' ELSE 'FAIL' END, format('the offer goes to the oldest entry (got %s)', v_txt));

  -- ---- 13: marking notified stops the repeat offer -----------------
  SELECT array_agg(waitlist_id) INTO v_ids FROM public.waitlist_drain_candidates(v_event, false);
  PERFORM public.mark_waitlist_notified(v_ids);
  SELECT COUNT(*) INTO v_n FROM public.waitlist_drain_candidates(v_event, false);
  INSERT INTO wl_results VALUES (13, CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, format('an outstanding offer holds the seat, nobody else is offered (got %s)', v_n));

  -- ---- 13b: once the offer lapses, the seat passes to the next person
  UPDATE event_waitlist SET notified_at = now() - interval '25 hours'
  WHERE event_id = v_event AND lower(email) = 'guest.one@example.test';
  SELECT COUNT(*) INTO v_n FROM public.waitlist_drain_candidates(v_event, false);
  SELECT email INTO v_txt FROM public.waitlist_drain_candidates(v_event, false) LIMIT 1;
  INSERT INTO wl_results VALUES (131,
    CASE WHEN v_n = 1 AND v_txt = 'guest.two@example.test' THEN 'PASS' ELSE 'FAIL' END,
    format('a lapsed offer passes to the next person (offered=%s, to=%s)', v_n, v_txt));
  UPDATE event_waitlist SET notified_at = now()
  WHERE event_id = v_event AND lower(email) = 'guest.one@example.test';

  -- ---- 14: p_force reaches everyone still waiting ------------------
  -- Force must reach the ALREADY-NOTIFIED too. Both guests are still waiting
  -- here: guest.one was offered a spot and has not bought, guest.two never got
  -- a turn. An organiser pressing "Email everyone waiting" means everyone.
  SELECT COUNT(*) INTO v_n FROM public.waitlist_drain_candidates(v_event, true);
  INSERT INTO wl_results VALUES (14,
    CASE WHEN v_n = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('force reaches everyone waiting, previously-offered included (got %s, expected 2)', v_n));

  -- 14b: a lapsed offer does not put that person back at the FRONT. guest.one
  -- had their turn; guest.two has not had one, so guest.two goes first even
  -- though guest.one joined earlier.
  UPDATE event_waitlist SET notified_at = now() - interval '25 hours'
  WHERE event_id = v_event AND lower(email) = 'guest.one@example.test';
  SELECT email INTO v_txt FROM public.waitlist_drain_candidates(v_event, false)
  ORDER BY queue_position LIMIT 1;
  INSERT INTO wl_results VALUES (141,
    CASE WHEN v_txt = 'guest.two@example.test' THEN 'PASS' ELSE 'FAIL' END,
    format('a lapsed offer goes behind someone who never had a turn (first offer to %s)', v_txt));
  UPDATE event_waitlist SET notified_at = now()
  WHERE event_id = v_event AND lower(email) = 'guest.one@example.test';

  -- ---- 15: buying retires the entry --------------------------------
  INSERT INTO event_tickets (event_id, ticket_type_id, user_id, status, price_cents, quantity, ticket_code)
  SELECT v_event, v_type, u.id, 'confirmed', 5000, 1, 'WLTEST02'
  FROM auth.users u WHERE u.id = v_buyer;
  UPDATE event_waitlist SET user_id = v_buyer
  WHERE event_id = v_event AND lower(email) = 'guest.one@example.test';

  PERFORM public.waitlist_drain_candidates(v_event, false);
  SELECT COUNT(*) INTO v_n FROM event_waitlist
  WHERE event_id = v_event AND lower(email) = 'guest.one@example.test' AND converted_at IS NOT NULL;
  INSERT INTO wl_results VALUES (15, CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, format('a buyer is stamped converted (got %s)', v_n));

  -- ---- 16: leaving works, and the queue closes up ------------------
  v_pass := public.leave_event_waitlist(v_event, 'guest.two@example.test');
  SELECT COUNT(*) INTO v_n FROM event_waitlist
  WHERE event_id = v_event AND removed_at IS NULL AND converted_at IS NULL;
  INSERT INTO wl_results VALUES (16, CASE WHEN v_pass AND v_n = 0 THEN 'PASS' ELSE 'FAIL' END, format('leave removes the entry (returned %s, remaining %s)', v_pass, v_n));

  -- ---- 17: the manual Eventbrite sold-out flag is hard zero --------
  UPDATE events SET event_extras = jsonb_set(COALESCE(event_extras, '{}'::jsonb), '{sold_out}', 'true')
  WHERE id = v_event;
  v_free := public.event_free_seats(v_event);
  INSERT INTO wl_results VALUES (17, CASE WHEN v_free = 0 THEN 'PASS' ELSE 'FAIL' END, format('manual sold_out flag forces 0 free (got %s)', v_free));

  -- ---- 18: a past event's queue is retired -------------------------
  UPDATE events SET event_extras = COALESCE(event_extras, '{}'::jsonb) - 'sold_out' WHERE id = v_event;
  v_res := public.join_event_waitlist(v_event, 'late@example.test', 'Late', 1, v_type, 'public');
  UPDATE events SET date_start = now() - interval '2 days', date_end = now() - interval '1 day'
  WHERE id = v_event;
  PERFORM public.waitlist_drain_candidates(NULL, false);
  SELECT COUNT(*) INTO v_n FROM event_waitlist
  WHERE event_id = v_event AND lower(email) = 'late@example.test' AND removed_at IS NOT NULL;
  INSERT INTO wl_results VALUES (18, CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, format('a finished event retires its queue (got %s)', v_n));
END $$;

SELECT n, verdict, detail FROM wl_results ORDER BY n;

ROLLBACK;
