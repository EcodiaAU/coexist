-- =====================================================================
-- Client-side idempotency keys for offline replay - 1.8.5
-- =====================================================================
-- Origin: Tate verbatim 17:11 AEST 9 May 2026 - 1.8.5 mid-event resilience
-- pass after the Sunshine Coast event went well in patchy reception.
--
-- Existing offline-replay dedup uses row-state checks ("is this user
-- already 'attended'? skip"). That works for status flips because the
-- end state is a no-op on retry. It does NOT work for INSERT-shaped
-- mutations (chat messages, survey responses, impact rows) where a
-- naive retry produces a duplicate row.
--
-- This migration adds a `client_action_id` UUID column to the three
-- highest-traffic offline-shaped tables, plus partial UNIQUE indexes
-- so a server-side INSERT/UPDATE with the same client_action_id is a
-- no-op (or upsert) on retry. Column is nullable so legacy clients
-- that don't send a client_action_id continue to work unchanged.
--
-- Forward path (out of scope for this migration, documented for future):
--   - app sends `client_action_id: crypto.randomUUID()` on every offline
--     mutation (idempotency key).
--   - server-side handlers UPSERT on the partial UNIQUE index (where
--     client_action_id IS NOT NULL).
--   - this collapses the existing per-action dedup logic in
--     offline-sync.ts into a single ON CONFLICT clause.
--
-- DEPLOYMENT NOTE: this migration is STAGED, not auto-deployed. Tate to
-- run during the 1.8.5 RC build window via:
--   cd ~/workspaces/coexist
--   SUPABASE_ACCESS_TOKEN=<creds.supabase_access_token> \
--     npx supabase db push --project-ref tjutlbzekfouwsiaplbr
-- =====================================================================

-- 1. event_registrations: was the most likely duplicate-on-retry surface
--    pre-trigger. Now bounded by trg_enforce_validated_v1_check_in_window
--    too. The client_action_id catches the chat-message / impact-style
--    case where a leader bulk-checks-in twice before the queue drains.
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS client_action_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_client_action_id_uniq
  ON public.event_registrations (client_action_id)
  WHERE client_action_id IS NOT NULL;

-- 2. event_impact: leader logs trees-planted / impact data once; replay
--    must not double-count.
ALTER TABLE public.event_impact
  ADD COLUMN IF NOT EXISTS client_action_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS event_impact_client_action_id_uniq
  ON public.event_impact (client_action_id)
  WHERE client_action_id IS NOT NULL;

-- 3. chat_messages: dedup window in offline-sync.ts uses 5s timestamp +
--    content match. UUID is bulletproof. Both paths can co-exist.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS client_action_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_action_id_uniq
  ON public.chat_messages (client_action_id)
  WHERE client_action_id IS NOT NULL;

-- 4. survey_responses: dedup currently uses (survey_id, user_id, event_id).
--    Adding a client_action_id is belt-and-braces for any future survey
--    schema that doesn't have a natural dedup key.
ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS client_action_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_client_action_id_uniq
  ON public.survey_responses (client_action_id)
  WHERE client_action_id IS NOT NULL;

-- =====================================================================
-- Comment metadata so the column purpose is visible in psql / Studio.
-- =====================================================================
COMMENT ON COLUMN public.event_registrations.client_action_id IS
  'Offline-replay idempotency key. App generates UUID per mutation; partial UNIQUE index makes server-side replay a no-op.';
COMMENT ON COLUMN public.event_impact.client_action_id IS
  'Offline-replay idempotency key. App generates UUID per mutation; partial UNIQUE index makes server-side replay a no-op.';
COMMENT ON COLUMN public.chat_messages.client_action_id IS
  'Offline-replay idempotency key. App generates UUID per mutation; partial UNIQUE index makes server-side replay a no-op.';
COMMENT ON COLUMN public.survey_responses.client_action_id IS
  'Offline-replay idempotency key. App generates UUID per mutation; partial UNIQUE index makes server-side replay a no-op.';
