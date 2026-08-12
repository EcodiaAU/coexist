-- Memberships MVP: member ticket pricing + a seed plan.
--
-- The membership tables (membership_plans, memberships, membership_rewards) and
-- their RLS were created by 034/035 and are ALREADY DEPLOYED with correct role
-- policies (manager/admin + is_admin_or_staff + has_cap('manage_membership')).
-- The 034 FILE on disk still shows the old phantom roles
-- (national_admin/super_admin/national_staff); a later migration fixed the live
-- policies. This migration therefore does NOT touch membership RLS - re-running
-- 034's policies would REGRESS live security to non-existent roles.
--
-- Two additive, harmless changes:
--   1. event_ticket_types.member_price_cents: the campout member-discount source.
--      NULL = no member price (full price for everyone). A value = the price an
--      ACTIVE member pays for this ticket type. The create-checkout event_ticket
--      handler reads it server-side, so a member gets the discount from any
--      surface (web or native) with no membership sold in-app.
--   2. Seed one Co-Exist Membership plan ($20/mo, $250/yr). Stripe price IDs are
--      filled in at Stripe setup / via the admin Plans tab; the join page reads
--      price_monthly/price_yearly for display and stripe_price_* for checkout.

-- 1. Member ticket price column (additive, nullable, no behaviour change until set)
ALTER TABLE event_ticket_types
  ADD COLUMN IF NOT EXISTS member_price_cents integer;

COMMENT ON COLUMN event_ticket_types.member_price_cents IS
  'Price in cents an ACTIVE membership holder pays for this ticket type. NULL = no member discount. Read server-side by create-checkout (event_ticket).';

-- 2. Seed the Co-Exist Membership plan if none exists yet.
INSERT INTO membership_plans (name, description, price_monthly, price_yearly, is_active, sort_order)
SELECT 'Co-Exist Membership',
       'Cheaper campout tickets, plus member perks as they roll out.',
       20, 250, true, 0
WHERE NOT EXISTS (SELECT 1 FROM membership_plans);
