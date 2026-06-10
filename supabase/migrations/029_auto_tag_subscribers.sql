-- ============================================================
--  029: Auto-Tag Subscribers
--  Creates or syncs email tags based on profile data,
--  collective membership, event attendance, interests, tier.
-- ============================================================

-- Ensure system auto-tags exist (idempotent via ON CONFLICT)
CREATE OR REPLACE FUNCTION sync_auto_tags()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tag_id uuid;
  v_interest text;
  v_interests text[] := ARRAY[
    'tree_planting', 'beach_cleanup', 'wildlife_survey',
    'habitat_restoration', 'seed_collecting', 'weed_removal',
    'community_garden', 'waterway_cleanup', 'nature_walk'
  ];
BEGIN
  -- ---- Interest-based tags ----
  FOREACH v_interest IN ARRAY v_interests LOOP
    INSERT INTO email_tags (name, colour, description)
    VALUES (
      initcap(replace(v_interest, '_', ' ')),
      CASE v_interest
        WHEN 'tree_planting' THEN '#10B981'
        WHEN 'beach_cleanup' THEN '#06B6D4'
        WHEN 'wildlife_survey' THEN '#8B5CF6'
        WHEN 'habitat_restoration' THEN '#84CC16'
        WHEN 'seed_collecting' THEN '#F59E0B'
        WHEN 'weed_removal' THEN '#EF4444'
        WHEN 'community_garden' THEN '#EC4899'
        WHEN 'waterway_cleanup' THEN '#3B82F6'
        WHEN 'nature_walk' THEN '#F97316'
        ELSE '#6B7280'
      END,
      'Auto: from onboarding interests'
    )
    ON CONFLICT (name) DO NOTHING;

    SELECT id INTO v_tag_id FROM email_tags WHERE name = initcap(replace(v_interest, '_', ' '));

    -- Tag all profiles with this interest
    INSERT INTO profile_tags (profile_id, tag_id)
    SELECT p.id, v_tag_id
    FROM profiles p
    WHERE v_interest = ANY(p.interests)
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM profile_tags pt WHERE pt.profile_id = p.id AND pt.tag_id = v_tag_id
      );
  END LOOP;

  -- ---- Collective-based tags ----
  FOR v_tag_id, v_interest IN
    SELECT c.id, c.name FROM collectives c
  LOOP
    INSERT INTO email_tags (name, colour, description)
    VALUES (v_interest, '#6366F1', 'Auto: collective membership')
    ON CONFLICT (name) DO NOTHING;

    SELECT et.id INTO v_tag_id FROM email_tags et WHERE et.name = v_interest;

    INSERT INTO profile_tags (profile_id, tag_id)
    SELECT cm.user_id, v_tag_id
    FROM collective_members cm
    WHERE cm.collective_id = (SELECT c2.id FROM collectives c2 WHERE c2.name = v_interest LIMIT 1)
      AND cm.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM profile_tags pt WHERE pt.profile_id = cm.user_id AND pt.tag_id = v_tag_id
      );
  END LOOP;

  -- ---- Tier-based tags ----
  DECLARE
    v_tiers text[] := ARRAY['Seedling', 'Sapling', 'Native', 'Canopy', 'Elder'];
    v_tier text;
    v_tier_colours text[] := ARRAY['#A3E635', '#84CC16', '#22C55E', '#10B981', '#047857'];
    v_idx int := 1;
  BEGIN
    FOREACH v_tier IN ARRAY v_tiers LOOP
      INSERT INTO email_tags (name, colour, description)
      VALUES (v_tier, v_tier_colours[v_idx], 'Auto: membership tier')
      ON CONFLICT (name) DO NOTHING;

      SELECT et.id INTO v_tag_id FROM email_tags et WHERE et.name = v_tier;

      INSERT INTO profile_tags (profile_id, tag_id)
      SELECT p.id, v_tag_id
      FROM profiles p
      WHERE p.membership_level = v_tier
        AND p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM profile_tags pt WHERE pt.profile_id = p.id AND pt.tag_id = v_tag_id
        );

      -- Remove stale tier tags (user moved to different tier)
      DELETE FROM profile_tags pt
      WHERE pt.tag_id = v_tag_id
        AND NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = pt.profile_id AND p.membership_level = v_tier
        );

      v_idx := v_idx + 1;
    END LOOP;
  END;

  -- ---- Engagement tags ----
  -- "Active" = attended 3+ events
  INSERT INTO email_tags (name, colour, description)
  VALUES ('Active', '#22C55E', 'Auto: attended 3+ events')
  ON CONFLICT (name) DO NOTHING;

  SELECT et.id INTO v_tag_id FROM email_tags et WHERE et.name = 'Active';

  INSERT INTO profile_tags (profile_id, tag_id)
  SELECT er.user_id, v_tag_id
  FROM event_registrations er
  WHERE er.status = 'attended'
  GROUP BY er.user_id
  HAVING count(*) >= 3
  ON CONFLICT (profile_id, tag_id) DO NOTHING;

  -- "New" = joined within last 30 days
  INSERT INTO email_tags (name, colour, description)
  VALUES ('New Member', '#3B82F6', 'Auto: joined within 30 days')
  ON CONFLICT (name) DO NOTHING;

  SELECT et.id INTO v_tag_id FROM email_tags et WHERE et.name = 'New Member';

  INSERT INTO profile_tags (profile_id, tag_id)
  SELECT p.id, v_tag_id
  FROM profiles p
  WHERE p.created_at > now() - interval '30 days'
    AND p.deleted_at IS NULL
  ON CONFLICT (profile_id, tag_id) DO NOTHING;

  -- Remove stale "New Member" tags
  DELETE FROM profile_tags pt
  WHERE pt.tag_id = v_tag_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = pt.profile_id AND p.created_at <= now() - interval '30 days'
    );

  -- "Leader" = any collective leadership role
  INSERT INTO email_tags (name, colour, description)
  VALUES ('Leader', '#F59E0B', 'Auto: collective leader/co-leader/assist')
  ON CONFLICT (name) DO NOTHING;

  SELECT et.id INTO v_tag_id FROM email_tags et WHERE et.name = 'Leader';

  INSERT INTO profile_tags (profile_id, tag_id)
  SELECT DISTINCT cm.user_id, v_tag_id
  FROM collective_members cm
  WHERE cm.role IN ('leader', 'co_leader', 'assist_leader')
    AND cm.status = 'active'
  ON CONFLICT (profile_id, tag_id) DO NOTHING;

  -- "Has Location" tag for geo targeting
  INSERT INTO email_tags (name, colour, description)
  VALUES ('Has Location', '#06B6D4', 'Auto: has location set')
  ON CONFLICT (name) DO NOTHING;

  SELECT et.id INTO v_tag_id FROM email_tags et WHERE et.name = 'Has Location';

  INSERT INTO profile_tags (profile_id, tag_id)
  SELECT p.id, v_tag_id
  FROM profiles p
  WHERE p.location IS NOT NULL AND p.location != ''
    AND p.deleted_at IS NULL
  ON CONFLICT (profile_id, tag_id) DO NOTHING;

END;
$$;

-- Run it once on migration
SELECT sync_auto_tags();
