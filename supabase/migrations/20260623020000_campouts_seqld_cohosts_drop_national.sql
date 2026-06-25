-- =====================================================================
-- Campouts: host under SE-QLD collectives, drop the national section
-- =====================================================================
-- Origin: Tate 2026-06-23. The national "Campouts" collective put all five
-- QLD campouts in a dedicated national Home section shown to every user
-- (e.g. a Victoria member), which is too much. Campouts are a SE-QLD thing.
-- Reattach them to Brisbane (primary) + co-host Gold Coast and Sunshine Coast
-- so those members see them in their own feeds, keep is_public=true so they
-- still appear in the general events page for everyone, and remove the
-- national collective so there is no dedicated national section. National
-- reach happens via campouts.coexistaus.org + the public guest checkout.
-- Idempotent + transactional.
--
-- Brisbane       067ff792-8406-4ed9-8192-0a5b4fb04f70
-- Gold Coast     56e9b749-55b1-4424-808b-5441f1c9418d
-- Sunshine Coast e8184908-fa00-4a2e-a642-3aa6f9aebabe
-- Angelica admin 582f1d66-3ace-43cb-a4ab-31c332504fbf
-- =====================================================================

BEGIN;

-- 1. Primary host -> Brisbane, mark as multi-host.
UPDATE public.events
SET collective_id = '067ff792-8406-4ed9-8192-0a5b4fb04f70',
    is_external_collaboration = true
WHERE id IN (
  '99d2b098-78dd-41c7-8a3a-b7eb94020150',
  'cfbe0ce1-fb23-4485-9140-94c1dc423714',
  '02947960-dd03-4e93-bd1d-371aaa026b1a',
  '810cf846-712f-4fb4-8031-91aafed17511',
  '37fc564c-3dda-43f5-993a-b5280919735a'
)
AND collective_id <> '067ff792-8406-4ed9-8192-0a5b4fb04f70';

-- 2. Co-host Gold Coast + Sunshine Coast (accepted) so their members see them.
INSERT INTO public.collective_event_collaborators
  (event_id, collective_id, invited_by_collective_id, invited_by_user, status, responded_at)
SELECT ev.e_id, co.c_id,
       '067ff792-8406-4ed9-8192-0a5b4fb04f70',
       '582f1d66-3ace-43cb-a4ab-31c332504fbf',
       'accepted', now()
FROM (VALUES
  ('99d2b098-78dd-41c7-8a3a-b7eb94020150'::uuid),
  ('cfbe0ce1-fb23-4485-9140-94c1dc423714'::uuid),
  ('02947960-dd03-4e93-bd1d-371aaa026b1a'::uuid),
  ('810cf846-712f-4fb4-8031-91aafed17511'::uuid),
  ('37fc564c-3dda-43f5-993a-b5280919735a'::uuid)
) AS ev(e_id),
(VALUES
  ('56e9b749-55b1-4424-808b-5441f1c9418d'::uuid),
  ('e8184908-fa00-4a2e-a642-3aa6f9aebabe'::uuid)
) AS co(c_id)
ON CONFLICT (event_id, collective_id) DO NOTHING;

-- 3. Remove the now-empty national Campouts collective.
DELETE FROM public.collectives c
WHERE c.slug = 'campouts'
  AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.collective_id = c.id);

COMMIT;
