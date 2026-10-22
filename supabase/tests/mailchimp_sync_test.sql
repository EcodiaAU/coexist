-- Battery for the Mailchimp member sync (migration 20261022060000).
-- Runs inside ONE transaction and ROLLS BACK, so it is safe on the live
-- database. It touches only the Ecodia-owned test profiles (the seeded
-- allowlist plus one qa-rebrand-* account) and prints one PASS/FAIL per case.
--
-- Negative controls are deliberate: case 3 (a member outside the allowlist),
-- case 5 (auto-sync off) and case 12 (the queue table missing) must NOT
-- enqueue, and case 12 must still let the profile save land. A battery where
-- every case passes trivially proves nothing.
--
-- Run:  psql "$DB" -f supabase/tests/mailchimp_sync_test.sql
BEGIN;

SET LOCAL client_min_messages TO WARNING;

CREATE TEMP TABLE mc_results(n int, verdict text, detail text) ON COMMIT DROP;

DO $$
DECLARE
  v_n       integer;
  v_txt     text;
  v_bool    boolean;
  v_ver     integer;
  v_other   uuid;
  v_dup     uuid;
  r         record;
BEGIN
  -- known starting state, whatever the live config says
  UPDATE mailchimp_sync_config
     SET auto_sync = true, scope = 'allowlist',
         allowlist = ARRAY['apple@ecodia.au','code@ecodia.au','eos-test-participant@ecodia.au','tate@ecodia.au']
   WHERE id;
  DELETE FROM mailchimp_sync_queue;

  -- 1. config singleton seeded
  SELECT count(*) INTO v_n FROM mailchimp_sync_config;
  INSERT INTO mc_results VALUES (1, CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'config rows=' || v_n);

  -- 2. a name change on an allowlisted member enqueues it, not as consent
  UPDATE profiles SET first_name = coalesce(first_name, '') || 'x' WHERE lower(email) = 'code@ecodia.au';
  SELECT count(*), bool_or(consent) INTO v_n, v_bool FROM mailchimp_sync_queue WHERE email = 'code@ecodia.au' AND reason = 'profile_changed';
  INSERT INTO mc_results VALUES (2, CASE WHEN v_n = 1 AND NOT v_bool THEN 'PASS' ELSE 'FAIL' END, 'queued=' || v_n || ' consent=' || coalesce(v_bool::text, 'null'));

  -- 3. NEGATIVE: a member outside the allowlist is never enqueued (scope gate)
  SELECT id INTO v_other FROM profiles
   WHERE email IS NOT NULL AND lower(email) NOT IN ('apple@ecodia.au','code@ecodia.au','eos-test-participant@ecodia.au','tate@ecodia.au')
     AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  UPDATE profiles SET last_name = last_name WHERE id = v_other;            -- no-op: trigger WHEN filters it
  UPDATE profiles SET first_name = coalesce(first_name, '') || 'x' WHERE id = v_other;
  SELECT count(*) INTO v_n FROM mailchimp_sync_queue q JOIN profiles p ON lower(p.email) = q.email WHERE p.id = v_other;
  INSERT INTO mc_results VALUES (3, CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, 'non-allowlisted queued=' || v_n);

  -- 4. opting back IN is consent; opting out is not
  UPDATE profiles SET marketing_opt_in = false WHERE lower(email) = 'eos-test-participant@ecodia.au';
  SELECT consent, reason INTO v_bool, v_txt FROM mailchimp_sync_queue WHERE email = 'eos-test-participant@ecodia.au';
  DELETE FROM mailchimp_sync_queue WHERE email = 'eos-test-participant@ecodia.au';
  UPDATE profiles SET marketing_opt_in = true WHERE lower(email) = 'eos-test-participant@ecodia.au';
  INSERT INTO mc_results VALUES (4,
    CASE WHEN v_bool = false AND v_txt = 'consent_changed'
          AND EXISTS (SELECT 1 FROM mailchimp_sync_queue WHERE email = 'eos-test-participant@ecodia.au' AND consent)
         THEN 'PASS' ELSE 'FAIL' END,
    'opt-out consent=' || coalesce(v_bool::text, 'null') || ' reason=' || coalesce(v_txt, 'null'));

  -- 5. NEGATIVE: auto_sync off enqueues nothing
  DELETE FROM mailchimp_sync_queue;
  UPDATE mailchimp_sync_config SET auto_sync = false WHERE id;
  UPDATE profiles SET first_name = coalesce(first_name, '') || 'y' WHERE lower(email) = 'code@ecodia.au';
  SELECT count(*) INTO v_n FROM mailchimp_sync_queue;
  UPDATE mailchimp_sync_config SET auto_sync = true WHERE id;
  INSERT INTO mc_results VALUES (5, CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, 'queued with auto_sync off=' || v_n);

  -- 6. a tag added in bulk (statement trigger) enqueues its holder
  DELETE FROM mailchimp_sync_queue;
  INSERT INTO email_tags (name, colour, description) VALUES ('ZZ Mailchimp Battery', '#000000', 'battery') ON CONFLICT (name) DO NOTHING;
  INSERT INTO profile_tags (profile_id, tag_id)
  SELECT p.id, t.id FROM profiles p, email_tags t
   WHERE lower(p.email) = 'apple@ecodia.au' AND t.name = 'ZZ Mailchimp Battery'
  ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_n FROM mailchimp_sync_queue WHERE email = 'apple@ecodia.au' AND reason = 'tags_changed';
  INSERT INTO mc_results VALUES (6, CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'tag insert queued=' || v_n);

  -- 7. the contact carries that tag
  SELECT 'ZZ Mailchimp Battery' = ANY (tags) INTO v_bool FROM mailchimp_contacts(ARRAY['APPLE@ecodia.au']);
  INSERT INTO mc_results VALUES (7, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, 'tag on contact=' || coalesce(v_bool::text, 'null'));

  -- 8. a suppression makes the contact unsubscribed and enqueues it
  DELETE FROM mailchimp_sync_queue;
  INSERT INTO email_suppressions (email, reason) VALUES ('eos-test-participant@ecodia.au', 'manual') ON CONFLICT (email) DO NOTHING;
  SELECT status || '/' || suppressed INTO v_txt FROM mailchimp_contacts(ARRAY['eos-test-participant@ecodia.au']);
  SELECT count(*) INTO v_n FROM mailchimp_sync_queue WHERE email = 'eos-test-participant@ecodia.au' AND reason = 'suppression_added';
  INSERT INTO mc_results VALUES (8, CASE WHEN v_txt = 'unsubscribed/true' AND v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'contact=' || coalesce(v_txt, 'null') || ' queued=' || v_n);

  -- 9. an opted-out member maps to unsubscribed; an opted-in one to subscribed
  UPDATE profiles SET marketing_opt_in = false WHERE lower(email) = 'tate@ecodia.au';
  UPDATE profiles SET marketing_opt_in = true  WHERE lower(email) = 'code@ecodia.au';
  SELECT string_agg(email || '=' || status, ',' ORDER BY email) INTO v_txt
    FROM mailchimp_contacts(ARRAY['tate@ecodia.au', 'code@ecodia.au']);
  INSERT INTO mc_results VALUES (9, CASE WHEN v_txt = 'code@ecodia.au=subscribed,tate@ecodia.au=unsubscribed' THEN 'PASS' ELSE 'FAIL' END, coalesce(v_txt, 'null'));

  -- 10. two live profiles on one address collapse to ONE contact, opted out if either is
  SELECT id INTO v_dup FROM profiles WHERE lower(email) LIKE 'qa-rebrand-%@ecodia.au' AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  UPDATE profiles SET email = 'CODE@ecodia.au', marketing_opt_in = false WHERE id = v_dup;
  SELECT count(*), max(status) INTO v_n, v_txt FROM mailchimp_contacts(ARRAY['code@ecodia.au']);
  INSERT INTO mc_results VALUES (10, CASE WHEN v_n = 1 AND v_txt = 'unsubscribed' THEN 'PASS' ELSE 'FAIL' END, 'rows=' || v_n || ' status=' || coalesce(v_txt, 'null'));
  UPDATE profiles SET email = 'qa-dup-restored@ecodia.au' WHERE id = v_dup;

  -- 11. pending deletion and soft delete drop out of the contacts (so they archive)
  UPDATE profiles SET deletion_status = 'pending_deletion' WHERE lower(email) = 'apple@ecodia.au';
  SELECT count(*) INTO v_n FROM mailchimp_contacts(ARRAY['apple@ecodia.au']);
  INSERT INTO mc_results VALUES (11, CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, 'pending-deletion contacts=' || v_n);

  -- 12. NEGATIVE: with the queue table gone, a profile save still lands
  ALTER TABLE mailchimp_sync_queue RENAME TO mailchimp_sync_queue_hidden;
  BEGIN
    UPDATE profiles SET first_name = 'BatteryStillSaves' WHERE lower(email) = 'code@ecodia.au';
    SELECT count(*) INTO v_n FROM profiles WHERE lower(email) = 'code@ecodia.au' AND first_name = 'BatteryStillSaves';
  EXCEPTION WHEN OTHERS THEN
    v_n := -1;
  END;
  ALTER TABLE mailchimp_sync_queue_hidden RENAME TO mailchimp_sync_queue;
  INSERT INTO mc_results VALUES (12, CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'profile saved with queue missing=' || v_n);

  -- 13. claim takes a version; a re-enqueue mid-flight bumps it and frees the row
  DELETE FROM mailchimp_sync_queue;
  PERFORM mailchimp_enqueue('code@ecodia.au', 'battery', false);
  SELECT version INTO v_ver FROM mailchimp_claim_queue(10) WHERE email = 'code@ecodia.au';
  PERFORM mailchimp_enqueue('code@ecodia.au', 'battery2', false);
  SELECT count(*) INTO v_n FROM mailchimp_sync_queue WHERE email = 'code@ecodia.au' AND version = v_ver + 1 AND claimed_at IS NULL;
  INSERT INTO mc_results VALUES (13, CASE WHEN v_ver IS NOT NULL AND v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'claimed v=' || coalesce(v_ver::text, 'null') || ' bumped=' || v_n);

  -- 14. a state row with no contact behind it is reported orphaned (full sync archives it)
  INSERT INTO mailchimp_sync_state (audience_id, email, mc_status) VALUES ('battery', 'gone-battery@ecodia.au', 'subscribed');
  SELECT count(*) INTO v_n FROM mailchimp_orphaned_state('battery', 10) WHERE email = 'gone-battery@ecodia.au';
  INSERT INTO mc_results VALUES (14, CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'orphaned=' || v_n);

  -- 15. a pending website signup is NOT a contact (Mailchimp would email it a confirmation)
  INSERT INTO newsletter_subscribers (email, first_name, status) VALUES ('nl-battery@ecodia.au', 'Nl', 'pending') ON CONFLICT (email) DO NOTHING;
  SELECT count(*) INTO v_n FROM mailchimp_contacts(ARRAY['nl-battery@ecodia.au']);
  UPDATE newsletter_subscribers SET status = 'confirmed' WHERE email = 'nl-battery@ecodia.au';
  SELECT source || '/' || status INTO v_txt FROM mailchimp_contacts(ARRAY['nl-battery@ecodia.au']);
  INSERT INTO mc_results VALUES (15, CASE WHEN v_n = 0 AND v_txt = 'newsletter/subscribed' THEN 'PASS' ELSE 'FAIL' END, 'pending rows=' || v_n || ' confirmed=' || coalesce(v_txt, 'null'));

  -- 16. API roles cannot read the secrets table
  SELECT has_table_privilege('authenticated', 'public.mailchimp_sync_secrets', 'SELECT')
      OR has_table_privilege('anon', 'public.mailchimp_sync_secrets', 'SELECT') INTO v_bool;
  INSERT INTO mc_results VALUES (16, CASE WHEN NOT v_bool THEN 'PASS' ELSE 'FAIL' END, 'api role can read secrets=' || v_bool);

  -- 17. API roles cannot call the contact resolver (it reads every member)
  SELECT has_function_privilege('authenticated', 'public.mailchimp_contacts(text[], text, integer)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.mailchimp_contacts(text[], text, integer)', 'EXECUTE') INTO v_bool;
  INSERT INTO mc_results VALUES (17, CASE WHEN NOT v_bool THEN 'PASS' ELSE 'FAIL' END, 'api role can call mailchimp_contacts=' || v_bool);
END $$;

SELECT n, verdict, detail FROM mc_results ORDER BY n;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS passed, count(*) FILTER (WHERE verdict <> 'PASS') AS failed FROM mc_results;

ROLLBACK;
