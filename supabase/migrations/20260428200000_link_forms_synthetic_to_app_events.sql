-- ============================================================================
-- 20260428200000: Link Forms-synthetic events back to app-created events
--
-- ISSUE (Jess Apr 28 2026, follow-on to PR #8): Path B - surveys submitted
-- via the Microsoft Form land on the SharePoint sheet. jobid 9 (excel-from-
-- sync) syncs sheet to DB by creating a SYNTHETIC event row (UUID v5 of
-- forms-{integer_id}) plus a corresponding event_impact row tied to that
-- synthetic UUID. The leader's app-created event keeps a different UUID
-- and ends up with NO event_impact, so the "Submit Impact Form" virtual
-- task (gated on event_impact existence per use-impact-form-tasks.ts) never
-- clears even though the impact data is in the database under a parallel ID.
--
-- PR #8 covered Path A (in-app survey link to survey_responses). This
-- migration covers Path B (Microsoft Form to sheet to DB).
--
-- FIX (two parts):
--
-- 1. Backfill: for every existing synthetic Forms event (created_by IS
--    NULL, event_impact present), look for a matching app-created event
--    (created_by NOT NULL) on the same collective, within +/- 1 day of the
--    synthetic's date, with a similar title (pg_trgm similarity >= 0.4).
--    If matched and the app event has NO event_impact: copy the synthetic
--    event_impact onto the app event_id, marking custom_metrics with
--    auto_derived_from_forms=true so the leader knows it's editable.
--
-- 2. Forward fix lives in the excel-sync Edge Function (companion change):
--    syncFromExcel matches Forms rows to app events BEFORE creating the
--    synthetic flow, writing event_impact directly to the app event_id
--    when a match exists.
--
-- The synthetic events themselves stay in place. They remain in the DB as
-- the canonical record for Forms submissions that have no app counterpart
-- (Cairns leaders who submit Forms for events that were never created in
-- the app), and the deterministic UUID v5 keeps re-runs idempotent.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Backfill DO-block
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_synth        RECORD;
  v_app_event    RECORD;
  v_linked_count INT := 0;
  v_checked      INT := 0;
BEGIN
  FOR v_synth IN
    SELECT
      e.id           AS synth_event_id,
      e.title        AS synth_title,
      e.date_start   AS synth_date,
      e.collective_id,
      ei.attendees,
      ei.rubbish_kg,
      ei.trees_planted,
      ei.coastline_cleaned_m,
      ei.hours_total,
      ei.area_restored_sqm,
      ei.native_plants,
      ei.wildlife_sightings,
      ei.invasive_weeds_pulled,
      ei.leaders_trained,
      ei.custom_metrics,
      ei.notes,
      ei.logged_at,
      ei.logged_by
    FROM events e
    JOIN event_impact ei ON ei.event_id = e.id
    WHERE e.created_by IS NULL
  LOOP
    v_checked := v_checked + 1;

    -- Look for an app-created event in the same collective. Two tiers:
    -- Tier 1 (close date, low title bar): +/- 1 day, similarity >= 0.4.
    --   Catches the common timezone-drift case where Forms rows land at
    --   midnight UTC + 10 (which can fall on the next or previous calendar
    --   day vs the app event's local time). Title threshold is permissive
    --   enough to catch leader title drift on the same physical event.
    -- Tier 2 (wide date, high title bar): +/- 31 days, similarity >= 0.55.
    --   Catches the real-world case where the leader submitted the
    --   Microsoft Form for a wrong date (entered today's date instead of
    --   the event date). High title similarity threshold means we only
    --   match when the titles are clearly the same event.
    -- Tier 1 is preferred when both apply; Tier 2 is the fallback.
    SELECT e.id, e.title, e.date_start
    INTO v_app_event
    FROM events e
    WHERE e.collective_id = v_synth.collective_id
      AND e.created_by IS NOT NULL
      AND e.id <> v_synth.synth_event_id
      AND NOT EXISTS (SELECT 1 FROM event_impact ei2 WHERE ei2.event_id = e.id)
      AND (
        (
          e.date_start::date BETWEEN (v_synth.synth_date::date - 1) AND (v_synth.synth_date::date + 1)
          AND similarity(lower(e.title), lower(v_synth.synth_title)) >= 0.4
        )
        OR (
          e.date_start::date BETWEEN (v_synth.synth_date::date - 31) AND (v_synth.synth_date::date + 31)
          AND similarity(lower(e.title), lower(v_synth.synth_title)) >= 0.55
        )
      )
    ORDER BY
      -- Tier 1 (close-date) wins over Tier 2 (wide-date)
      CASE
        WHEN abs((e.date_start::date - v_synth.synth_date::date)) <= 1 THEN 0
        ELSE 1
      END,
      similarity(lower(e.title), lower(v_synth.synth_title)) DESC,
      abs(EXTRACT(EPOCH FROM (e.date_start - v_synth.synth_date))) ASC
    LIMIT 1;

    IF v_app_event.id IS NOT NULL THEN
      INSERT INTO event_impact (
        event_id,
        attendees, rubbish_kg, trees_planted, coastline_cleaned_m, hours_total,
        area_restored_sqm, native_plants, wildlife_sightings,
        invasive_weeds_pulled, leaders_trained,
        custom_metrics, notes, logged_at, logged_by
      ) VALUES (
        v_app_event.id,
        v_synth.attendees, v_synth.rubbish_kg, v_synth.trees_planted,
        v_synth.coastline_cleaned_m, v_synth.hours_total, v_synth.area_restored_sqm,
        v_synth.native_plants, v_synth.wildlife_sightings,
        v_synth.invasive_weeds_pulled, v_synth.leaders_trained,
        COALESCE(v_synth.custom_metrics, '{}'::jsonb)
          || jsonb_build_object('auto_derived_from_forms', true,
                                'source_synthetic_event_id', v_synth.synth_event_id::text),
        COALESCE(v_synth.notes, '') ||
          CASE WHEN v_synth.notes IS NULL OR v_synth.notes = '' THEN '' ELSE E'\n' END
          || 'Auto-derived from Microsoft Forms submission via excel sync. Leader can refine via Log Impact.',
        v_synth.logged_at,
        v_synth.logged_by
      )
      ON CONFLICT (event_id) DO NOTHING;

      v_linked_count := v_linked_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Forms-to-app linkage backfill: checked=% synthetic events, linked=% app events with derived impact',
    v_checked, v_linked_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Post-backfill alignment audit
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_completed_no_impact INT;
  v_pending_task        INT;
BEGIN
  SELECT COUNT(*) INTO v_completed_no_impact
    FROM events e
    WHERE e.status = 'completed'
      AND e.title NOT ILIKE 'test%'
      AND e.date_end > NOW() - INTERVAL '90 days'
      AND e.created_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM event_impact ei WHERE ei.event_id = e.id);

  SELECT COUNT(*) INTO v_pending_task
    FROM events e
    WHERE e.status = 'completed'
      AND e.title NOT ILIKE 'test%'
      AND e.date_end > NOW() - INTERVAL '90 days'
      AND e.created_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM event_impact ei WHERE ei.event_id = e.id)
      AND e.activity_type::text IN (
        SELECT activity_type FROM surveys
        WHERE is_impact_form = true AND status = 'active' AND activity_type IS NOT NULL
      );

  RAISE NOTICE 'Post-link audit (90d, app-created, non-test): completed_without_impact=% pending_impact_task=%',
    v_completed_no_impact, v_pending_task;
END;
$$;
