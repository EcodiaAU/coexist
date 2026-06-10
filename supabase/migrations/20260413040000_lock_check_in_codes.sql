-- Lock check-in codes: immutable once set, unique only among active events
-- This allows code reuse after events complete (only 1000 possible 3-digit codes)

-- 1. Drop old global unique index
DROP INDEX IF EXISTS idx_events_check_in_code;

-- 2. Unique only among non-completed/non-cancelled events (allows reuse after completion)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_check_in_code_active
  ON events(check_in_code)
  WHERE check_in_code IS NOT NULL
    AND status NOT IN ('completed', 'cancelled');

-- 3. Prevent check_in_code from being changed once set
CREATE OR REPLACE FUNCTION prevent_check_in_code_change() RETURNS trigger AS $$
BEGIN
  IF OLD.check_in_code IS NOT NULL AND NEW.check_in_code IS DISTINCT FROM OLD.check_in_code THEN
    RAISE EXCEPTION 'check_in_code cannot be changed once assigned';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lock_check_in_code ON events;
CREATE TRIGGER trg_lock_check_in_code
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_check_in_code_change();

-- 4. Update generator to only check active events for collisions
CREATE OR REPLACE FUNCTION generate_event_check_in_code() RETURNS text AS $$
DECLARE
  code text;
  attempts int := 0;
BEGIN
  LOOP
    code := lpad(floor(random() * 1000)::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM events
      WHERE check_in_code = code
        AND status NOT IN ('completed', 'cancelled')
    );
    attempts := attempts + 1;
    IF attempts > 100 THEN
      -- Fallback to 4-digit code if 3-digit space is exhausted
      code := lpad(floor(random() * 10000)::text, 4, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM events
        WHERE check_in_code = code
          AND status NOT IN ('completed', 'cancelled')
      );
    END IF;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;
