-- ============================================================================
-- chat_read_receipts: restore ON-CONFLICT-targetable unique constraints.
--
-- Migration 20260518030000 replaced the unique constraint on
-- (collective_id, user_id) with two PARTIAL unique indexes. PostgreSQL cannot
-- infer to a partial unique index from an `ON CONFLICT (col, col)` clause
-- without the predicate also being specified. supabase-js's
-- `.upsert(..., { onConflict: 'collective_id,user_id' })` emits the bare form,
-- so every mark-as-read upsert post-migration has been failing with:
--
--   ERROR: 42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- The FE logs '[chat] Failed to mark chat read' to the console and the unread
-- badge persists. Bug surfaced by Tate: "seeing a message actually registers
-- it as seen" not working.
--
-- Fix: drop the partial indexes and add non-partial UNIQUE constraints. PG
-- treats NULLs as distinct by default (NULLS DISTINCT), so a non-partial
-- UNIQUE (collective_id, user_id) is semantically equivalent to the partial
-- index "unique where collective_id IS NOT NULL" - multiple rows with
-- collective_id=NULL for the same user are still allowed (one per orphan
-- channel). Same for (channel_id, user_id).
-- ============================================================================

-- Drop the partial unique indexes that supabase-js cannot infer to.
DROP INDEX IF EXISTS public.chat_read_receipts_collective_user_uq;
DROP INDEX IF EXISTS public.chat_read_receipts_channel_user_uq;

-- Restore unique constraints in their non-partial form. ADD CONSTRAINT
-- creates a backing unique index that ON CONFLICT (col, col) can infer to.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_read_receipts_collective_user_uniq'
      AND conrelid = 'public.chat_read_receipts'::regclass
  ) THEN
    ALTER TABLE public.chat_read_receipts
      ADD CONSTRAINT chat_read_receipts_collective_user_uniq
      UNIQUE (collective_id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_read_receipts_channel_user_uniq'
      AND conrelid = 'public.chat_read_receipts'::regclass
  ) THEN
    ALTER TABLE public.chat_read_receipts
      ADD CONSTRAINT chat_read_receipts_channel_user_uniq
      UNIQUE (channel_id, user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
