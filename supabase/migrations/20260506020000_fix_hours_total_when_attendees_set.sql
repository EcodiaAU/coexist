-- ============================================================================
-- Stats accuracy fix: hours_total must always equal attendees * event_duration
-- when attendees > 0
--
-- Problem (1.8.4 item 16):
--   Brisbane (BNE) 2026: 375 attendees, 282 vol hours rendered (and many
--   other collectives showed similar improbable ratios). Root cause: the
--   excel-sync edge function and several other write paths populate
--   `attendees` on event_impact rows but leave `hours_total` NULL. The FE
--   aggregator sums hours_total directly so NULL becomes 0 while the
--   attendees from those same rows are still counted. Across all collectives
--   220 live rows had attendees > 0 with NULL/0 hours_total - 3850 attendees
--   worth of hours simply disappeared.
--
-- Fix at root, two passes:
--   1. Backfill hours_total = attendees * event_duration for any existing
--      live (non-legacy) row where attendees > 0 and hours_total is NULL/0.
--      Mirror the legacy backfill formula in 20260331000000.
--   2. Add a BEFORE INSERT/UPDATE trigger so future writes (excel-sync,
--      log-impact form, survey-driven impact) auto-compute hours_total when
--      attendees is set but the writer left hours_total blank.
--
-- This is a constraint-style trigger, not a pg_notify listener, so the
-- listener-pipeline-five-layer protocol does not apply. Verification is
-- empirical: re-query prod for BNE post-migration, confirm hours/attendees
-- ratio is in the 1-5 hr/attendee human range.
--
-- fork: fork_motzkj4o_2e73ac
-- ============================================================================


-- ============================================================================
-- PASS 1: Backfill existing live rows
-- ============================================================================

UPDATE event_impact ei
SET hours_total = sub.estimated_hours
FROM (
  SELECT
    ei2.id AS impact_id,
    ROUND(
      ei2.attendees::numeric
      * CASE
          WHEN e.date_end IS NOT NULL AND e.date_end > e.date_start
          THEN EXTRACT(EPOCH FROM (e.date_end - e.date_start)) / 3600.0
          ELSE 3.0
        END
    ) AS estimated_hours
  FROM event_impact ei2
  JOIN events e ON e.id = ei2.event_id
  WHERE ei2.attendees IS NOT NULL
    AND ei2.attendees > 0
    AND (ei2.hours_total IS NULL OR ei2.hours_total = 0)
    AND (ei2.notes IS NULL OR ei2.notes !~ 'Legacy import')
) sub
WHERE ei.id = sub.impact_id
  AND sub.estimated_hours > 0;


-- ============================================================================
-- PASS 2: Trigger - auto-compute hours_total on INSERT/UPDATE when blank
-- ============================================================================

CREATE OR REPLACE FUNCTION fill_event_impact_hours_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  duration_h numeric;
BEGIN
  IF NEW.attendees IS NULL OR NEW.attendees <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.hours_total IS NOT NULL AND NEW.hours_total > 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    CASE
      WHEN e.date_end IS NOT NULL AND e.date_end > e.date_start
      THEN EXTRACT(EPOCH FROM (e.date_end - e.date_start)) / 3600.0
      ELSE 3.0
    END
  INTO duration_h
  FROM events e
  WHERE e.id = NEW.event_id;

  IF duration_h IS NULL OR duration_h <= 0 THEN
    duration_h := 3.0;
  END IF;

  NEW.hours_total := ROUND(NEW.attendees::numeric * duration_h);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_event_impact_hours_total ON event_impact;

CREATE TRIGGER trg_fill_event_impact_hours_total
  BEFORE INSERT OR UPDATE OF attendees, hours_total ON event_impact
  FOR EACH ROW
  EXECUTE FUNCTION fill_event_impact_hours_total();

COMMENT ON FUNCTION fill_event_impact_hours_total() IS
  'Auto-computes event_impact.hours_total = attendees * event_duration when '
  'a writer (excel-sync, log-impact form, survey trigger) sets attendees but '
  'leaves hours_total blank. Prevents the attendees-without-hours drift that '
  'broke per-collective stats up to and including 1.8.3 (item 16, fork '
  'fork_motzkj4o_2e73ac).';
