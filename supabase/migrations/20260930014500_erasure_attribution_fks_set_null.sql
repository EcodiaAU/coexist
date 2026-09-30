-- GDPR erasure: the second abort class. Nine attribution foreign keys that refused
-- the delete now anonymise instead, and the walk-in edit window no longer turns that
-- anonymisation into a third abort.
--
-- WHY. public.cleanup_deleted_accounts() (pg_cron job 22, 03:00 UTC daily) is a single
-- DELETE FROM auth.users, and everything else happens by FK cascade, so ONE constraint
-- that refuses the delete rolls back the whole night's run for every queued account.
-- 20260915040000 fixed the first class (ON DELETE SET NULL onto NOT NULL columns, which
-- aborted 63 consecutive nights, 2026-07-15 to 2026-09-15). This migration fixes the
-- second: ten foreign keys onto auth.users / public.profiles were ON DELETE NO ACTION,
-- so any admin or leader who had authored a campaign, template, legal page or walk-in
-- and then asked to be erased would block their own erasure and everyone queued behind
-- them. Measured 2026-09-30: event_walk_ins.created_by_user_id alone references 32
-- distinct leaders across 191 rows, so this was one erasure request away from live.
--
-- WHAT CHANGES. The nine columns below are attribution and audit trail. Each becomes
-- nullable and its FK becomes ON DELETE SET NULL, in that order and in one transaction,
-- because SET NULL onto a NOT NULL column IS the 63-night bug. Only
-- task_templates.created_by was NOT NULL (the table is empty on 2026-09-30); the other
-- eight were already nullable and DROP NOT NULL is a no-op on them. Constraint names
-- are kept byte-identical because the generated types and PostgREST embeds name them.
-- This matches what the admin delete path already does by hand: supabase/functions/
-- delete-user nulls eight of these before deleting (and reassigns task_templates to the
-- deleting admin, which still works; the cron path has no admin, so it nulls).
--
-- WHAT DOES NOT CHANGE. task_instances.assigned_user_id stays ON DELETE NO ACTION. A
-- null assignee changes what a task MEANS (unassigned, rather than assigned to someone
-- who left), so that one is a product decision held open for Tate, not a provenance fix.
-- It still blocks erasure of anyone assigned a task; the table is empty on 2026-09-30.
--
-- THE THIRD ABORT CLASS, found while applying this. An ON DELETE SET NULL cascade is an
-- UPDATE of the referencing row, so it fires that table's row triggers.
-- trg_enforce_walk_in_mutation_window raises 22023 for any non-service_role update of a
-- walk-in on a FUTURE event, and the cron runs as postgres with the role GUC 'none', so
-- its service_role bypass never applies. Converting the walk-in FKs alone would have
-- traded "blocked by NO ACTION" for "blocked by RAISE" for any leader with a walk-in on
-- an upcoming event. Proven on production in a rolled-back fixture 2026-09-30: SET NULL
-- with the old trigger -> DELETE_FAILED(22023 Walk-ins for a future event cannot be
-- modified). The trigger now lets through an update whose ONLY change is a user
-- reference going to NULL; every real edit of a future walk-in is still refused.

SET LOCAL lock_timeout = '5s';

-- 1. Nullable first. Never SET NULL onto a NOT NULL column.
ALTER TABLE public.app_images             ALTER COLUMN updated_by         DROP NOT NULL;
ALTER TABLE public.email_campaigns        ALTER COLUMN created_by         DROP NOT NULL;
ALTER TABLE public.email_templates        ALTER COLUMN created_by         DROP NOT NULL;
ALTER TABLE public.event_walk_ins         ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE public.event_walk_ins         ALTER COLUMN linked_user_id     DROP NOT NULL;
ALTER TABLE public.legal_pages            ALTER COLUMN updated_by         DROP NOT NULL;
ALTER TABLE public.system_email_overrides ALTER COLUMN updated_by         DROP NOT NULL;
ALTER TABLE public.task_instances         ALTER COLUMN completed_by       DROP NOT NULL;
ALTER TABLE public.task_templates         ALTER COLUMN created_by         DROP NOT NULL;

-- 2. Then the FK action, same constraint names.
ALTER TABLE public.app_images
  DROP CONSTRAINT app_images_updated_by_fkey,
  ADD  CONSTRAINT app_images_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.email_campaigns
  DROP CONSTRAINT email_campaigns_created_by_fkey,
  ADD  CONSTRAINT email_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.email_templates
  DROP CONSTRAINT email_templates_created_by_fkey,
  ADD  CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.event_walk_ins
  DROP CONSTRAINT event_walk_ins_created_by_user_id_fkey,
  ADD  CONSTRAINT event_walk_ins_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  DROP CONSTRAINT event_walk_ins_linked_user_id_fkey,
  ADD  CONSTRAINT event_walk_ins_linked_user_id_fkey FOREIGN KEY (linked_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.legal_pages
  DROP CONSTRAINT legal_pages_updated_by_fkey,
  ADD  CONSTRAINT legal_pages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.system_email_overrides
  DROP CONSTRAINT system_email_overrides_updated_by_fkey,
  ADD  CONSTRAINT system_email_overrides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.task_instances
  DROP CONSTRAINT task_instances_completed_by_fkey,
  ADD  CONSTRAINT task_instances_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.task_templates
  DROP CONSTRAINT task_templates_created_by_fkey,
  ADD  CONSTRAINT task_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. The walk-in edit window lets anonymisation through and nothing else.
CREATE OR REPLACE FUNCTION public.enforce_walk_in_mutation_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  event_date_local date;
  today_local      date;
  event_tz         text;
  ref_event_id     uuid;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Anonymisation is always allowed, whatever the event date. This is the shape an
  -- ON DELETE SET NULL cascade writes when a leader or linked member is erased: at
  -- least one user reference goes from a value to NULL, neither reference gains a
  -- new value, and no other column moves. Without this, erasing anyone with a
  -- walk-in on an upcoming event aborts the whole nightly GDPR run.
  IF TG_OP = 'UPDATE'
     AND (   (OLD.created_by_user_id IS NOT NULL AND NEW.created_by_user_id IS NULL)
          OR (OLD.linked_user_id     IS NOT NULL AND NEW.linked_user_id     IS NULL))
     AND (NEW.created_by_user_id IS NULL OR NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id)
     AND (NEW.linked_user_id     IS NULL OR NEW.linked_user_id     IS NOT DISTINCT FROM OLD.linked_user_id)
     AND (to_jsonb(NEW) - 'created_by_user_id' - 'linked_user_id')
       = (to_jsonb(OLD) - 'created_by_user_id' - 'linked_user_id')
  THEN
    RETURN NEW;
  END IF;

  ref_event_id := COALESCE(NEW.event_id, OLD.event_id);

  SELECT (e.date_start AT TIME ZONE 'UTC')::date,
         COALESCE(c.timezone, 'Australia/Sydney')
    INTO event_date_local, event_tz
    FROM public.events e
    LEFT JOIN public.collectives c ON c.id = e.collective_id
   WHERE e.id = ref_event_id;

  today_local := (now() AT TIME ZONE event_tz)::date;

  IF event_date_local > today_local THEN
    RAISE EXCEPTION 'Walk-ins for a future event cannot be modified'
      USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4. Self-check. If either invariant fails, the whole migration rolls back.
DO $check$
DECLARE
  contradictions int;
  blocking       text;
BEGIN
  SELECT count(*) INTO contradictions
    FROM pg_constraint c
    JOIN unnest(c.conkey) k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
   WHERE c.contype = 'f' AND c.confdeltype = 'n' AND a.attnotnull;
  IF contradictions <> 0 THEN
    RAISE EXCEPTION 'erasure self-check: % NOT NULL column(s) under ON DELETE SET NULL', contradictions;
  END IF;

  SELECT string_agg(c.conname, ',' ORDER BY c.conname) INTO blocking
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
     AND c.confdeltype IN ('a', 'r', 'd');
  IF blocking IS DISTINCT FROM 'task_instances_assigned_user_id_fkey' THEN
    RAISE EXCEPTION 'erasure self-check: delete-blocking FKs are [%], expected only task_instances_assigned_user_id_fkey', blocking;
  END IF;
END
$check$;
