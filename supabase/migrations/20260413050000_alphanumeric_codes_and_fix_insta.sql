-- 1. Alphanumeric check-in codes (36^3 = 46,656 possible vs 1,000)
CREATE OR REPLACE FUNCTION generate_event_check_in_code() RETURNS text AS $$
DECLARE
  code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I to avoid confusion
  attempts int := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..3 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM events
      WHERE check_in_code = code
        AND status NOT IN ('completed', 'cancelled')
    );
    attempts := attempts + 1;
    IF attempts > 200 THEN
      -- Fallback to 4 chars
      code := '';
      FOR i IN 1..4 LOOP
        code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
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

-- 2. Fix double @@ in instagram handles
UPDATE profiles
SET instagram_handle = ltrim(instagram_handle, '@')
WHERE instagram_handle LIKE '@@%';

-- Also strip any leading @ since the app auto-prepends one
UPDATE profiles
SET instagram_handle = ltrim(instagram_handle, '@')
WHERE instagram_handle LIKE '@%';

-- 3. Ensure instagram_handle never stores @ prefix (trigger)
CREATE OR REPLACE FUNCTION strip_instagram_at() RETURNS trigger AS $$
BEGIN
  IF NEW.instagram_handle IS NOT NULL THEN
    NEW.instagram_handle := ltrim(NEW.instagram_handle, '@');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_strip_instagram_at ON profiles;
CREATE TRIGGER trg_strip_instagram_at
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION strip_instagram_at();
