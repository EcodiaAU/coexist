-- =====================================================================
-- Campouts: national collective + rest-of-2026 ticketed campout events
-- =====================================================================
-- Origin: Tate 2026-06-23. Add the Myall Park (Outback) + Wild Mountains
-- conservation campouts for the rest of 2026 into the app as TICKETED
-- events visible to ALL users (national), each later gaining its own group
-- chat (migration 20260623000100). Dates/times/venues sourced from the
-- Eventbrite listings linked off campouts.coexistaus.org.
--
-- Visibility: events sit under a national collective (is_national=true) so
-- useNationalEvents() surfaces them on Home to every user, plus is_public=true
-- so the events RLS (is_public OR collective_member OR admin) reads open.
--
-- Events ship status='draft'. Pricing for the two Myall Park dates is the
-- confirmed Eventbrite price ($75). Wild Mountains price was not exposed on
-- Eventbrite and is provisionally $75; capacity ("limited spots") was not
-- published anywhere and is provisionally 30. Both are confirmed with Tate
-- before any event is flipped to 'published'. Idempotent + transactional.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. National campouts collective (idempotent by slug)
-- ---------------------------------------------------------------------
INSERT INTO public.collectives (name, slug, is_national, is_active, timezone, description)
SELECT 'Campouts', 'campouts', true, true, 'Australia/Brisbane',
       'National conservation campouts, open to every Co-Exist member.'
WHERE NOT EXISTS (SELECT 1 FROM public.collectives WHERE slug = 'campouts');

-- ---------------------------------------------------------------------
-- 2. The five rest-of-2026 campout events (idempotent by collective+day+title)
--    created_by = Angelica Choppin (Co-Exist admin).
-- ---------------------------------------------------------------------
WITH cc AS (SELECT id FROM public.collectives WHERE slug = 'campouts')
INSERT INTO public.events
  (collective_id, created_by, title, description, activity_type, address,
   date_start, date_end, capacity, is_public, is_ticketed, status, timezone)
SELECT cc.id,
       '582f1d66-3ace-43cb-a4ab-31c332504fbf'::uuid,
       v.title, v.descr, 'camp_out'::public.activity_type, v.address,
       v.date_start, v.date_end, v.capacity, true, true, 'draft', 'Australia/Brisbane'
FROM cc, (VALUES
  ('Wild Mountains Conservation Campout',
   'A weekend conservation campout at Wild Mountains, Running Creek QLD. Camping, hands-on habitat restoration, and good company. Arrive Friday afternoon, wrap up Sunday morning.',
   '487 Philp Mountain Road, Running Creek QLD 4287',
   TIMESTAMPTZ '2026-07-10 14:00:00+10', TIMESTAMPTZ '2026-07-12 10:00:00+10', 30),
  ('Outback Conservation Campout (Myall Park)',
   'A weekend conservation campout at Myall Park Botanic Garden, Glenmorgan QLD. Camping, hands-on restoration in the outback, and community. Arrive Friday afternoon, wrap up Sunday morning.',
   'Myall Park Botanic Garden, 1 Myall Park Road, Glenmorgan QLD 4423',
   TIMESTAMPTZ '2026-08-07 13:00:00+10', TIMESTAMPTZ '2026-08-09 10:00:00+10', 30),
  ('Wild Mountains Conservation Campout',
   'A weekend conservation campout at Wild Mountains, Running Creek QLD. Camping, hands-on habitat restoration, and good company. Arrive Friday afternoon, wrap up Sunday morning.',
   '487 Philp Mountain Road, Running Creek QLD 4287',
   TIMESTAMPTZ '2026-09-04 14:00:00+10', TIMESTAMPTZ '2026-09-06 10:00:00+10', 30),
  ('Wild Mountains Conservation Campout',
   'A weekend conservation campout at Wild Mountains, Running Creek QLD. Camping, hands-on habitat restoration, and good company. Arrive Saturday afternoon, wrap up Monday morning.',
   '487 Philp Mountain Road, Running Creek QLD 4287',
   TIMESTAMPTZ '2026-10-03 14:00:00+10', TIMESTAMPTZ '2026-10-05 10:00:00+10', 30),
  ('Outback Conservation Campout (Myall Park)',
   'A weekend conservation campout at Myall Park Botanic Garden, Glenmorgan QLD. Camping, hands-on restoration in the outback, and community. Arrive Friday afternoon, wrap up Sunday morning.',
   'Myall Park Botanic Garden, 1 Myall Park Road, Glenmorgan QLD 4423',
   TIMESTAMPTZ '2026-10-30 13:00:00+10', TIMESTAMPTZ '2026-11-01 10:00:00+10', 30)
) AS v(title, descr, address, date_start, date_end, capacity)
WHERE NOT EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.collective_id = cc.id
    AND (e.date_start AT TIME ZONE 'UTC')::date = (v.date_start AT TIME ZONE 'UTC')::date
    AND lower(e.title) = lower(v.title)
);

-- ---------------------------------------------------------------------
-- 3. One ticket type per campout event that lacks one.
--    Price provisional $75 (7500c); capacity mirrors the event capacity.
-- ---------------------------------------------------------------------
WITH cc AS (SELECT id FROM public.collectives WHERE slug = 'campouts')
INSERT INTO public.event_ticket_types
  (event_id, name, description, price_cents, capacity, is_active, sort_order)
SELECT e.id, 'Campout Ticket', 'Full weekend campout pass.', 7500, e.capacity, true, 0
FROM public.events e, cc
WHERE e.collective_id = cc.id
  AND e.activity_type = 'camp_out'
  AND NOT EXISTS (SELECT 1 FROM public.event_ticket_types t WHERE t.event_id = e.id);

COMMIT;
