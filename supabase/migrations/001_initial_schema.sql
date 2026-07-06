-- ============================================================================
-- Co-Exist App - Complete Database Schema
-- Migration: 001_initial_schema.sql
-- Generated: 2026-03-20
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ---------------------------------------------------------------------------
-- 1. Enum Types (3.2)
-- ---------------------------------------------------------------------------
CREATE TYPE activity_type AS ENUM (
  'tree_planting',
  'beach_cleanup',
  'habitat_restoration',
  'nature_walk',
  'education',
  'wildlife_survey',
  'seed_collecting',
  'weed_removal',
  'waterway_cleanup',
  'community_garden',
  'other'
);

CREATE TYPE user_role AS ENUM (
  'participant',
  'national_staff',
  'national_admin',
  'super_admin'
);

CREATE TYPE event_status AS ENUM (
  'draft',
  'published',
  'cancelled',
  'completed'
);

CREATE TYPE registration_status AS ENUM (
  'registered',
  'waitlisted',
  'cancelled',
  'attended',
  'invited'
);

CREATE TYPE collective_role AS ENUM (
  'member',
  'assist_leader',
  'co_leader',
  'leader'
);

CREATE TYPE order_status AS ENUM (
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
);

CREATE TYPE report_status AS ENUM (
  'pending',
  'approved',
  'removed',
  'dismissed'
);

CREATE TYPE promo_type AS ENUM (
  'percentage',
  'flat',
  'free_shipping'
);

CREATE TYPE announcement_priority AS ENUM (
  'normal',
  'urgent'
);

CREATE TYPE announcement_target AS ENUM (
  'all',
  'leaders',
  'collective_specific'
);

-- ---------------------------------------------------------------------------
-- 2. Tables (3.1.1 - 3.1.41)
-- ---------------------------------------------------------------------------

-- 3.1.1 profiles
CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  pronouns      text,
  bio           text,
  avatar_url    text,
  date_of_birth date,
  location      text,
  location_point geography(Point, 4326),
  phone         text,
  instagram_handle text,
  interests     text[] DEFAULT '{}',
  membership_level text DEFAULT 'Seedling',
  points        integer DEFAULT 0,
  role          user_role DEFAULT 'participant',
  is_suspended  boolean DEFAULT false,
  suspended_reason text,
  suspended_until timestamptz,
  tos_accepted_version text,
  tos_accepted_at timestamptz,
  onboarding_completed boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 3.1.2 collectives
CREATE TABLE collectives (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL,
  slug            text UNIQUE NOT NULL,
  description     text,
  location_point  geography(Point, 4326),
  region          text,
  state           text,
  cover_image_url text,
  leader_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  member_count    integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- 3.1.3 collective_members
CREATE TABLE collective_members (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role          collective_role DEFAULT 'member',
  joined_at     timestamptz DEFAULT now(),
  status        text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  UNIQUE (collective_id, user_id)
);

-- 3.1.4 events
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id   uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  series_id       uuid,  -- FK added after event_series table
  created_by      uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  activity_type   activity_type NOT NULL,
  location_point  geography(Point, 4326),
  address         text,
  date_start      timestamptz NOT NULL,
  date_end        timestamptz,
  capacity        integer,
  cover_image_url text,
  is_public       boolean DEFAULT true,
  status          event_status DEFAULT 'draft',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 3.1.5 event_registrations
CREATE TABLE event_registrations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        registration_status DEFAULT 'registered',
  registered_at timestamptz DEFAULT now(),
  checked_in_at timestamptz,
  invited_at    timestamptz,
  UNIQUE (event_id, user_id)
);

-- 3.1.6 event_invites
CREATE TABLE event_invites (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  collective_id uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  invited_by    uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  message       text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (event_id, collective_id)
);

-- 3.1.7 event_impact
CREATE TABLE event_impact (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id              uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logged_by             uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  trees_planted         integer DEFAULT 0,
  rubbish_kg            numeric(10,2) DEFAULT 0,
  coastline_cleaned_m   numeric(10,2) DEFAULT 0,
  hours_total           numeric(10,2) DEFAULT 0,
  area_restored_sqm     numeric(12,2) DEFAULT 0,
  native_plants         integer DEFAULT 0,
  wildlife_sightings    integer DEFAULT 0,
  custom_metrics        jsonb DEFAULT '{}',
  notes                 text,
  logged_at             timestamptz DEFAULT now()
);

-- 3.1.8 badges
CREATE TABLE badges (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text NOT NULL,
  description  text,
  icon_url     text,
  category     text,
  criteria     jsonb DEFAULT '{}',
  points_value integer DEFAULT 0,
  tier         text CHECK (tier IN ('bronze', 'silver', 'gold')),
  created_at   timestamptz DEFAULT now()
);

-- 3.1.9 user_badges
CREATE TABLE user_badges (
  id       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  UNIQUE (user_id, badge_id)
);

-- 3.1.10 points_ledger
CREATE TABLE points_ledger (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     integer NOT NULL,
  reason     text NOT NULL,
  event_id   uuid REFERENCES events(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 3.1.11 notifications
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  data       jsonb DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3.1.12 posts
CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  collective_id uuid REFERENCES collectives(id) ON DELETE SET NULL,
  event_id      uuid REFERENCES events(id) ON DELETE SET NULL,
  content       text,
  images        text[] DEFAULT '{}',
  type          text DEFAULT 'photo' CHECK (type IN ('photo', 'milestone', 'event_recap', 'announcement')),
  created_at    timestamptz DEFAULT now()
);

-- 3.1.13 post_likes
CREATE TABLE post_likes (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- 3.1.14 chat_messages
CREATE TABLE chat_messages (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content       text,
  image_url     text,
  voice_url     text,
  video_url     text,
  reply_to_id   uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  is_pinned     boolean DEFAULT false,
  is_deleted    boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

-- 3.1.15 chat_read_receipts
CREATE TABLE chat_read_receipts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at  timestamptz DEFAULT now(),
  UNIQUE (collective_id, user_id)
);

-- 3.1.16 surveys
CREATE TABLE surveys (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  title      text NOT NULL,
  questions  jsonb NOT NULL DEFAULT '[]',
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3.1.17 survey_responses
CREATE TABLE survey_responses (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id    uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers      jsonb NOT NULL DEFAULT '{}',
  submitted_at timestamptz DEFAULT now(),
  UNIQUE (survey_id, user_id)
);

-- 3.1.18 partner_offers
CREATE TABLE partner_offers (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_name text NOT NULL,
  description  text,
  offer_details text,
  code         text,
  image_url    text,
  points_cost  integer DEFAULT 0,
  valid_from   timestamptz,
  valid_to     timestamptz,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- 3.1.19 offer_redemptions
CREATE TABLE offer_redemptions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id    uuid NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  redeemed_at timestamptz DEFAULT now()
);

-- 3.1.20 challenges
CREATE TABLE challenges (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           text NOT NULL,
  description     text,
  cover_image_url text,
  start_date      timestamptz NOT NULL,
  end_date        timestamptz NOT NULL,
  goal_type       text NOT NULL,
  goal_value      numeric(12,2) NOT NULL,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- 3.1.21 challenge_participants
CREATE TABLE challenge_participants (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id  uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  collective_id uuid REFERENCES collectives(id) ON DELETE CASCADE,
  progress      numeric(12,2) DEFAULT 0,
  joined_at     timestamptz DEFAULT now(),
  CHECK (user_id IS NOT NULL OR collective_id IS NOT NULL)
);

-- 3.1.22 donations
CREATE TABLE donations (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  amount            numeric(10,2) NOT NULL,
  currency          text DEFAULT 'AUD',
  stripe_payment_id text,
  project_name      text,
  message           text,
  created_at        timestamptz DEFAULT now()
);

-- 3.1.23 merch_products
CREATE TABLE merch_products (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL,
  description     text,
  price           numeric(10,2) NOT NULL,
  images          text[] DEFAULT '{}',
  variants        jsonb DEFAULT '[]',
  is_active       boolean DEFAULT true,
  stripe_price_id text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 3.1.24 merch_inventory
CREATE TABLE merch_inventory (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id          uuid NOT NULL REFERENCES merch_products(id) ON DELETE CASCADE,
  variant_key         text NOT NULL,
  stock_count         integer DEFAULT 0,
  low_stock_threshold integer DEFAULT 5,
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (product_id, variant_key)
);

-- 3.1.25 merch_orders
CREATE TABLE merch_orders (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  items             jsonb NOT NULL DEFAULT '[]',
  total             numeric(10,2) NOT NULL,
  stripe_payment_id text,
  shipping_address  jsonb DEFAULT '{}',
  status            order_status DEFAULT 'pending',
  tracking_number   text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- 3.1.26 invites (referrals)
CREATE TABLE invites (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  inviter_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invitee_email text NOT NULL,
  code          text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  status        text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at    timestamptz DEFAULT now()
);

-- 3.1.27 global_announcements
CREATE TABLE global_announcements (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  content               text NOT NULL,
  image_url             text,
  priority              announcement_priority DEFAULT 'normal',
  target_audience       announcement_target DEFAULT 'all',
  target_collective_id  uuid REFERENCES collectives(id) ON DELETE SET NULL,
  is_pinned             boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- 3.1.28 announcement_reads
CREATE TABLE announcement_reads (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id uuid NOT NULL REFERENCES global_announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         timestamptz DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

-- 3.1.29 staff_roles
CREATE TABLE staff_roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  permissions jsonb NOT NULL DEFAULT '{}',
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

-- 3.1.30 audit_log
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text,
  target_id   uuid,
  details     jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- 3.1.31 organisations
CREATE TABLE organisations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  logo_url      text,
  website       text,
  type          text CHECK (type IN ('corporate', 'ngo', 'government', 'community')),
  contact_name  text,
  contact_email text,
  description   text,
  created_at    timestamptz DEFAULT now()
);

-- 3.1.32 event_organisations
CREATE TABLE event_organisations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role            text CHECK (role IN ('co_host', 'sponsor', 'partner')),
  UNIQUE (event_id, organisation_id)
);

-- 3.1.33 promo_codes
CREATE TABLE promo_codes (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code             text UNIQUE NOT NULL,
  type             promo_type NOT NULL,
  value            numeric(10,2) NOT NULL,
  min_order_amount numeric(10,2) DEFAULT 0,
  max_uses         integer,
  uses_count       integer DEFAULT 0,
  valid_from       timestamptz,
  valid_to         timestamptz,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- 3.1.34 product_reviews
CREATE TABLE product_reviews (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  uuid NOT NULL REFERENCES merch_products(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  is_approved boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (product_id, user_id)
);

-- 3.1.35 feature_flags
CREATE TABLE feature_flags (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key                text UNIQUE NOT NULL,
  enabled            boolean DEFAULT false,
  target_collectives text[],
  description        text,
  updated_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at         timestamptz DEFAULT now()
);

-- 3.1.36 post_comments
CREATE TABLE post_comments (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 3.1.37 content_reports
CREATE TABLE content_reports (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('post', 'comment', 'photo', 'chat_message')),
  content_id   uuid NOT NULL,
  reason       text NOT NULL,
  status       report_status DEFAULT 'pending',
  reviewed_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- 3.1.38 recurring_donations
CREATE TABLE recurring_donations (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE NOT NULL,
  amount                 numeric(10,2) NOT NULL,
  currency               text DEFAULT 'AUD',
  status                 text DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'paused')),
  created_at             timestamptz DEFAULT now(),
  cancelled_at           timestamptz
);

-- 3.1.39 event_series
CREATE TABLE event_series (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id   uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  title_template  text NOT NULL,
  recurrence_rule jsonb NOT NULL DEFAULT '{}',
  created_by      uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

-- Add FK from events to event_series now that the table exists
ALTER TABLE events ADD CONSTRAINT events_series_id_fkey
  FOREIGN KEY (series_id) REFERENCES event_series(id) ON DELETE SET NULL;

-- 3.1.40 impact_species
CREATE TABLE impact_species (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_impact_id uuid NOT NULL REFERENCES event_impact(id) ON DELETE CASCADE,
  species_name    text NOT NULL,
  count           integer DEFAULT 1,
  is_native       boolean DEFAULT true
);

-- 3.1.41 impact_areas
CREATE TABLE impact_areas (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_impact_id uuid NOT NULL REFERENCES event_impact(id) ON DELETE CASCADE,
  polygon         geometry(Polygon, 4326) NOT NULL,
  area_sqm        numeric(12,2)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- profiles
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_location ON profiles USING GIST (location_point);
CREATE INDEX idx_profiles_membership ON profiles(membership_level);

-- collectives
CREATE INDEX idx_collectives_location ON collectives USING GIST (location_point);
CREATE INDEX idx_collectives_slug ON collectives(slug);
CREATE INDEX idx_collectives_leader ON collectives(leader_id);
CREATE INDEX idx_collectives_state ON collectives(state);

-- collective_members
CREATE INDEX idx_collective_members_collective ON collective_members(collective_id);
CREATE INDEX idx_collective_members_user ON collective_members(user_id);
CREATE INDEX idx_collective_members_role ON collective_members(role);

-- events
CREATE INDEX idx_events_collective ON events(collective_id);
CREATE INDEX idx_events_created_by ON events(created_by);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_date_start ON events(date_start);
CREATE INDEX idx_events_activity_type ON events(activity_type);
CREATE INDEX idx_events_location ON events USING GIST (location_point);
CREATE INDEX idx_events_series ON events(series_id);

-- event_registrations
CREATE INDEX idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX idx_event_registrations_user ON event_registrations(user_id);
CREATE INDEX idx_event_registrations_status ON event_registrations(status);

-- event_invites
CREATE INDEX idx_event_invites_event ON event_invites(event_id);
CREATE INDEX idx_event_invites_collective ON event_invites(collective_id);

-- event_impact
CREATE INDEX idx_event_impact_event ON event_impact(event_id);
CREATE INDEX idx_event_impact_logged_by ON event_impact(logged_by);

-- badges
CREATE INDEX idx_badges_category ON badges(category);

-- user_badges
CREATE INDEX idx_user_badges_user ON user_badges(user_id);
CREATE INDEX idx_user_badges_badge ON user_badges(badge_id);

-- points_ledger
CREATE INDEX idx_points_ledger_user ON points_ledger(user_id);
CREATE INDEX idx_points_ledger_created ON points_ledger(created_at);

-- notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- posts
CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_collective ON posts(collective_id);
CREATE INDEX idx_posts_event ON posts(event_id);
CREATE INDEX idx_posts_created ON posts(created_at);

-- post_likes
CREATE INDEX idx_post_likes_post ON post_likes(post_id);
CREATE INDEX idx_post_likes_user ON post_likes(user_id);

-- post_comments
CREATE INDEX idx_post_comments_post ON post_comments(post_id);
CREATE INDEX idx_post_comments_user ON post_comments(user_id);

-- chat_messages
CREATE INDEX idx_chat_messages_collective ON chat_messages(collective_id);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX idx_chat_messages_reply ON chat_messages(reply_to_id);

-- chat_read_receipts
CREATE INDEX idx_chat_read_receipts_collective ON chat_read_receipts(collective_id);
CREATE INDEX idx_chat_read_receipts_user ON chat_read_receipts(user_id);

-- surveys
CREATE INDEX idx_surveys_event ON surveys(event_id);

-- survey_responses
CREATE INDEX idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX idx_survey_responses_user ON survey_responses(user_id);

-- partner_offers
CREATE INDEX idx_partner_offers_active ON partner_offers(is_active);

-- offer_redemptions
CREATE INDEX idx_offer_redemptions_offer ON offer_redemptions(offer_id);
CREATE INDEX idx_offer_redemptions_user ON offer_redemptions(user_id);

-- challenges
CREATE INDEX idx_challenges_active ON challenges(is_active);
CREATE INDEX idx_challenges_dates ON challenges(start_date, end_date);

-- challenge_participants
CREATE INDEX idx_challenge_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX idx_challenge_participants_user ON challenge_participants(user_id);
CREATE INDEX idx_challenge_participants_collective ON challenge_participants(collective_id);

-- donations
CREATE INDEX idx_donations_user ON donations(user_id);
CREATE INDEX idx_donations_created ON donations(created_at);

-- recurring_donations
CREATE INDEX idx_recurring_donations_user ON recurring_donations(user_id);
CREATE INDEX idx_recurring_donations_status ON recurring_donations(status);

-- merch_products
CREATE INDEX idx_merch_products_active ON merch_products(is_active);

-- merch_inventory
CREATE INDEX idx_merch_inventory_product ON merch_inventory(product_id);

-- merch_orders
CREATE INDEX idx_merch_orders_user ON merch_orders(user_id);
CREATE INDEX idx_merch_orders_status ON merch_orders(status);
CREATE INDEX idx_merch_orders_created ON merch_orders(created_at);

-- invites
CREATE INDEX idx_invites_inviter ON invites(inviter_id);
CREATE INDEX idx_invites_code ON invites(code);

-- global_announcements
CREATE INDEX idx_announcements_created ON global_announcements(created_at);
CREATE INDEX idx_announcements_target ON global_announcements(target_audience);
CREATE INDEX idx_announcements_pinned ON global_announcements(is_pinned);

-- announcement_reads
CREATE INDEX idx_announcement_reads_announcement ON announcement_reads(announcement_id);
CREATE INDEX idx_announcement_reads_user ON announcement_reads(user_id);

-- staff_roles
CREATE INDEX idx_staff_roles_user ON staff_roles(user_id);

-- audit_log
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);

-- organisations
CREATE INDEX idx_organisations_type ON organisations(type);

-- event_organisations
CREATE INDEX idx_event_organisations_event ON event_organisations(event_id);
CREATE INDEX idx_event_organisations_org ON event_organisations(organisation_id);

-- promo_codes
CREATE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_promo_codes_active ON promo_codes(is_active);

-- product_reviews
CREATE INDEX idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX idx_product_reviews_user ON product_reviews(user_id);

-- content_reports
CREATE INDEX idx_content_reports_status ON content_reports(status);
CREATE INDEX idx_content_reports_type ON content_reports(content_type, content_id);

-- impact_species
CREATE INDEX idx_impact_species_impact ON impact_species(event_impact_id);

-- impact_areas
CREATE INDEX idx_impact_areas_impact ON impact_areas(event_impact_id);
CREATE INDEX idx_impact_areas_polygon ON impact_areas USING GIST (polygon);

-- event_series
CREATE INDEX idx_event_series_collective ON event_series(collective_id);

-- feature_flags
CREATE INDEX idx_feature_flags_key ON feature_flags(key);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security (3.3)
-- ---------------------------------------------------------------------------

-- Enable RLS on ALL tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE collectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE collective_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_impact ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE impact_species ENABLE ROW LEVEL SECURITY;
ALTER TABLE impact_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;

-- -------------------------
-- Helper: check if user is admin/staff
-- -------------------------
CREATE OR REPLACE FUNCTION is_admin_or_staff(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role IN ('national_staff', 'national_admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_super_admin(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_collective_leader_or_above(uid uuid, cid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM collective_members
    WHERE user_id = uid AND collective_id = cid AND role IN ('leader', 'co_leader')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_collective_member(uid uuid, cid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM collective_members
    WHERE user_id = uid AND collective_id = cid AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- -------------------------
-- profiles policies
-- -------------------------
CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- collectives policies
-- -------------------------
CREATE POLICY "collectives_select_all"
  ON collectives FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "collectives_insert_admin"
  ON collectives FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "collectives_update_leader"
  ON collectives FOR UPDATE TO authenticated
  USING (
    leader_id = auth.uid()
    OR is_collective_leader_or_above(auth.uid(), id)
    OR is_admin_or_staff(auth.uid())
  );

-- -------------------------
-- collective_members policies
-- -------------------------
CREATE POLICY "collective_members_select_member"
  ON collective_members FOR SELECT TO authenticated
  USING (
    is_collective_member(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "collective_members_insert_self"
  ON collective_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "collective_members_update_leader"
  ON collective_members FOR UPDATE TO authenticated
  USING (
    is_collective_leader_or_above(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "collective_members_delete_self_or_leader"
  ON collective_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_collective_leader_or_above(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

-- -------------------------
-- events policies
-- -------------------------
CREATE POLICY "events_select_public"
  ON events FOR SELECT TO authenticated
  USING (
    is_public = true
    OR is_collective_member(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "events_insert_leader"
  ON events FOR INSERT TO authenticated
  WITH CHECK (
    is_collective_leader_or_above(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "events_update_leader"
  ON events FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR is_collective_leader_or_above(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "events_delete_admin"
  ON events FOR DELETE TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- event_registrations policies
-- -------------------------
CREATE POLICY "registrations_select_own_or_leader"
  ON event_registrations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_collective_leader_or_above(auth.uid(), e.collective_id)
    )
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "registrations_insert_own"
  ON event_registrations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "registrations_update_own_or_leader"
  ON event_registrations FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_collective_leader_or_above(auth.uid(), e.collective_id)
    )
    OR is_admin_or_staff(auth.uid())
  );

-- -------------------------
-- event_invites policies
-- -------------------------
CREATE POLICY "event_invites_select_member"
  ON event_invites FOR SELECT TO authenticated
  USING (
    is_collective_member(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "event_invites_insert_leader"
  ON event_invites FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_collective_leader_or_above(auth.uid(), e.collective_id)
    )
    OR is_admin_or_staff(auth.uid())
  );

-- -------------------------
-- event_impact policies
-- -------------------------
CREATE POLICY "event_impact_select_all"
  ON event_impact FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "event_impact_insert_leader"
  ON event_impact FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND (
        is_collective_leader_or_above(auth.uid(), e.collective_id)
        OR EXISTS (
          SELECT 1 FROM collective_members cm
          WHERE cm.user_id = auth.uid() AND cm.collective_id = e.collective_id
            AND cm.role IN ('leader', 'co_leader', 'assist_leader')
        )
      )
    )
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "event_impact_update_leader"
  ON event_impact FOR UPDATE TO authenticated
  USING (
    logged_by = auth.uid()
    OR is_admin_or_staff(auth.uid())
  );

-- -------------------------
-- badges policies
-- -------------------------
CREATE POLICY "badges_select_all"
  ON badges FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "badges_manage_admin"
  ON badges FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- user_badges policies
-- -------------------------
CREATE POLICY "user_badges_select_all"
  ON user_badges FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_badges_insert_system"
  ON user_badges FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff(auth.uid()));

-- -------------------------
-- points_ledger policies
-- -------------------------
CREATE POLICY "points_select_own"
  ON points_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- -------------------------
-- notifications policies
-- -------------------------
CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_insert_system"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff(auth.uid()) OR user_id = auth.uid());

-- -------------------------
-- posts policies
-- -------------------------
CREATE POLICY "posts_select_authenticated"
  ON posts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "posts_insert_own"
  ON posts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "posts_update_own"
  ON posts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "posts_delete_own_or_admin"
  ON posts FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- -------------------------
-- post_likes policies
-- -------------------------
CREATE POLICY "post_likes_select_all"
  ON post_likes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "post_likes_insert_own"
  ON post_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "post_likes_delete_own"
  ON post_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -------------------------
-- post_comments policies
-- -------------------------
CREATE POLICY "post_comments_select_all"
  ON post_comments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "post_comments_insert_own"
  ON post_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "post_comments_update_own"
  ON post_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "post_comments_delete_own_or_admin"
  ON post_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- -------------------------
-- chat_messages policies
-- -------------------------
CREATE POLICY "chat_select_member"
  ON chat_messages FOR SELECT TO authenticated
  USING (is_collective_member(auth.uid(), collective_id));

CREATE POLICY "chat_insert_member"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_collective_member(auth.uid(), collective_id)
  );

CREATE POLICY "chat_update_leader"
  ON chat_messages FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM collective_members cm
      WHERE cm.user_id = auth.uid() AND cm.collective_id = chat_messages.collective_id
        AND cm.role IN ('leader', 'co_leader', 'assist_leader')
    )
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "chat_delete_leader"
  ON chat_messages FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collective_members cm
      WHERE cm.user_id = auth.uid() AND cm.collective_id = chat_messages.collective_id
        AND cm.role IN ('leader', 'co_leader', 'assist_leader')
    )
    OR is_admin_or_staff(auth.uid())
  );

-- -------------------------
-- chat_read_receipts policies
-- -------------------------
CREATE POLICY "chat_receipts_own"
  ON chat_read_receipts FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- -------------------------
-- surveys policies
-- -------------------------
CREATE POLICY "surveys_select_authenticated"
  ON surveys FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "surveys_insert_leader"
  ON surveys FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_collective_leader_or_above(auth.uid(), e.collective_id)
    )
    OR is_admin_or_staff(auth.uid())
  );

-- -------------------------
-- survey_responses policies
-- -------------------------
CREATE POLICY "survey_responses_select_own_or_leader"
  ON survey_responses FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_staff(auth.uid())
  );

CREATE POLICY "survey_responses_insert_own"
  ON survey_responses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -------------------------
-- partner_offers policies
-- -------------------------
CREATE POLICY "partner_offers_select_authenticated"
  ON partner_offers FOR SELECT TO authenticated
  USING (is_active = true OR is_admin_or_staff(auth.uid()));

CREATE POLICY "partner_offers_manage_admin"
  ON partner_offers FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- offer_redemptions policies
-- -------------------------
CREATE POLICY "offer_redemptions_select_own"
  ON offer_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "offer_redemptions_insert_own"
  ON offer_redemptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -------------------------
-- challenges policies
-- -------------------------
CREATE POLICY "challenges_select_authenticated"
  ON challenges FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "challenges_manage_admin"
  ON challenges FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- challenge_participants policies
-- -------------------------
CREATE POLICY "challenge_participants_select_all"
  ON challenge_participants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "challenge_participants_insert_own"
  ON challenge_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -------------------------
-- donations policies
-- -------------------------
CREATE POLICY "donations_select_own_or_admin"
  ON donations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "donations_insert_own"
  ON donations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -------------------------
-- recurring_donations policies
-- -------------------------
CREATE POLICY "recurring_donations_select_own_or_admin"
  ON recurring_donations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "recurring_donations_insert_own"
  ON recurring_donations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recurring_donations_update_own"
  ON recurring_donations FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- -------------------------
-- merch_products policies
-- -------------------------
CREATE POLICY "merch_products_select_all"
  ON merch_products FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "merch_products_manage_admin"
  ON merch_products FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- merch_inventory policies
-- -------------------------
CREATE POLICY "merch_inventory_select_all"
  ON merch_inventory FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "merch_inventory_manage_admin"
  ON merch_inventory FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- merch_orders policies
-- -------------------------
CREATE POLICY "merch_orders_select_own_or_admin"
  ON merch_orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "merch_orders_insert_own"
  ON merch_orders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "merch_orders_update_admin"
  ON merch_orders FOR UPDATE TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- invites policies
-- -------------------------
CREATE POLICY "invites_select_own"
  ON invites FOR SELECT TO authenticated
  USING (inviter_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "invites_insert_own"
  ON invites FOR INSERT TO authenticated
  WITH CHECK (inviter_id = auth.uid());

-- -------------------------
-- global_announcements policies
-- -------------------------
CREATE POLICY "announcements_select_authenticated"
  ON global_announcements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "announcements_manage_staff"
  ON global_announcements FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- announcement_reads policies
-- -------------------------
CREATE POLICY "announcement_reads_own"
  ON announcement_reads FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- -------------------------
-- staff_roles policies
-- -------------------------
CREATE POLICY "staff_roles_select_super_admin"
  ON staff_roles FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "staff_roles_manage_super_admin"
  ON staff_roles FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- -------------------------
-- audit_log policies
-- -------------------------
CREATE POLICY "audit_log_select_super_admin"
  ON audit_log FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "audit_log_insert_admin"
  ON audit_log FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff(auth.uid()));

-- -------------------------
-- organisations policies
-- -------------------------
CREATE POLICY "organisations_select_all"
  ON organisations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "organisations_manage_admin"
  ON organisations FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- event_organisations policies
-- -------------------------
CREATE POLICY "event_organisations_select_all"
  ON event_organisations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "event_organisations_manage_leader"
  ON event_organisations FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_collective_leader_or_above(auth.uid(), e.collective_id)
    )
    OR is_admin_or_staff(auth.uid())
  );

-- -------------------------
-- promo_codes policies
-- -------------------------
CREATE POLICY "promo_codes_select_active"
  ON promo_codes FOR SELECT TO authenticated
  USING (is_active = true OR is_admin_or_staff(auth.uid()));

CREATE POLICY "promo_codes_manage_admin"
  ON promo_codes FOR ALL TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- product_reviews policies
-- -------------------------
CREATE POLICY "product_reviews_select_all"
  ON product_reviews FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "product_reviews_insert_own"
  ON product_reviews FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "product_reviews_update_own"
  ON product_reviews FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_staff(auth.uid()));

-- -------------------------
-- feature_flags policies
-- -------------------------
CREATE POLICY "feature_flags_select_all"
  ON feature_flags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "feature_flags_manage_super_admin"
  ON feature_flags FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- -------------------------
-- content_reports policies
-- -------------------------
CREATE POLICY "content_reports_insert_own"
  ON content_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "content_reports_select_admin"
  ON content_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR is_admin_or_staff(auth.uid()));

CREATE POLICY "content_reports_update_admin"
  ON content_reports FOR UPDATE TO authenticated
  USING (is_admin_or_staff(auth.uid()));

-- -------------------------
-- impact_species policies
-- -------------------------
CREATE POLICY "impact_species_select_all"
  ON impact_species FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "impact_species_insert_leader"
  ON impact_species FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_impact ei
      JOIN events e ON e.id = ei.event_id
      WHERE ei.id = event_impact_id
        AND (is_collective_leader_or_above(auth.uid(), e.collective_id) OR is_admin_or_staff(auth.uid()))
    )
  );

-- -------------------------
-- impact_areas policies
-- -------------------------
CREATE POLICY "impact_areas_select_all"
  ON impact_areas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "impact_areas_insert_leader"
  ON impact_areas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_impact ei
      JOIN events e ON e.id = ei.event_id
      WHERE ei.id = event_impact_id
        AND (is_collective_leader_or_above(auth.uid(), e.collective_id) OR is_admin_or_staff(auth.uid()))
    )
  );

-- -------------------------
-- event_series policies
-- -------------------------
CREATE POLICY "event_series_select_all"
  ON event_series FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "event_series_manage_leader"
  ON event_series FOR ALL TO authenticated
  USING (
    is_collective_leader_or_above(auth.uid(), collective_id)
    OR is_admin_or_staff(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. Database Functions & Triggers (3.4)
-- ---------------------------------------------------------------------------

-- 3.4.1 Trigger: auto-create profiles row on auth.users insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 3.4.2 get_user_impact_stats
CREATE OR REPLACE FUNCTION get_user_impact_stats(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'events_attended', COUNT(DISTINCT er.event_id),
    'trees_planted', COALESCE(SUM(ei.trees_planted), 0),
    'rubbish_kg', COALESCE(SUM(ei.rubbish_kg), 0),
    'coastline_cleaned_m', COALESCE(SUM(ei.coastline_cleaned_m), 0),
    'hours_volunteered', COALESCE(SUM(ei.hours_total), 0),
    'area_restored_sqm', COALESCE(SUM(ei.area_restored_sqm), 0),
    'native_plants', COALESCE(SUM(ei.native_plants), 0),
    'wildlife_sightings', COALESCE(SUM(ei.wildlife_sightings), 0)
  ) INTO result
  FROM event_registrations er
  JOIN events e ON e.id = er.event_id
  LEFT JOIN event_impact ei ON ei.event_id = e.id
  WHERE er.user_id = p_user_id AND er.status = 'attended';

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3.4.3 get_collective_stats
CREATE OR REPLACE FUNCTION get_collective_stats(p_collective_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'member_count', (SELECT COUNT(*) FROM collective_members WHERE collective_id = p_collective_id AND status = 'active'),
    'event_count', (SELECT COUNT(*) FROM events WHERE collective_id = p_collective_id AND status = 'completed'),
    'trees_planted', COALESCE(SUM(ei.trees_planted), 0),
    'rubbish_kg', COALESCE(SUM(ei.rubbish_kg), 0),
    'coastline_cleaned_m', COALESCE(SUM(ei.coastline_cleaned_m), 0),
    'hours_total', COALESCE(SUM(ei.hours_total), 0),
    'area_restored_sqm', COALESCE(SUM(ei.area_restored_sqm), 0),
    'native_plants', COALESCE(SUM(ei.native_plants), 0)
  ) INTO result
  FROM events e
  LEFT JOIN event_impact ei ON ei.event_id = e.id
  WHERE e.collective_id = p_collective_id AND e.status = 'completed';

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3.4.4 get_national_stats
CREATE OR REPLACE FUNCTION get_national_stats()
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_volunteers', (SELECT COUNT(*) FROM profiles),
    'total_collectives', (SELECT COUNT(*) FROM collectives WHERE is_active = true),
    'total_events', (SELECT COUNT(*) FROM events WHERE status = 'completed'),
    'trees_planted', COALESCE(SUM(trees_planted), 0),
    'rubbish_kg', COALESCE(SUM(rubbish_kg), 0),
    'coastline_cleaned_m', COALESCE(SUM(coastline_cleaned_m), 0),
    'hours_total', COALESCE(SUM(hours_total), 0),
    'area_restored_sqm', COALESCE(SUM(area_restored_sqm), 0),
    'native_plants', COALESCE(SUM(native_plants), 0),
    'wildlife_sightings', COALESCE(SUM(wildlife_sightings), 0)
  ) INTO result
  FROM event_impact;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3.4.5 award_points
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.4.6 check_badge_criteria
CREATE OR REPLACE FUNCTION check_badge_criteria(p_user_id uuid)
RETURNS SETOF uuid AS $$
DECLARE
  badge_rec RECORD;
  stats jsonb;
  events_count integer;
  already_has boolean;
BEGIN
  stats := get_user_impact_stats(p_user_id);
  events_count := (stats->>'events_attended')::integer;

  FOR badge_rec IN SELECT * FROM badges LOOP
    -- Check if already earned
    SELECT EXISTS (
      SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_id = badge_rec.id
    ) INTO already_has;

    IF NOT already_has THEN
      -- Check criteria (JSONB pattern: {"min_events": 5} or {"min_trees": 100})
      IF (badge_rec.criteria ? 'min_events' AND events_count >= (badge_rec.criteria->>'min_events')::integer)
         OR (badge_rec.criteria ? 'min_trees' AND (stats->>'trees_planted')::integer >= (badge_rec.criteria->>'min_trees')::integer)
         OR (badge_rec.criteria ? 'min_rubbish_kg' AND (stats->>'rubbish_kg')::numeric >= (badge_rec.criteria->>'min_rubbish_kg')::numeric)
         OR (badge_rec.criteria ? 'min_hours' AND (stats->>'hours_volunteered')::numeric >= (badge_rec.criteria->>'min_hours')::numeric)
      THEN
        INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, badge_rec.id);
        PERFORM award_points(p_user_id, badge_rec.points_value, 'Badge earned: ' || badge_rec.name);
        RETURN NEXT badge_rec.id;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.4.7 Trigger: event registration capacity check + auto-waitlist
CREATE OR REPLACE FUNCTION handle_event_registration()
RETURNS trigger AS $$
DECLARE
  event_capacity integer;
  current_count integer;
BEGIN
  SELECT capacity INTO event_capacity
  FROM events WHERE id = NEW.event_id;

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

CREATE TRIGGER on_event_registration
  BEFORE INSERT ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION handle_event_registration();

-- 3.4.8 Trigger: on cancel → promote waitlist
CREATE OR REPLACE FUNCTION handle_registration_cancel()
RETURNS trigger AS $$
DECLARE
  next_waitlisted uuid;
BEGIN
  IF OLD.status = 'registered' AND NEW.status = 'cancelled' THEN
    SELECT id INTO next_waitlisted
    FROM event_registrations
    WHERE event_id = OLD.event_id AND status = 'waitlisted'
    ORDER BY registered_at ASC
    LIMIT 1;

    IF next_waitlisted IS NOT NULL THEN
      UPDATE event_registrations
      SET status = 'registered'
      WHERE id = next_waitlisted;

      -- Notify the promoted user
      INSERT INTO notifications (user_id, type, title, body, data)
      SELECT user_id, 'waitlist_promoted',
        'You''re in!',
        'A spot opened up for an event you were waitlisted for.',
        jsonb_build_object('event_id', OLD.event_id)
      FROM event_registrations WHERE id = next_waitlisted;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_registration_cancel
  AFTER UPDATE ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION handle_registration_cancel();

-- 3.4.9 get_leaderboard (members within a collective)
CREATE OR REPLACE FUNCTION get_leaderboard(
  p_collective_id uuid,
  p_period text DEFAULT 'all_time'
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  total_points bigint,
  events_attended bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    COALESCE(SUM(pl.amount), 0)::bigint AS total_points,
    COUNT(DISTINCT er.event_id)::bigint AS events_attended
  FROM profiles p
  JOIN collective_members cm ON cm.user_id = p.id
  LEFT JOIN points_ledger pl ON pl.user_id = p.id
    AND (p_period = 'all_time'
      OR (p_period = 'month' AND pl.created_at >= date_trunc('month', now()))
      OR (p_period = 'year' AND pl.created_at >= date_trunc('year', now()))
    )
  LEFT JOIN event_registrations er ON er.user_id = p.id AND er.status = 'attended'
  WHERE cm.collective_id = p_collective_id AND cm.status = 'active'
  GROUP BY p.id, p.display_name, p.avatar_url
  ORDER BY total_points DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3.4.10 get_collective_leaderboard (collectives ranked nationally)
CREATE OR REPLACE FUNCTION get_collective_leaderboard(
  p_period text DEFAULT 'all_time'
)
RETURNS TABLE (
  collective_id uuid,
  collective_name text,
  cover_image_url text,
  total_events bigint,
  total_trees bigint,
  total_rubbish_kg numeric,
  total_hours numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.cover_image_url,
    COUNT(DISTINCT e.id)::bigint,
    COALESCE(SUM(ei.trees_planted), 0)::bigint,
    COALESCE(SUM(ei.rubbish_kg), 0),
    COALESCE(SUM(ei.hours_total), 0)
  FROM collectives c
  LEFT JOIN events e ON e.collective_id = c.id AND e.status = 'completed'
    AND (p_period = 'all_time'
      OR (p_period = 'month' AND e.date_start >= date_trunc('month', now()))
      OR (p_period = 'year' AND e.date_start >= date_trunc('year', now()))
    )
  LEFT JOIN event_impact ei ON ei.event_id = e.id
  WHERE c.is_active = true
  GROUP BY c.id, c.name, c.cover_image_url
  ORDER BY total_trees DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3.4.11 get_charity_impact_report
CREATE OR REPLACE FUNCTION get_charity_impact_report(
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_scope text DEFAULT 'national'
)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', p_date_from, 'to', p_date_to),
    'scope', p_scope,
    'total_events', COUNT(DISTINCT e.id),
    'total_participants', COUNT(DISTINCT er.user_id),
    'trees_planted', COALESCE(SUM(ei.trees_planted), 0),
    'rubbish_kg', COALESCE(SUM(ei.rubbish_kg), 0),
    'coastline_cleaned_m', COALESCE(SUM(ei.coastline_cleaned_m), 0),
    'hours_volunteered', COALESCE(SUM(ei.hours_total), 0),
    'area_restored_sqm', COALESCE(SUM(ei.area_restored_sqm), 0),
    'native_plants', COALESCE(SUM(ei.native_plants), 0),
    'wildlife_sightings', COALESCE(SUM(ei.wildlife_sightings), 0),
    'unique_species', (
      SELECT COUNT(DISTINCT species_name)
      FROM impact_species isp
      JOIN event_impact ei2 ON ei2.id = isp.event_impact_id
      JOIN events e2 ON e2.id = ei2.event_id
      WHERE e2.date_start BETWEEN p_date_from AND p_date_to
    ),
    'collectives_active', (
      SELECT COUNT(DISTINCT e3.collective_id)
      FROM events e3
      WHERE e3.date_start BETWEEN p_date_from AND p_date_to AND e3.status = 'completed'
    )
  ) INTO result
  FROM events e
  LEFT JOIN event_impact ei ON ei.event_id = e.id
  LEFT JOIN event_registrations er ON er.event_id = e.id AND er.status = 'attended'
  WHERE e.status = 'completed'
    AND e.date_start BETWEEN p_date_from AND p_date_to;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3.4.12 Trigger: merch order → decrement inventory
CREATE OR REPLACE FUNCTION handle_merch_order()
RETURNS trigger AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
  LOOP
    UPDATE merch_inventory
    SET stock_count = stock_count - COALESCE((item->>'quantity')::integer, 1),
        updated_at = now()
    WHERE product_id = (item->>'product_id')::uuid
      AND variant_key = item->>'variant_key';
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_merch_order_created
  AFTER INSERT ON merch_orders
  FOR EACH ROW
  EXECUTE FUNCTION handle_merch_order();

-- 3.4.13 Trigger: low stock notification
CREATE OR REPLACE FUNCTION handle_low_stock()
RETURNS trigger AS $$
BEGIN
  IF NEW.stock_count <= NEW.low_stock_threshold AND OLD.stock_count > OLD.low_stock_threshold THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT sr.user_id, 'low_stock',
      'Low Stock Alert',
      'Product variant ' || NEW.variant_key || ' is running low (' || NEW.stock_count || ' remaining).',
      jsonb_build_object('product_id', NEW.product_id, 'variant_key', NEW.variant_key, 'stock_count', NEW.stock_count)
    FROM staff_roles sr
    WHERE sr.permissions ? 'manage_merch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_inventory_update
  AFTER UPDATE ON merch_inventory
  FOR EACH ROW
  EXECUTE FUNCTION handle_low_stock();

-- 3.4.14 invite_collective_to_event
CREATE OR REPLACE FUNCTION invite_collective_to_event(
  p_event_id uuid,
  p_collective_id uuid
)
RETURNS void AS $$
BEGIN
  -- Create event invite record
  INSERT INTO event_invites (event_id, collective_id, invited_by)
  VALUES (p_event_id, p_collective_id, auth.uid())
  ON CONFLICT (event_id, collective_id) DO NOTHING;

  -- Create registration entries with invited status for all active members
  INSERT INTO event_registrations (event_id, user_id, status, invited_at)
  SELECT p_event_id, cm.user_id, 'invited', now()
  FROM collective_members cm
  WHERE cm.collective_id = p_collective_id AND cm.status = 'active'
  ON CONFLICT (event_id, user_id) DO NOTHING;

  -- Notify all members
  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT cm.user_id, 'event_invite',
    'You''re invited to an event!',
    'Your collective has been invited to join an event.',
    jsonb_build_object('event_id', p_event_id, 'collective_id', p_collective_id)
  FROM collective_members cm
  WHERE cm.collective_id = p_collective_id AND cm.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. Updated_at trigger (reusable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON merch_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON merch_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON global_announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Storage Buckets Config (3.5)
-- (Cannot create via SQL - document as reference for Supabase dashboard setup)
-- ---------------------------------------------------------------------------

-- STORAGE BUCKET CONFIGURATION (see migration 0031_storage_buckets.sql, which
-- actually creates these buckets). Documentation retained below as line
-- comments; a C-style block comment here broke fresh migration replay because
-- the "image/*" / "(user_id/*)" sequences open nested block comments that
-- Postgres never closes, swallowing the ALTER PUBLICATION statements that
-- follow.
-- STORAGE BUCKET CONFIGURATION - Create these in the Supabase Dashboard > Storage
-- 
-- 1. avatars
--    - Public: YES
--    - File size limit: 2MB
--    - Allowed MIME types: image/*
--    - RLS: Users can upload to their own folder (user_id/*)
-- 
-- 2. event-images
--    - Public: YES
--    - File size limit: 5MB
--    - Allowed MIME types: image/*
--    - RLS: Leaders can upload for their collective's events
-- 
-- 3. post-images
--    - Public: YES
--    - File size limit: 5MB
--    - Allowed MIME types: image/*
--    - RLS: Authenticated users can upload to their own folder
-- 
-- 4. collective-images
--    - Public: YES
--    - File size limit: 5MB
--    - Allowed MIME types: image/*
--    - RLS: Collective leaders can upload
-- 
-- 5. badges
--    - Public: YES
--    - File size limit: 1MB
--    - Allowed MIME types: image/*
--    - RLS: Admin only upload
-- 
-- 6. chat-images
--    - Public: NO (authenticated access)
--    - File size limit: 5MB
--    - Allowed MIME types: image/*
--    - RLS: Collective members only
-- 
-- 7. merch-images
--    - Public: YES
--    - File size limit: 5MB
--    - Allowed MIME types: image/*
--    - RLS: Admin only upload
-- 
-- 8. chat-voice
--    - Public: NO (authenticated access)
--    - File size limit: 5MB
--    - Allowed MIME types: audio/*
--    - RLS: Collective members only
-- 
-- 9. chat-video
--    - Public: NO (authenticated access)
--    - File size limit: 20MB
--    - Allowed MIME types: video/*
--    - RLS: Collective members only
-- 
-- 10. impact-evidence
--     - Public: NO (authenticated access)
--     - File size limit: 5MB
--     - Allowed MIME types: image/*
--     - RLS: Leaders/assist-leaders for their collective's events
-- 
-- IMAGE TRANSFORMS (enable in Supabase Dashboard > Storage > Settings):
--   - Thumbnail: 200x200, cover
--   - Medium: 600x600, cover
--   - Large: 1200x1200, inside

-- ---------------------------------------------------------------------------
-- 8. Realtime Configuration (3.7)
-- ---------------------------------------------------------------------------

-- Enable realtime for specific tables
-- (Run these via Supabase Dashboard > Database > Replication if not available in SQL)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE event_registrations;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE global_announcements;
