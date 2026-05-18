-- ============================================================================
-- chat_read_receipts: support channel-based read state without forging
-- collective_id values.
--
-- The original schema required `collective_id NOT NULL` and a unique on
-- (collective_id, user_id). When users opened channels with no collective
-- (state staff channels, national staff, carpool breakouts), the FE workaround
-- was to write the channel_id into the collective_id column. That worked
-- when the FK was permissive but breaks now with PGRST FK validation:
-- '"Key is not present in table \"collectives\"."'.
--
-- Fix: collective_id becomes nullable, add a CHECK that requires at least
-- one of collective_id / channel_id, and add partial unique indexes for
-- each axis so a user has a single receipt per collective AND per channel.
-- ============================================================================

-- 1. Allow null collective_id
ALTER TABLE public.chat_read_receipts
  ALTER COLUMN collective_id DROP NOT NULL;

-- 2. Require at least one scope key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_read_receipts_scope_check'
      AND conrelid = 'public.chat_read_receipts'::regclass
  ) THEN
    ALTER TABLE public.chat_read_receipts
      ADD CONSTRAINT chat_read_receipts_scope_check
      CHECK (collective_id IS NOT NULL OR channel_id IS NOT NULL);
  END IF;
END $$;

-- 3. Drop the legacy (collective_id, user_id) unique - we replace with two
--    partial unique indexes so a user has one receipt per scope kind.
ALTER TABLE public.chat_read_receipts
  DROP CONSTRAINT IF EXISTS chat_read_receipts_collective_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS chat_read_receipts_collective_user_uq
  ON public.chat_read_receipts (collective_id, user_id)
  WHERE collective_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_read_receipts_channel_user_uq
  ON public.chat_read_receipts (channel_id, user_id)
  WHERE channel_id IS NOT NULL AND collective_id IS NULL;

NOTIFY pgrst, 'reload schema';
