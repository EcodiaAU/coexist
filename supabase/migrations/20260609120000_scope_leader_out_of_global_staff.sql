-- ============================================================
-- Migration: scope 'leader' out of the GLOBAL staff set
-- ============================================================
-- Canonical role model (already encoded in src/lib/capabilities.ts,
-- Tate verbatim 9 May 2026 "leaders can't see or access admin pages"):
--
--   participant / assist_leader / co_leader / leader  -> COLLECTIVE-scoped
--   manager / admin                                   -> GLOBAL staff
--
-- The unified-roles migration (20260413070001) collapsed the legacy
-- national_leader role INTO 'leader', and a separate sync sets
-- profiles.role to a user's HIGHEST collective role. As a result
-- profiles.role = 'leader' now means "leads >=1 collective", NOT
-- "national staff" - there are 0 national_leader rows live.
--
-- is_admin_or_staff() was meant to exclude 'leader' (see 076/078) but
-- the timestamp-named 20260413070001 migration re-added it and won the
-- lexicographic ordering race, so the LIVE function treats every
-- collective leader as global staff. That leaked cross-collective data
-- (e.g. a Hobart leader saw Sydney/Melbourne/Perth events + log-impact
-- tasks, and was auto-added to the national staff chat).
--
-- This migration restores the intended exclusion. It does NOT touch the
-- per-collective RLS (those check collective_members.role scoped by
-- collective_id and are correct), nor the profile-PII tier
-- (is_collective_staff_or_above / get_user_profile_v1), which
-- deliberately lets any leadership-tier viewer see member PII per the
-- 29 Apr 2026 directive.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. is_admin_or_staff: drop 'leader' from the GLOBAL staff set.
--    Called by 167 RLS policies; fixing the one function cascades.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_or_staff(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role::text IN ('national_leader', 'manager', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. National staff chat channel sync.
--    IMPORTANT: channel membership is a DIFFERENT axis from data access. The
--    staff_national channel is the whole-country leadership community, so it
--    includes EVERY leadership tier (assist_leader/co_leader/leader +
--    national_leader/manager/admin) - Tate decision 2026-06-09. Only
--    participants are excluded. (Data-access global-staff = manager/admin
--    only, per is_admin_or_staff above - do not conflate the two.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_national_staff_channel()
RETURNS trigger AS $$
DECLARE
  staff_channel_id uuid;
BEGIN
  SELECT id INTO staff_channel_id
  FROM chat_channels WHERE type = 'staff_national' LIMIT 1;

  IF staff_channel_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.role::text IN ('assist_leader', 'co_leader', 'leader', 'national_leader', 'manager', 'admin') THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    VALUES (staff_channel_id, NEW.id)
    ON CONFLICT DO NOTHING;
  -- Demoted OUT of every leadership tier (e.g. -> participant): evict.
  -- NOTE: the prior guard used `OLD IS NOT NULL`, but in PL/pgSQL a composite
  -- `record IS NOT NULL` is true ONLY when EVERY column is non-null, so any
  -- null profile field made it false and the DELETE never fired - which is
  -- why demoted past-leaders (e.g. Stuti) stayed stale in the channel. Gate
  -- on TG_OP instead so eviction actually runs on demotion.
  ELSIF TG_OP = 'UPDATE'
        AND OLD.role::text IN ('assist_leader', 'co_leader', 'leader', 'national_leader', 'manager', 'admin') THEN
    DELETE FROM chat_channel_members
    WHERE channel_id = staff_channel_id AND user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. Reconcile national channel membership to match the rule above:
--    members of staff_national == exactly the leadership-tier profiles.
--    (a) ADD every leadership-tier profile not yet present (5 today: 2
--        co_leader + 3 assist_leader who predate the trigger covering those
--        tiers, incl. the real Keely/NR leader who is already in).
--    (b) REMOVE everyone who is NOT a leadership tier, i.e. participants.
--        Today that is 3: Stuti (demoted past leader, never evicted due to the
--        trigger bug above), the apple@ecodia.au test account, and the
--        keelydeklerk@coexistaus.org.au DUPLICATE account (her real leader
--        account keelydeklerk@coexistaus.org is a separate 'leader' profile
--        that stays). The duplicate account itself is an identity/merge
--        decision handled separately from this migration.
-- ---------------------------------------------------------------------------
INSERT INTO chat_channel_members (channel_id, user_id)
SELECT ch.id, p.id
FROM chat_channels ch
CROSS JOIN profiles p
WHERE ch.type = 'staff_national'
  AND p.role::text IN ('assist_leader', 'co_leader', 'leader', 'national_leader', 'manager', 'admin')
ON CONFLICT DO NOTHING;

DELETE FROM chat_channel_members ccm
USING chat_channels ch, profiles p
WHERE ccm.channel_id = ch.id
  AND ch.type = 'staff_national'
  AND p.id = ccm.user_id
  AND p.role::text NOT IN ('assist_leader', 'co_leader', 'leader', 'national_leader', 'manager', 'admin');

-- ---------------------------------------------------------------------------
-- NOTE on DELETE policies (events, task_instances): these stay gated by
-- is_admin_or_staff ALONE, i.e. manager/admin only (Tate decision 2026-06-09:
-- "event deletion is only for managers and admin"). Collective leaders keep
-- CREATE + EDIT of their own collective's events/tasks via the existing
-- is_collective_leader_or_above branches on the insert/update policies, but
-- NOT delete. This is intentional - deletion of an event with live
-- registrations is a high-stakes action reserved for global staff.
-- ---------------------------------------------------------------------------
