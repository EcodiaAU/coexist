#!/usr/bin/env node
/*
 * Rollback-only DB matrix for the per-event group chat toggle
 * (supabase/migrations/20260924120000_event_group_chat_toggle.sql).
 *
 * Prints ONE DO block. It applies the migration with EXECUTE, builds throwaway
 * events and registrations against real profiles, asserts every case, then
 * RAISEs, so the migration and every write roll back. Nothing persists either
 * way: the block always ends in an exception.
 *
 *   node scripts/event-group-chat-matrix.mjs            > /tmp/matrix.sql   # expect: MATRIX PASS: 28 assertions
 *   node scripts/event-group-chat-matrix.mjs --control  > /tmp/control.sql  # expect: MATRIX FAIL C1 ...
 *
 * --control is the mutation control: it adds ONLY the column, with the old
 * functions left in place, and must fail at C1. A matrix that passes without
 * the migration is measuring nothing.
 *
 * Run the output as a single statement through the Management API (the
 * db_execute capability on tjutlbzekfouwsiaplbr). Brisbane collective is the
 * host because it is the real first use (North Stradbroke Island Trip).
 *
 * Pre-flighted 2026-09-24 on a local Postgres 16 mirror of the live function
 * bodies: matrix PASS 28; --control FAIL C1; restoring the OLD
 * reconcile_ticket_membership after the migration FAILS C13e and restoring the
 * OLD national demote FAILS C14c, so both rewrites are individually pinned.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  resolve(here, '../supabase/migrations/20260924120000_event_group_chat_toggle.sql'),
  'utf8',
)
if (migration.includes('$mig$')) throw new Error('migration text contains the $mig$ tag')

const control = process.argv.includes('--control')
const apply = control
  ? 'ALTER TABLE public.events ADD COLUMN IF NOT EXISTS group_chat_enabled boolean NOT NULL DEFAULT false;'
  : `EXECUTE $mig$${migration}$mig$;`

const sql = String.raw`DO $matrix$
DECLARE
  c_coll   uuid := '067ff792-8406-4ed9-8192-0a5b4fb04f70'; -- Brisbane
  c_host   uuid := 'dc7e0b5d-b2f2-443f-b57c-354a93ea0b9b'; -- Hannah, leader, not national
  c_gone1  uuid := '596fa356-7525-4748-a6f6-661c9a663039'; -- inactive assist_leader
  c_gone2  uuid := '36743da3-e8d8-4117-a0b5-f74a9c6917e8'; -- inactive assist_leader
  u        uuid[];
  v_nat    uuid[];
  v_lead   uuid[];
  e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid; e6 uuid;
  ch uuid; ch1 uuid; ch2 uuid; ch6 uuid; tt uuid;
  v_n int;
  v_s text;
  passed int := 0;
BEGIN
  ${apply}

  CREATE FUNCTION pg_temp.m_diff(p_channel uuid, p_expected uuid[]) RETURNS int
  LANGUAGE sql AS $f$
    SELECT count(*)::int FROM (
      (SELECT user_id FROM public.chat_channel_members WHERE channel_id = p_channel
       EXCEPT SELECT unnest(p_expected))
      UNION ALL
      (SELECT unnest(p_expected)
       EXCEPT SELECT user_id FROM public.chat_channel_members WHERE channel_id = p_channel)
    ) d
  $f$;
  CREATE FUNCTION pg_temp.m_in(p_channel uuid, p_user uuid) RETURNS boolean
  LANGUAGE sql AS $f$
    SELECT EXISTS (SELECT 1 FROM public.chat_channel_members
                   WHERE channel_id = p_channel AND user_id = p_user)
  $f$;

  -- Six ordinary people: not national, not in Brisbane's leadership at all.
  SELECT array_agg(id) INTO u FROM (
    SELECT p.id FROM public.profiles p
    WHERE NOT public._is_national_role(p.role::text)
      AND NOT EXISTS (SELECT 1 FROM public.collective_members cm
                      WHERE cm.user_id = p.id AND cm.collective_id = c_coll)
    ORDER BY p.created_at LIMIT 6) s;
  IF coalesce(array_length(u, 1), 0) < 6 THEN
    RAISE EXCEPTION 'MATRIX SETUP: fewer than 6 ordinary profiles';
  END IF;
  SELECT array_agg(id) INTO v_nat FROM public.profiles WHERE public._is_national_role(role::text);
  SELECT array_agg(user_id) INTO v_lead FROM public.collective_members
   WHERE collective_id = c_coll AND status = 'active'
     AND role IN ('leader', 'co_leader', 'assist_leader');

  -- C1 toggled + published: chat exists at once (leaders + nationals, no registrants yet)
  INSERT INTO public.events (collective_id, title, activity_type, date_start, date_end,
                             status, group_chat_enabled, is_ticketed, created_by)
  VALUES (c_coll, 'MATRIX toggled clean-up', 'clean_up', now() + interval '10 days',
          now() + interval '10 days 4 hours', 'published', true, false, c_host)
  RETURNING id INTO e1;
  SELECT id INTO ch FROM public.chat_channels WHERE event_id = e1 AND type = 'campout';
  IF ch IS NULL THEN RAISE EXCEPTION 'MATRIX FAIL C1: toggled published event has no chat'; END IF;
  ch1 := ch;
  passed := passed + 1;
  IF pg_temp.m_diff(ch, v_nat || v_lead) <> 0 THEN
    RAISE EXCEPTION 'MATRIX FAIL C1b: fresh chat is not exactly nationals + active leaders (diff %)',
      pg_temp.m_diff(ch, v_nat || v_lead);
  END IF;
  passed := passed + 1;

  -- C2 registrations: registered/attended land, waitlisted/invited do not
  INSERT INTO public.event_registrations (event_id, user_id, status) VALUES
    (e1, u[1], 'registered'), (e1, u[2], 'registered'), (e1, u[3], 'attended'),
    (e1, u[4], 'waitlisted'), (e1, u[5], 'invited');
  IF pg_temp.m_diff(ch, v_nat || v_lead || ARRAY[u[1], u[2], u[3]]) <> 0 THEN
    RAISE EXCEPTION 'MATRIX FAIL C2: chat is not exactly going + leaders + nationals (diff %)',
      pg_temp.m_diff(ch, v_nat || v_lead || ARRAY[u[1], u[2], u[3]]);
  END IF;
  passed := passed + 1;
  IF pg_temp.m_in(ch, u[4]) OR pg_temp.m_in(ch, u[5]) THEN
    RAISE EXCEPTION 'MATRIX FAIL C2b: a waitlisted or invited person is in the chat';
  END IF;
  passed := passed + 1;
  IF NOT pg_temp.m_in(ch, c_host) THEN
    RAISE EXCEPTION 'MATRIX FAIL C2c: the host leader (unregistered) is locked out';
  END IF;
  passed := passed + 1;
  IF (pg_temp.m_in(ch, c_gone1) AND NOT c_gone1 = ANY(v_nat))
     OR (pg_temp.m_in(ch, c_gone2) AND NOT c_gone2 = ANY(v_nat)) THEN
    RAISE EXCEPTION 'MATRIX FAIL C2d: an inactive assist_leader landed in the chat';
  END IF;
  passed := passed + 1;

  -- C3 cancel removes; the waitlist promotion it triggers adds the promoted person
  UPDATE public.event_registrations SET status = 'cancelled' WHERE event_id = e1 AND user_id = u[1];
  IF pg_temp.m_in(ch, u[1]) THEN RAISE EXCEPTION 'MATRIX FAIL C3: a cancelled registrant is still in the chat'; END IF;
  passed := passed + 1;
  -- capacity is NULL and the event is open, so handle_registration_cancel
  -- MUST promote the earliest waitlisted person (u4) and the chat must follow.
  SELECT status::text INTO v_s FROM public.event_registrations WHERE event_id = e1 AND user_id = u[4];
  IF v_s IS DISTINCT FROM 'registered' THEN
    RAISE EXCEPTION 'MATRIX FAIL C3b: waitlist promotion did not land (status %)', v_s;
  END IF;
  IF NOT pg_temp.m_in(ch, u[4]) THEN
    RAISE EXCEPTION 'MATRIX FAIL C3c: the person promoted off the waitlist was not added';
  END IF;
  passed := passed + 1;
  passed := passed + 1;

  -- C4 a host leader who registers and then cancels stays in
  INSERT INTO public.event_registrations (event_id, user_id, status) VALUES (e1, c_host, 'registered');
  UPDATE public.event_registrations SET status = 'cancelled' WHERE event_id = e1 AND user_id = c_host;
  IF NOT pg_temp.m_in(ch, c_host) THEN RAISE EXCEPTION 'MATRIX FAIL C4: cancelling dropped the host leader'; END IF;
  passed := passed + 1;

  -- C5 deleting a registration removes the person
  DELETE FROM public.event_registrations WHERE event_id = e1 AND user_id = u[2];
  IF pg_temp.m_in(ch, u[2]) THEN RAISE EXCEPTION 'MATRIX FAIL C5: a deleted registration left its person in the chat'; END IF;
  passed := passed + 1;

  -- C6 toggle OFF (never switched on): no chat, and registering creates none
  INSERT INTO public.events (collective_id, title, activity_type, date_start, status,
                             group_chat_enabled, is_ticketed, created_by)
  VALUES (c_coll, 'MATRIX untoggled clean-up', 'clean_up', now() + interval '11 days',
          'published', false, false, c_host)
  RETURNING id INTO e3;
  INSERT INTO public.event_registrations (event_id, user_id, status) VALUES (e3, u[1], 'registered');
  SELECT count(*) INTO v_n FROM public.chat_channels WHERE event_id = e3;
  IF v_n <> 0 THEN RAISE EXCEPTION 'MATRIX FAIL C6: an untoggled event got a chat'; END IF;
  passed := passed + 1;

  -- C7 a camp-out still gets its chat, still ticket-driven (a ticketless
  --    registrant is NOT added and neither is the host leader)
  INSERT INTO public.events (collective_id, title, activity_type, date_start, status,
                             group_chat_enabled, is_ticketed, created_by)
  VALUES (c_coll, 'MATRIX campout', 'camp_out', now() + interval '12 days',
          'published', false, false, c_host)
  RETURNING id INTO e4;
  SELECT id INTO ch2 FROM public.chat_channels WHERE event_id = e4 AND type = 'campout';
  IF ch2 IS NULL THEN RAISE EXCEPTION 'MATRIX FAIL C7: a camp-out lost its chat'; END IF;
  passed := passed + 1;
  INSERT INTO public.event_registrations (event_id, user_id, status) VALUES (e4, u[6], 'registered');
  IF pg_temp.m_in(ch2, u[6]) OR (pg_temp.m_in(ch2, c_host) AND NOT c_host = ANY(v_nat)) THEN
    RAISE EXCEPTION 'MATRIX FAIL C7b: the camp-out chat took a ticketless registrant or a non-national leader';
  END IF;
  passed := passed + 1;
  IF pg_temp.m_diff(ch2, v_nat) <> 0 THEN
    RAISE EXCEPTION 'MATRIX FAIL C7c: camp-out chat is not exactly the nationals (no tickets exist)';
  END IF;
  passed := passed + 1;

  -- C8 a draft seeds nobody; publishing seeds everyone going
  INSERT INTO public.events (collective_id, title, activity_type, date_start, status,
                             group_chat_enabled, is_ticketed, created_by)
  VALUES (c_coll, 'MATRIX draft', 'clean_up', now() + interval '13 days',
          'draft', true, false, c_host)
  RETURNING id INTO e2;
  INSERT INTO public.event_registrations (event_id, user_id, status) VALUES
    (e2, u[1], 'registered'), (e2, u[2], 'waitlisted');
  SELECT count(*) INTO v_n FROM public.chat_channels WHERE event_id = e2;
  IF v_n <> 0 THEN RAISE EXCEPTION 'MATRIX FAIL C8: a draft got a chat'; END IF;
  passed := passed + 1;
  UPDATE public.events SET status = 'published' WHERE id = e2;
  SELECT id INTO ch FROM public.chat_channels WHERE event_id = e2 AND type = 'campout';
  IF ch IS NULL OR pg_temp.m_diff(ch, v_nat || v_lead || ARRAY[u[1]]) <> 0 THEN
    RAISE EXCEPTION 'MATRIX FAIL C8b: publishing did not seed exactly going + leaders + nationals';
  END IF;
  passed := passed + 1;

  -- C9 OFF on an EMPTY chat removes it; ON brings it back
  UPDATE public.events SET group_chat_enabled = false WHERE id = e2;
  SELECT count(*) INTO v_n FROM public.chat_channels WHERE event_id = e2;
  IF v_n <> 0 THEN RAISE EXCEPTION 'MATRIX FAIL C9: switching off an empty chat left it behind'; END IF;
  passed := passed + 1;
  UPDATE public.events SET group_chat_enabled = true WHERE id = e2;
  SELECT id INTO ch FROM public.chat_channels WHERE event_id = e2 AND type = 'campout' AND lifecycle_status = 'open';
  IF ch IS NULL THEN RAISE EXCEPTION 'MATRIX FAIL C9b: switching back on did not recreate the chat'; END IF;
  passed := passed + 1;

  -- C10 OFF on a chat WITH history archives it, never deletes; ON revives the same chat
  INSERT INTO public.chat_messages (channel_id, user_id, content) VALUES (ch, c_host, 'matrix hello');
  UPDATE public.events SET group_chat_enabled = false WHERE id = e2;
  SELECT lifecycle_status INTO v_s FROM public.chat_channels WHERE id = ch;
  IF v_s IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'MATRIX FAIL C10: a chat with messages was % instead of archived', coalesce(v_s, 'DELETED');
  END IF;
  passed := passed + 1;
  INSERT INTO public.event_registrations (event_id, user_id, status) VALUES (e2, u[3], 'registered');
  IF pg_temp.m_in(ch, u[3]) THEN RAISE EXCEPTION 'MATRIX FAIL C10b: an archived chat kept syncing registrations'; END IF;
  passed := passed + 1;
  UPDATE public.events SET group_chat_enabled = true WHERE id = e2;
  SELECT lifecycle_status INTO v_s FROM public.chat_channels WHERE id = ch;
  SELECT count(*) INTO v_n FROM public.chat_messages WHERE channel_id = ch;
  IF v_s IS DISTINCT FROM 'open' OR v_n <> 1 OR NOT pg_temp.m_in(ch, u[3]) THEN
    RAISE EXCEPTION 'MATRIX FAIL C10c: revive lost the chat, its history or the new registrant (status %, msgs %)', v_s, v_n;
  END IF;
  passed := passed + 1;

  -- C11 a toggled event more than a week past gets no chat
  INSERT INTO public.events (collective_id, title, activity_type, date_start, status,
                             group_chat_enabled, is_ticketed, created_by)
  VALUES (c_coll, 'MATRIX past', 'clean_up', now() - interval '20 days',
          'published', true, false, c_host)
  RETURNING id INTO e5;
  SELECT count(*) INTO v_n FROM public.chat_channels WHERE event_id = e5;
  IF v_n <> 0 THEN RAISE EXCEPTION 'MATRIX FAIL C11: a long-past event got a chat'; END IF;
  passed := passed + 1;

  -- C13 ticket path on a toggled TICKETED event: a ticket adds, a refund removes
  --     an ordinary holder but never the host leader
  INSERT INTO public.events (collective_id, title, activity_type, date_start, status,
                             group_chat_enabled, is_ticketed, created_by)
  VALUES (c_coll, 'MATRIX ticketed toggled', 'clean_up', now() + interval '14 days',
          'published', true, true, c_host)
  RETURNING id INTO e6;
  SELECT id INTO ch6 FROM public.chat_channels WHERE event_id = e6 AND type = 'campout';
  IF ch6 IS NULL THEN RAISE EXCEPTION 'MATRIX FAIL C13: toggled ticketed event has no chat'; END IF;
  INSERT INTO public.event_ticket_types (event_id, name, price_cents) VALUES (e6, 'MATRIX GA', 0) RETURNING id INTO tt;
  INSERT INTO public.event_tickets (event_id, ticket_type_id, user_id, status, price_cents) VALUES
    (e6, tt, u[1], 'confirmed', 0), (e6, tt, c_host, 'confirmed', 0);
  IF NOT pg_temp.m_in(ch6, u[1]) THEN RAISE EXCEPTION 'MATRIX FAIL C13b: a confirmed ticket did not add its holder'; END IF;
  passed := passed + 1;
  UPDATE public.event_tickets SET status = 'refunded' WHERE event_id = e6 AND user_id IN (u[1], c_host);
  IF pg_temp.m_in(ch6, u[1]) THEN RAISE EXCEPTION 'MATRIX FAIL C13c: a refunded ordinary holder stayed in the chat'; END IF;
  IF NOT pg_temp.m_in(ch6, c_host) THEN RAISE EXCEPTION 'MATRIX FAIL C13d: a refund dropped the host leader'; END IF;
  passed := passed + 1;

  -- C13e a national who refunds a camp-out ticket stays in that camp-out chat
  --      (the old reconcile dropped them until the next event edit re-seeded)
  INSERT INTO public.event_ticket_types (event_id, name, price_cents) VALUES (e4, 'MATRIX GA', 0) RETURNING id INTO tt;
  INSERT INTO public.event_tickets (event_id, ticket_type_id, user_id, status, price_cents) VALUES (e4, tt, v_nat[1], 'confirmed', 0);
  UPDATE public.event_tickets SET status = 'refunded' WHERE event_id = e4 AND user_id = v_nat[1];
  IF NOT pg_temp.m_in(ch2, v_nat[1]) THEN RAISE EXCEPTION 'MATRIX FAIL C13e: a ticket refund dropped a national from a camp-out chat'; END IF;
  passed := passed + 1;

  -- C14 a demoted national leaves a camp-out chat they hold no ticket for, but
  --     stays in a toggled chat they are going to
  UPDATE public.profiles SET role = 'manager' WHERE id = u[6];
  IF NOT pg_temp.m_in(ch2, u[6]) OR NOT pg_temp.m_in(ch1, u[6]) THEN
    RAISE EXCEPTION 'MATRIX FAIL C14: a new national was not seeded into every event chat';
  END IF;
  INSERT INTO public.event_registrations (event_id, user_id, status) VALUES (e1, u[6], 'registered');
  UPDATE public.profiles SET role = 'participant' WHERE id = u[6];
  IF pg_temp.m_in(ch2, u[6]) THEN RAISE EXCEPTION 'MATRIX FAIL C14b: a demoted national stayed in a camp-out chat with no ticket'; END IF;
  IF NOT pg_temp.m_in(ch1, u[6]) THEN RAISE EXCEPTION 'MATRIX FAIL C14c: demotion dropped a going registrant from a toggled chat'; END IF;
  passed := passed + 1;

  -- C12 no client role can call the helpers directly
  IF has_function_privilege('authenticated', 'public._event_chat_wants_member(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sync_event_group_chat_member(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MATRIX FAIL C12: a client role can execute a membership helper';
  END IF;
  passed := passed + 1;

  RAISE EXCEPTION 'MATRIX PASS: % assertions (rolled back)', passed;
END
$matrix$;`

process.stdout.write(sql + '\n')
