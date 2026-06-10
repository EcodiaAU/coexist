-- Add forms_migrated_at to collectives for Forms -> App migration gating.
-- See supabase/functions/excel-sync/index.ts for how this column drives sync behaviour.
ALTER TABLE public.collectives
  ADD COLUMN IF NOT EXISTS forms_migrated_at timestamptz;

COMMENT ON COLUMN public.collectives.forms_migrated_at IS
  'When this collective cut over from Microsoft Forms to the app for event logging. NULL = still on Forms. Events with date_start >= this value flow to the Excel sheet via excel-sync Edge Function.';
