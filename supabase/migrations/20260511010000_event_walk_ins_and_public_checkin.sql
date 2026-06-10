-- Migration: 20260511010000_event_walk_ins_and_public_checkin
--
-- PURPOSE
-- -------
-- Extends Co-Exist leader check-in for three new capabilities (1.8.5):
--
-- 1. event_walk_ins table — captures ad-hoc attendees who show up without
--    pre-registering. Mirrors the profile-survey.tsx field shape (12 fields
--    including emergency contact). Separate from event_registrations because
--    walk-ins have no user_id FK and different lifecycle semantics (no
--    waitlist promotion, no cancellation, just attended | removed).
--
-- 2. public_check_in_enabled / public_check_in_token on events — lets a leader
--    mint a URL-safe token that encodes as a QR code. Scanning the QR takes
--    any phone (signed in or not) to /check-in/:token — a lightweight public
--    form handled by the public-event-check-in Edge Function.
--
-- 3. public_check_in_rate_limits table — IP-per-event rate limiting for the
--    public form. Only accessed via service_role in the Edge Function; no RLS.
--
-- 4. search_app_users_for_event RPC — SECURITY DEFINER function for the
--    "All Members" tab on event-day.tsx. Returns profiles matching a query
--    string, gated on the caller being a collective leader or above.
--
-- IMPORTANT: This migration is NOT executed by any build process.
-- Tate runs it manually as part of the 1.8.5 bundle deployment.

-- ============================================================
-- 1. event_walk_ins
-- ============================================================

CREATE TABLE IF NOT EXISTS event_walk_ins (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                      uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Identity — mirrors profile-survey.tsx fields exactly (12 fields)
  first_name                    text        NOT NULL,
  last_name                     text,
  email                         text,
  phone                         text,
  age                           int         CHECK (age IS NULL OR (age >= 0 AND age <= 120)),
  postcode                      text,
  gender                        text,
  pronouns                      text,
  collective_discovery          text,         -- "How did you hear about us?"
  accessibility_requirements    text,
  emergency_contact_name        text,
  emergency_contact_phone       text,
  emergency_contact_relationship text,

  -- Lifecycle / audit
  status                        text        NOT NULL DEFAULT 'attended'
                                            CHECK (status IN ('attended', 'removed')),
  created_via                   text        NOT NULL
                                            CHECK (created_via IN ('leader_adhoc', 'public_form')),
  created_by_user_id            uuid        REFERENCES profiles(id),  -- NULL for public_form
  client_ip                     inet,       -- captured by Edge Function for public_form
  user_agent                    text,       -- captured by Edge Function for public_form
  linked_user_id                uuid        REFERENCES profiles(id),  -- set if walk-in later joins app

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  -- At least one contact method required
  CONSTRAINT event_walk_ins_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_event_walk_ins_event
  ON event_walk_ins(event_id);

CREATE INDEX IF NOT EXISTS idx_event_walk_ins_email
  ON event_walk_ins(lower(email)) WHERE email IS NOT NULL;

COMMENT ON TABLE event_walk_ins IS
  'Ad-hoc attendees recorded by a leader on the day (leader_adhoc) or via the '
  'public QR check-in form (public_form). Separate from event_registrations '
  'because walk-ins have no app user_id and different lifecycle semantics.';

-- ============================================================
-- 2. RLS on event_walk_ins
-- ============================================================

ALTER TABLE event_walk_ins ENABLE ROW LEVEL SECURITY;

-- Leaders can see all walk-ins for events in their collective
CREATE POLICY event_walk_ins_select
  ON event_walk_ins
  FOR SELECT
  USING (
    is_collective_leader_or_above(
      auth.uid(),
      (SELECT collective_id FROM events e WHERE e.id = event_walk_ins.event_id)
    )
  );

-- Leaders can insert leader_adhoc walk-ins directly
CREATE POLICY event_walk_ins_insert_leader
  ON event_walk_ins
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_via = 'leader_adhoc'
    AND is_collective_leader_or_above(
          auth.uid(),
          (SELECT collective_id FROM events e WHERE e.id = event_walk_ins.event_id)
        )
  );

-- public_form inserts ONLY via the SECURITY DEFINER Edge Function (service_role).
-- There is intentionally NO anonymous-role INSERT policy for public_form.

-- Leaders can soft-delete (set status='removed')
CREATE POLICY event_walk_ins_update_leader
  ON event_walk_ins
  FOR UPDATE
  USING (
    is_collective_leader_or_above(
      auth.uid(),
      (SELECT collective_id FROM events e WHERE e.id = event_walk_ins.event_id)
    )
  );

-- ============================================================
-- 3. Day-of-event trigger for event_walk_ins
--    Mirrors trg_enforce_event_day_check_in on event_registrations.
--    Walk-ins must be recorded on the calendar day of the event (AEST).
--    service_role bypass allows emergency back-fills.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_walk_in_day_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_date_aest date;
  today_aest      date;
BEGIN
  -- service_role bypass for emergency/admin fixes
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT (date_start AT TIME ZONE 'Australia/Sydney')::date
    INTO event_date_aest
    FROM events
   WHERE id = NEW.event_id;

  today_aest := (now() AT TIME ZONE 'Australia/Sydney')::date;

  IF event_date_aest IS DISTINCT FROM today_aest THEN
    RAISE EXCEPTION 'Check-in only available on event day'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_walk_in_day_window
  BEFORE INSERT ON event_walk_ins
  FOR EACH ROW EXECUTE FUNCTION enforce_walk_in_day_window();

-- ============================================================
-- 4. Add public check-in columns to events
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS public_check_in_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_check_in_token   text UNIQUE;

COMMENT ON COLUMN events.public_check_in_enabled IS
  'When true, the event has an active public QR check-in form at /check-in/:public_check_in_token. '
  'Setting to false NULLs the token (rotation on re-enable).';

COMMENT ON COLUMN events.public_check_in_token IS
  '16-char URL-safe token (~96 bits entropy) minted on first enable, rotated on disable+re-enable. '
  'Encodes as a QR code in the leader event-day dashboard.';

-- ============================================================
-- 5. Token generator function
-- ============================================================

CREATE OR REPLACE FUNCTION generate_public_check_in_token()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result   text := '';
  i        int;
BEGIN
  -- 16 chars * log2(36) bits/char ~ 82.7 bits effective entropy.
  -- Sufficient to be unguessable; not a security token, just a URL slug.
  FOR i IN 1..16 LOOP
    result := result || substr(alphabet, 1 + floor(random() * 36)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION generate_public_check_in_token() IS
  'Generates a 16-char lowercase alphanumeric slug for the public QR check-in URL.';

-- ============================================================
-- 6. Trigger: mint / rotate token when public_check_in_enabled changes
-- ============================================================

CREATE OR REPLACE FUNCTION manage_public_check_in_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Mint a token the first time the feature is enabled
  IF NEW.public_check_in_enabled = true AND NEW.public_check_in_token IS NULL THEN
    NEW.public_check_in_token := generate_public_check_in_token();
  END IF;

  -- NULL the token when disabled. Re-enabling mints a fresh one (automatic rotation).
  IF NEW.public_check_in_enabled = false THEN
    NEW.public_check_in_token := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manage_public_check_in_token
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION manage_public_check_in_token();

-- ============================================================
-- 7. public_check_in_rate_limits
--    Records every submission attempt from a given IP for a given event.
--    The Edge Function queries this table to enforce 5 attempts / 15 min / IP / event.
--    No RLS — only accessed via service_role inside the Edge Function.
-- ============================================================

CREATE TABLE IF NOT EXISTS public_check_in_rate_limits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip           inet        NOT NULL,
  event_id     uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcirl_ip_event_time
  ON public_check_in_rate_limits(ip, event_id, attempted_at);

COMMENT ON TABLE public_check_in_rate_limits IS
  'Per-IP per-event rate-limit log for the public QR check-in Edge Function. '
  'Rows older than 1 hour can be pruned; the Edge Function only queries the last 15 minutes.';

-- ============================================================
-- 8. search_app_users_for_event RPC
--    SECURITY DEFINER so it can read profiles without a public SELECT policy.
--    Caller must be a collective leader or above for the event's collective.
--    Minimum query length 2 chars to prevent enumeration.
-- ============================================================

CREATE OR REPLACE FUNCTION search_app_users_for_event(
  p_event_id   uuid,
  p_query      text,
  p_max_results int DEFAULT 10
)
RETURNS TABLE (
  id           uuid,
  display_name text,
  avatar_url   text,
  email        text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.email
  FROM profiles p
  WHERE length(p_query) >= 2
    AND (
      p.display_name ILIKE '%' || p_query || '%'
      OR p.email ILIKE '%' || p_query || '%'
    )
    AND is_collective_leader_or_above(
          auth.uid(),
          (SELECT e.collective_id FROM events e WHERE e.id = p_event_id)
        )
  ORDER BY p.display_name
  LIMIT p_max_results;
$$;

COMMENT ON FUNCTION search_app_users_for_event(uuid, text, int) IS
  'Leader-gated search across all app users for the "All Members" tab on event-day.tsx. '
  'Requires caller to be collective leader or above. Min query length 2 chars. '
  'Returns all app users (any profile row); leader auth gate provides the access boundary.';
