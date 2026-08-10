-- D3 (remediation 2026-08-10): relocate the per-event free-ticket claim token
-- out of the world-readable events.event_extras jsonb into a private table that
-- ONLY the SECURITY DEFINER claim path (service_role) can read.
--
-- Root cause of the blocker (backlog P3B2): events.event_extras is SELECT-granted
-- to anon AND authenticated, and events_select_public_anon returns the whole row
-- (is_public = true). So any signed-in user could read event_extras->>'claim_token'
-- off a public campout, POST {event_id, token} to claim-event-ticket, and receive a
-- $0 confirmed ticket. The secret lived in a client-readable column.
--
-- Fix: move the token to public.event_claim_tokens (RLS on, no anon/authenticated
-- policy + explicit REVOKE), backfill idempotently, then strip the key from
-- event_extras. The claim link itself is unchanged: the token travels in the
-- shared URL (/claim/:eventId/:token) and the client passes it through; only the
-- edge function now validates it, against this private table.
--
-- NON-DESTRUCTIVE: additive table + idempotent backfill + a reversible jsonb-key
-- removal (the value is preserved in event_claim_tokens first, inside one tx).
-- The `sold_out` key and every other event_extras key are left untouched.
-- Reverse (if ever needed):
--   UPDATE public.events e SET event_extras = coalesce(e.event_extras,'{}'::jsonb)
--     || jsonb_build_object('claim_token', t.token)
--   FROM public.event_claim_tokens t WHERE e.id = t.event_id;

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_claim_tokens (
  event_id   uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  token      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_claim_tokens IS
  'Private per-event free-ticket claim tokens (moved out of events.event_extras 2026-08-10, remediation D3). '
  'Readable ONLY by service_role via the claim-event-ticket edge function. RLS enabled with NO anon/authenticated '
  'policy: the token must never be client-readable or the free-ticket claim gate is bypassable by any signed-in user.';

ALTER TABLE public.event_claim_tokens ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: RLS-on-no-policy already denies anon/authenticated every
-- row; also revoke table grants so the column can never be reached. service_role
-- bypasses RLS (BYPASSRLS) and keeps full access for the edge function.
REVOKE ALL ON public.event_claim_tokens FROM anon, authenticated;
GRANT ALL ON public.event_claim_tokens TO service_role;

-- Idempotent backfill from the current (leaky) location.
INSERT INTO public.event_claim_tokens (event_id, token)
SELECT e.id, e.event_extras->>'claim_token'
FROM public.events e
WHERE e.event_extras ? 'claim_token'
  AND coalesce(e.event_extras->>'claim_token', '') <> ''
ON CONFLICT (event_id) DO UPDATE SET token = EXCLUDED.token, updated_at = now();

-- Strip the secret from the world-readable column (value preserved above).
UPDATE public.events
SET event_extras = event_extras - 'claim_token'
WHERE event_extras ? 'claim_token';

COMMIT;
