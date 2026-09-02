-- CAP1 capacity-enforcement battery. Scratch event, real profiles, cleaned up after.
-- Replicates the Merri Mornings shape: N registered under NULL capacity, then the
-- capacity is set BELOW N (which is what happened on 2026-09-02 00:34Z).
DELETE FROM notifications WHERE data->>'event_id' = '00000000-0000-4000-8000-0000000cab01';
DELETE FROM events WHERE id IN ('00000000-0000-4000-8000-0000000cab01','00000000-0000-4000-8000-0000000cab02');

INSERT INTO events (id, collective_id, title, activity_type, date_start, capacity, status, is_public, is_ticketed)
SELECT '00000000-0000-4000-8000-0000000cab01', e.collective_id, 'ZZ CAP1 probe (scratch)',
       e.activity_type, now() + interval '30 days', NULL, 'draft', false, false
FROM events e WHERE e.id = '6208301f-b9f0-42ec-a917-8f95fc13383b';

-- ticketed twin, for the exemption control
INSERT INTO events (id, collective_id, title, activity_type, date_start, capacity, status, is_public, is_ticketed)
SELECT '00000000-0000-4000-8000-0000000cab02', e.collective_id, 'ZZ CAP1 probe ticketed (scratch)',
       e.activity_type, now() + interval '30 days', 3, 'draft', false, true
FROM events e WHERE e.id = '6208301f-b9f0-42ec-a917-8f95fc13383b';

CREATE TEMP TABLE cap_users AS
SELECT id, row_number() OVER (ORDER BY id) AS n FROM profiles ORDER BY id LIMIT 10;

-- 5 seats taken while capacity is NULL (nothing to enforce yet)
INSERT INTO event_registrations (event_id, user_id, status)
SELECT '00000000-0000-4000-8000-0000000cab01', id, 'registered' FROM cap_users WHERE n <= 5;
-- one invited row (the accepted-invite door) and one cancelled row (the re-register door)
INSERT INTO event_registrations (event_id, user_id, status, invited_at)
SELECT '00000000-0000-4000-8000-0000000cab01', id, 'invited', now() FROM cap_users WHERE n = 6;
INSERT INTO event_registrations (event_id, user_id, status)
SELECT '00000000-0000-4000-8000-0000000cab01', id, 'cancelled' FROM cap_users WHERE n = 7;

-- NOW cap it below the standing count: 5 registered against capacity 3.
UPDATE events SET capacity = 3 WHERE id = '00000000-0000-4000-8000-0000000cab01';

CREATE TEMP TABLE probe_results(seq int, case_name text, expected text, actual text, pass boolean);

-- A. over-cap INSERT (the path that already worked) -> waitlisted
INSERT INTO event_registrations (event_id, user_id, status)
SELECT '00000000-0000-4000-8000-0000000cab01', id, 'registered' FROM cap_users WHERE n = 8;
INSERT INTO probe_results
SELECT 1, 'A over-cap INSERT', 'waitlisted', r.status::text, r.status = 'waitlisted'
FROM event_registrations r JOIN cap_users u ON u.id = r.user_id AND u.n = 8
WHERE r.event_id = '00000000-0000-4000-8000-0000000cab01';

-- B. THE HEADLINE BUG: invited -> registered UPDATE on a full event -> waitlisted
UPDATE event_registrations SET status = 'registered'
WHERE event_id = '00000000-0000-4000-8000-0000000cab01'
  AND user_id = (SELECT id FROM cap_users WHERE n = 6);
INSERT INTO probe_results
SELECT 2, 'B invited->registered UPDATE (over cap)', 'waitlisted', r.status::text, r.status = 'waitlisted'
FROM event_registrations r JOIN cap_users u ON u.id = r.user_id AND u.n = 6
WHERE r.event_id = '00000000-0000-4000-8000-0000000cab01';

-- C. cancelled -> registered UPDATE (re-register) on a full event -> waitlisted
UPDATE event_registrations SET status = 'registered'
WHERE event_id = '00000000-0000-4000-8000-0000000cab01'
  AND user_id = (SELECT id FROM cap_users WHERE n = 7);
INSERT INTO probe_results
SELECT 3, 'C cancelled->registered UPDATE (over cap)', 'waitlisted', r.status::text, r.status = 'waitlisted'
FROM event_registrations r JOIN cap_users u ON u.id = r.user_id AND u.n = 7
WHERE r.event_id = '00000000-0000-4000-8000-0000000cab01';

-- D. REGRESSION GUARD: an existing over-cap registered row stays registered when
--    some other column is edited. The 149 real Merri members must not be demoted.
UPDATE event_registrations SET registered_at = registered_at
WHERE event_id = '00000000-0000-4000-8000-0000000cab01'
  AND user_id = (SELECT id FROM cap_users WHERE n = 5);
INSERT INTO probe_results
SELECT 4, 'D benign UPDATE of over-cap registered row', 'registered', r.status::text, r.status = 'registered'
FROM event_registrations r JOIN cap_users u ON u.id = r.user_id AND u.n = 5
WHERE r.event_id = '00000000-0000-4000-8000-0000000cab01';

-- E. authed-role RSVP RPC on a full event -> waitlisted, and the payload says so.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM cap_users WHERE n = 9), 'role', 'authenticated')::text, true);
INSERT INTO probe_results
SELECT 5, 'E handle_announcement_rsvp going (over cap) payload',
       'waitlisted',
       (public.handle_announcement_rsvp('00000000-0000-4000-8000-0000000cab01','going')->>'action'),
       (public.handle_announcement_rsvp('00000000-0000-4000-8000-0000000cab01','going')->>'action') = 'waitlisted';
INSERT INTO probe_results
SELECT 6, 'E2 that RSVP row on disk', 'waitlisted', r.status::text, r.status = 'waitlisted'
FROM event_registrations r JOIN cap_users u ON u.id = r.user_id AND u.n = 9
WHERE r.event_id = '00000000-0000-4000-8000-0000000cab01';
SELECT set_config('request.jwt.claims', NULL, true);

-- F. NEGATIVE CONTROL: raise capacity above the count, the same UPDATE must succeed.
UPDATE events SET capacity = 50 WHERE id = '00000000-0000-4000-8000-0000000cab01';
UPDATE event_registrations SET status = 'registered'
WHERE event_id = '00000000-0000-4000-8000-0000000cab01'
  AND user_id = (SELECT id FROM cap_users WHERE n = 6);
INSERT INTO probe_results
SELECT 7, 'F under-cap invited->registered (negative control)', 'registered', r.status::text, r.status = 'registered'
FROM event_registrations r JOIN cap_users u ON u.id = r.user_id AND u.n = 6
WHERE r.event_id = '00000000-0000-4000-8000-0000000cab01';

-- G. NEGATIVE CONTROL: NULL capacity means uncapped.
UPDATE events SET capacity = NULL WHERE id = '00000000-0000-4000-8000-0000000cab01';
INSERT INTO event_registrations (event_id, user_id, status)
SELECT '00000000-0000-4000-8000-0000000cab01', id, 'registered' FROM cap_users WHERE n = 10;
INSERT INTO probe_results
SELECT 8, 'G NULL capacity is uncapped (negative control)', 'registered', r.status::text, r.status = 'registered'
FROM event_registrations r JOIN cap_users u ON u.id = r.user_id AND u.n = 10
WHERE r.event_id = '00000000-0000-4000-8000-0000000cab01';

-- H. NEGATIVE CONTROL: a ticketed event is exempt (the ticket gate owns capacity).
--    Its own trigger refuses a ticketless registration, which is the correct refusal,
--    so assert on THAT rather than on a waitlist demotion.
INSERT INTO probe_results
SELECT 9, 'H ticketed event still refused by the ticket gate', 'refused',
  CASE WHEN (SELECT count(*) FROM event_registrations
             WHERE event_id='00000000-0000-4000-8000-0000000cab02') = 0
       THEN 'refused' ELSE 'wrote a row' END,
  (SELECT count(*) FROM event_registrations WHERE event_id='00000000-0000-4000-8000-0000000cab02') = 0;

-- I. waitlist promotion on cancel: at exactly capacity a seat frees and promotes.
UPDATE events SET capacity = 5 WHERE id = '00000000-0000-4000-8000-0000000cab01';
UPDATE event_registrations SET status = 'waitlisted'
WHERE event_id='00000000-0000-4000-8000-0000000cab01'
  AND user_id IN (SELECT id FROM cap_users WHERE n IN (6,7,8,9,10));
UPDATE event_registrations SET status = 'cancelled'
WHERE event_id='00000000-0000-4000-8000-0000000cab01'
  AND user_id = (SELECT id FROM cap_users WHERE n = 1);
INSERT INTO probe_results
SELECT 10, 'I cancel at cap promotes one waitlisted', '1 promoted',
  (SELECT count(*)::text || ' promoted' FROM event_registrations
    WHERE event_id='00000000-0000-4000-8000-0000000cab01' AND status='registered'
      AND user_id IN (SELECT id FROM cap_users WHERE n IN (6,7,8,9,10))),
  (SELECT count(*) FROM event_registrations
    WHERE event_id='00000000-0000-4000-8000-0000000cab01' AND status='registered'
      AND user_id IN (SELECT id FROM cap_users WHERE n IN (6,7,8,9,10))) = 1;

-- J. cancel while STILL over cap must NOT promote and must NOT notify.
UPDATE events SET capacity = 1 WHERE id = '00000000-0000-4000-8000-0000000cab01';
DELETE FROM notifications WHERE data->>'event_id' = '00000000-0000-4000-8000-0000000cab01';
UPDATE event_registrations SET status = 'cancelled'
WHERE event_id='00000000-0000-4000-8000-0000000cab01'
  AND user_id = (SELECT id FROM cap_users WHERE n = 2);
INSERT INTO probe_results
SELECT 11, 'J over-cap cancel sends no false "You are in" notification', '0 notifications',
  (SELECT count(*)::text || ' notifications' FROM notifications
    WHERE data->>'event_id' = '00000000-0000-4000-8000-0000000cab01' AND type='waitlist_promoted'),
  (SELECT count(*) FROM notifications
    WHERE data->>'event_id' = '00000000-0000-4000-8000-0000000cab01' AND type='waitlist_promoted') = 0;

SELECT seq, case_name, expected, actual, pass FROM probe_results ORDER BY seq;
