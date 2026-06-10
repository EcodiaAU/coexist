-- ============================================================
-- 20260610000000: Email system cleanup
--
--  1. Drop deprecated tier tags (Seedling/Sapling/Native/Canopy/Elder)
--     and rewrite sync_auto_tags() so they stop coming back.
--  2. Align the email_subscriber_count() RPC with the subscribers-tab
--     UI (treat NULL marketing_opt_in as subscribed, since the column
--     defaults to TRUE and only an explicit user opt-out should reduce
--     the count).
--  3. Add merge_email_tags(canonical, deprecated) helper so the admin
--     can collapse near-duplicates such as "Brisbane" vs "Brisbane
--     Collective" without dropping any profile assignments.
-- ============================================================

-- ---------- 1. Remove tier tags ----------
DELETE FROM profile_tags
WHERE tag_id IN (
  SELECT id FROM email_tags
  WHERE name IN ('Seedling', 'Sapling', 'Native', 'Canopy', 'Elder')
);

DELETE FROM email_tags
WHERE name IN ('Seedling', 'Sapling', 'Native', 'Canopy', 'Elder');

-- Rewrite sync_auto_tags() to drop the tier-tag block. Other auto-tag
-- behaviour (interests, collective membership, engagement, location,
-- leader) is preserved.
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
  -- Interest-based tags
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

    INSERT INTO profile_tags (profile_id, tag_id)
    SELECT p.id, v_tag_id
    FROM profiles p
    WHERE v_interest = ANY(p.interests)
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM profile_tags pt WHERE pt.profile_id = p.id AND pt.tag_id = v_tag_id
      );
  END LOOP;

  -- Collective-based tags
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

  -- Engagement: "Active" = 3+ attended events
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

  -- "New Member" = joined within 30 days
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

  -- "Has Location" for geo targeting
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

-- Re-sync once after the rewrite so any tag rows the old function would
-- have created are present (the tier delete above is the only intended
-- subtraction).
SELECT sync_auto_tags();

-- ---------- 2. Align email_subscriber_count() ----------
-- The subscribers tab counts marketing_opt_in IS DISTINCT FROM false (i.e.
-- TRUE or NULL). Tate's intent is "auto-subscribed, opt-out only", which
-- matches that wider definition. The hero stat card was counting only
-- explicit TRUE, so the two surfaces could disagree if any row had NULL
-- marketing_opt_in.
CREATE OR REPLACE FUNCTION email_subscriber_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM profiles
  WHERE marketing_opt_in IS DISTINCT FROM false
    AND deleted_at IS NULL
$$;

GRANT EXECUTE ON FUNCTION email_subscriber_count() TO authenticated;

-- Belt-and-braces: any historical NULL rows get normalised to TRUE so
-- the underlying column is consistent with the new count definition.
UPDATE profiles
SET marketing_opt_in = true
WHERE marketing_opt_in IS NULL
  AND deleted_at IS NULL;

-- ---------- 3. Tag dedupe helper ----------
-- Move every profile assignment from the deprecated tag onto the
-- canonical tag, then delete the deprecated row. Idempotent and safe to
-- call from the admin UI.
CREATE OR REPLACE FUNCTION merge_email_tags(p_canonical_id uuid, p_deprecated_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved integer := 0;
BEGIN
  IF p_canonical_id = p_deprecated_id THEN
    RAISE EXCEPTION 'canonical and deprecated tag ids must differ';
  END IF;

  INSERT INTO profile_tags (profile_id, tag_id)
  SELECT pt.profile_id, p_canonical_id
  FROM profile_tags pt
  WHERE pt.tag_id = p_deprecated_id
  ON CONFLICT (profile_id, tag_id) DO NOTHING;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  DELETE FROM profile_tags WHERE tag_id = p_deprecated_id;
  DELETE FROM email_tags WHERE id = p_deprecated_id;

  RETURN v_moved;
END;
$$;

GRANT EXECUTE ON FUNCTION merge_email_tags(uuid, uuid) TO authenticated;

-- Surface candidate duplicates for the admin UI. The heuristic
-- collapses whitespace + case and strips a trailing "collective" so
-- "Brisbane" and "Brisbane Collective" land in the same bucket.
CREATE OR REPLACE FUNCTION email_tag_dedup_candidates()
RETURNS TABLE (canon text, tag_ids uuid[], tag_names text[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalised AS (
    SELECT
      id,
      name,
      regexp_replace(
        lower(regexp_replace(trim(name), '\s+', ' ', 'g')),
        '\s*collective$', '', 'g'
      ) AS canon
    FROM email_tags
  )
  SELECT canon,
         array_agg(id ORDER BY name),
         array_agg(name ORDER BY name)
  FROM normalised
  GROUP BY canon
  HAVING count(*) > 1
$$;

GRANT EXECUTE ON FUNCTION email_tag_dedup_candidates() TO authenticated;
