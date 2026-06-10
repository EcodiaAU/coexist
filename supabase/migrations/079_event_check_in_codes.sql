-- =============================================================================
-- Event Check-In Codes
-- Replace long ticket codes with simple 3-digit numeric event codes
-- =============================================================================

-- 1. Add check_in_code column to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS check_in_code text;

-- 2. Create function to generate unique 3-digit event codes
CREATE OR REPLACE FUNCTION generate_event_check_in_code() RETURNS text AS $$
DECLARE
  code text;
  attempts integer := 0;
  max_3digit integer := 999;
  max_4digit integer := 9999;
BEGIN
  -- Try 3-digit codes first (000-999)
  LOOP
    code := lpad(floor(random() * (max_3digit + 1))::integer::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM events WHERE check_in_code = code);
    attempts := attempts + 1;
    -- If we've tried many times, all 3-digit codes might be taken; extend to 4 digits
    IF attempts > 50 THEN
      LOOP
        code := lpad(floor(random() * (max_4digit + 1))::integer::text, 4, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM events WHERE check_in_code = code);
        attempts := attempts + 1;
        IF attempts > 200 THEN
          RAISE EXCEPTION 'Failed to generate unique check-in code';
        END IF;
      END LOOP;
      RETURN code;
    END IF;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- 3. Auto-generate check_in_code on event insert
CREATE OR REPLACE FUNCTION set_event_check_in_code() RETURNS trigger AS $$
BEGIN
  IF NEW.check_in_code IS NULL THEN
    NEW.check_in_code := generate_event_check_in_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_event_check_in_code ON events;
CREATE TRIGGER trg_set_event_check_in_code
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_event_check_in_code();

-- 4. Backfill existing events with unique 3-digit codes
DO $$
DECLARE
  evt RECORD;
  code text;
  attempts integer;
BEGIN
  FOR evt IN SELECT id FROM events WHERE check_in_code IS NULL LOOP
    attempts := 0;
    LOOP
      code := lpad(floor(random() * 1000)::integer::text, 3, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM events WHERE check_in_code = code);
      attempts := attempts + 1;
      IF attempts > 50 THEN
        -- Extend to 4 digits
        LOOP
          code := lpad(floor(random() * 10000)::integer::text, 4, '0');
          EXIT WHEN NOT EXISTS (SELECT 1 FROM events WHERE check_in_code = code);
          attempts := attempts + 1;
          IF attempts > 200 THEN
            RAISE EXCEPTION 'Failed to generate unique code for event %', evt.id;
          END IF;
        END LOOP;
        EXIT;
      END IF;
    END LOOP;
    UPDATE events SET check_in_code = code WHERE id = evt.id;
  END LOOP;
END;
$$;

-- 5. Add unique index on check_in_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_check_in_code ON events(check_in_code) WHERE check_in_code IS NOT NULL;
