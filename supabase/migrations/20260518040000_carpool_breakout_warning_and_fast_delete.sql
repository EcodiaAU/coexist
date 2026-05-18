-- ============================================================================
-- Carpool breakout: 24h delete window + pre-delete warning
--
-- Existing carpool-archive-sweep archives breakouts at event_end + 24h and
-- hard-deletes 7 days later. Tate's call: breakouts close the day after the
-- event so people don't see stale chats; post a system warning ~2h before
-- close so passengers can grab photos / share contact info.
--
-- Adds warning_posted_at to mark which breakouts have already received the
-- pre-delete system message (idempotency on the sweep).
-- ============================================================================

ALTER TABLE public.carpool_breakout_chats
  ADD COLUMN IF NOT EXISTS warning_posted_at timestamptz;

NOTIFY pgrst, 'reload schema';
