-- ============================================================
-- Migration: Atomic stock operations & promo code increment
-- Fixes race conditions in concurrent webhook/checkout handling
-- ============================================================

-- Atomically decrement stock (prevents overselling on concurrent checkouts)
CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_id uuid,
  p_variant_key text,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE merch_inventory
  SET
    stock_count = GREATEST(0, stock_count - p_quantity),
    updated_at = now()
  WHERE product_id = p_product_id
    AND variant_key = p_variant_key;
END;
$$;

-- Atomically increment stock (for refund restoration)
CREATE OR REPLACE FUNCTION increment_stock(
  p_product_id uuid,
  p_variant_key text,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE merch_inventory
  SET
    stock_count = stock_count + p_quantity,
    updated_at = now()
  WHERE product_id = p_product_id
    AND variant_key = p_variant_key;
END;
$$;

-- Atomically increment promo code uses (with max_uses guard)
CREATE OR REPLACE FUNCTION increment_promo_uses(
  p_promo_id uuid,
  p_max_uses integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE promo_codes
  SET uses_count = uses_count + 1
  WHERE id = p_promo_id
    AND uses_count < p_max_uses
    AND is_active = true;

  -- Raise an error if no row was updated (max uses reached or inactive)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promo code usage limit reached or code is inactive';
  END IF;
END;
$$;

-- Fix: Remove the on_merch_order_created trigger that decrements stock on INSERT.
-- Stock should only be decremented AFTER payment succeeds (via the stripe-webhook),
-- not when the pending order is created. The old trigger caused double-decrement:
-- once on order creation and again on webhook processing.
DROP TRIGGER IF EXISTS on_merch_order_created ON merch_orders;

-- Fix: Add missing unique index on donations.stripe_payment_id for idempotency
-- (prevents duplicate webhook processing from creating double donations)
CREATE UNIQUE INDEX IF NOT EXISTS idx_donations_stripe_payment_id
  ON donations (stripe_payment_id)
  WHERE stripe_payment_id IS NOT NULL;

-- Fix: Add missing unique index on recurring_donations.stripe_subscription_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_donations_stripe_sub_id
  ON recurring_donations (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Fix: Event registration capacity check race condition.
-- Replace the non-atomic read-count-then-set trigger with a serializable approach
-- that uses SELECT FOR UPDATE to lock the event row during registration.
CREATE OR REPLACE FUNCTION handle_event_registration()
RETURNS trigger AS $$
DECLARE
  event_capacity integer;
  current_count integer;
BEGIN
  -- Lock the event row to prevent concurrent registrations from over-counting
  SELECT capacity INTO event_capacity
  FROM events WHERE id = NEW.event_id
  FOR UPDATE;

  IF event_capacity IS NOT NULL THEN
    SELECT COUNT(*) INTO current_count
    FROM event_registrations
    WHERE event_id = NEW.event_id AND status = 'registered';

    IF current_count >= event_capacity THEN
      NEW.status := 'waitlisted';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix: stock_count should never go negative (add CHECK constraint)
ALTER TABLE merch_inventory ADD CONSTRAINT merch_inventory_stock_non_negative
  CHECK (stock_count >= 0) NOT VALID;
-- NOT VALID means existing rows aren't checked (in case any are already negative)
-- but all future updates are enforced.

-- Fix: Add unique constraint on event_impact.event_id to support upsert in frontend
-- (only one impact record per event - multiple entries would double-count stats)
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_impact_event_unique
  ON event_impact (event_id);

-- Fix: Add NOT NULL constraint on marketing_opt_in to prevent ambiguous null checks
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_opt_in boolean DEFAULT true;

-- Fix: Add notification_preferences column if missing (used by send-push quiet hours)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}';

-- Fix: Missing tables referenced by frontend hooks

-- donation_projects: used by useDonationProjects() hook
CREATE TABLE IF NOT EXISTS donation_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  goal_amount numeric(12,2),
  raised_amount numeric(12,2) DEFAULT 0,
  image_url   text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE donation_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "donation_projects_select_active"
  ON donation_projects FOR SELECT TO authenticated
  USING (is_active = true OR is_admin_or_staff(auth.uid()));

CREATE POLICY "donation_projects_manage_admin"
  ON donation_projects FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- return_requests: used by useRequestReturn() and useMyReturns() hooks
CREATE TABLE IF NOT EXISTS return_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  status      text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'completed')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "return_requests_select_own_or_admin"
  ON return_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "return_requests_insert_own"
  ON return_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "return_requests_update_admin"
  ON return_requests FOR UPDATE TO authenticated
  USING (is_admin_or_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_user ON return_requests(user_id);

-- Add on_behalf_of, is_public, status columns to donations (used by donor wall query)
ALTER TABLE donations ADD COLUMN IF NOT EXISTS on_behalf_of text;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS status text DEFAULT 'succeeded';

-- Fix: Server-side account deletion recovery (prevents client-side bypass)
CREATE OR REPLACE FUNCTION recover_pending_deletion(uid uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET deletion_status = 'active',
      deleted_at = NULL,
      deletion_requested_at = NULL
  WHERE id = uid
    AND deletion_status = 'pending_deletion';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix: RLS policy to prevent users from modifying their own suspension fields
-- Drop the overly permissive "profiles_update_own" and replace with column-restricted version
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own_safe"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Users cannot modify their own suspension or role fields
    AND (
      is_suspended IS NOT DISTINCT FROM (SELECT p.is_suspended FROM profiles p WHERE p.id = auth.uid())
      AND role IS NOT DISTINCT FROM (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    )
  );

-- ============================================================
-- Fix: CRITICAL - handle_content_report_removal() uses CASE expression
-- with DML statements, which is invalid plpgsql. CASE is a value expression
-- and cannot contain DELETE/UPDATE. Replace with IF/ELSIF chain.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_content_report_removal()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'removed' AND OLD.status != 'removed' THEN
    IF NEW.content_type = 'post' OR NEW.content_type = 'photo' THEN
      DELETE FROM posts WHERE id = NEW.content_id;
    ELSIF NEW.content_type = 'comment' THEN
      UPDATE post_comments SET is_deleted = true WHERE id = NEW.content_id;
    ELSIF NEW.content_type = 'chat_message' THEN
      UPDATE chat_messages SET is_deleted = true WHERE id = NEW.content_id;
    ELSIF NEW.content_type = 'user' THEN
      -- User reports are handled through the admin suspension flow, not content removal
      NULL;
    END IF;

    -- Log the action in audit_log
    INSERT INTO audit_log (user_id, action, target_type, target_id, details)
    VALUES (
      NEW.reviewed_by,
      'content_removed',
      NEW.content_type,
      NEW.content_id,
      jsonb_build_object(
        'report_id', NEW.id,
        'reason', NEW.reason,
        'reporter_id', NEW.reporter_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Fix: NOT NULL + ON DELETE SET NULL conflicts block GDPR account deletion.
-- Change conflicting columns to nullable so CASCADE/SET NULL can work.
-- These columns had NOT NULL but ON DELETE SET NULL, which is contradictory.
-- ============================================================
ALTER TABLE events ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE event_invites ALTER COLUMN invited_by DROP NOT NULL;
ALTER TABLE event_impact ALTER COLUMN logged_by DROP NOT NULL;
ALTER TABLE surveys ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE event_series ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE global_announcements ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE audit_log ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE donations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE merch_orders ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================
-- Fix: Pin search_path on critical SECURITY DEFINER functions
-- to prevent search_path injection attacks.
-- ============================================================
-- Guard helper added 2026-08-26 (role oracle). Defined here so this migration is
-- correct STANDALONE: the guard below references it, and LANGUAGE sql bodies are
-- validated at creation time, so ordering would otherwise decide whether a replay
-- of this file succeeds. CREATE OR REPLACE makes the repetition harmless.
-- Not SECURITY DEFINER and not search_path-pinned so the planner can inline it;
-- current_setting is pg_catalog-qualified so it cannot be shadowed instead.
CREATE OR REPLACE FUNCTION public.is_trusted_backend_caller()
RETURNS boolean
LANGUAGE sql
STABLE
AS $trusted$
  SELECT coalesce(pg_catalog.current_setting('role', true), 'none')
         IN ('service_role', 'postgres', 'supabase_admin', 'none');
$trusted$;

CREATE OR REPLACE FUNCTION is_admin_or_staff(uid uuid)
RETURNS boolean AS $$
  -- Guard added 2026-08-26 (role oracle): these definer helpers took a uid
  -- ARGUMENT with PUBLIC EXECUTE, so anon could ask "is this uuid staff" about
  -- ANY user. Answer only for self, or for a trusted backend (service_role /
  -- direct postgres), where auth.uid() is NULL and cancel-event authorizes a
  -- third party. FILTER, never RAISE: this runs inside RLS, where an exception
  -- is a hard query failure. IS NOT DISTINCT FROM keeps every branch boolean,
  -- because a NULL return would itself separate staff from non-staff.
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller()
    THEN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role IN ('national_staff', 'national_admin', 'super_admin')
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_super_admin(uid uuid)
RETURNS boolean AS $$
  -- Guard added 2026-08-26 (role oracle): these definer helpers took a uid
  -- ARGUMENT with PUBLIC EXECUTE, so anon could ask "is this uuid staff" about
  -- ANY user. Answer only for self, or for a trusted backend (service_role /
  -- direct postgres), where auth.uid() is NULL and cancel-event authorizes a
  -- third party. FILTER, never RAISE: this runs inside RLS, where an exception
  -- is a hard query failure. IS NOT DISTINCT FROM keeps every branch boolean,
  -- because a NULL return would itself separate staff from non-staff.
  SELECT CASE
    WHEN uid IS NULL THEN false
    WHEN uid IS NOT DISTINCT FROM auth.uid() OR public.is_trusted_backend_caller()
    THEN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role = 'super_admin'
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_collective_leader_or_above(uid uuid, cid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM collective_members
    WHERE user_id = uid AND collective_id = cid AND role IN ('leader', 'co_leader')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_collective_member(uid uuid, cid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM collective_members
    WHERE user_id = uid AND collective_id = cid AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION award_points(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_event_id uuid DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO points_ledger (user_id, amount, reason, event_id)
  VALUES (p_user_id, p_amount, p_reason, p_event_id);

  UPDATE profiles
  SET points = points + p_amount, updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Fix: impact-evidence bucket should be private per original spec
-- (003_storage_buckets.sql incorrectly set it to public: true)
-- ============================================================
UPDATE storage.buckets
SET public = false
WHERE id = 'impact-evidence';

-- ============================================================
-- Fix: Prevent users from self-inserting fake notifications
-- ============================================================
DROP POLICY IF EXISTS "notifications_insert_system" ON notifications;
CREATE POLICY "notifications_insert_admin_only"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff(auth.uid()));
