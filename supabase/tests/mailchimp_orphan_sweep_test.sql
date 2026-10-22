-- Regression test for migration 20261022070000: the Mailchimp orphan sweep must
-- have no contact ceiling. The old sweep compared against
-- mailchimp_contacts(NULL, NULL, 5000), so at 6,000 contacts it flagged 999 live
-- members as orphans and the full sync would have archived them from Mailchimp.
--
-- Runs in ONE transaction and rolls back. It inserts 6,000 synthetic
-- @ecodia.invalid newsletter rows, so run it on a local or branch database;
-- it is safe on production only because nothing commits.
--
-- Run:  psql "$DB" -f supabase/tests/mailchimp_orphan_sweep_test.sql
BEGIN;

SET LOCAL client_min_messages TO WARNING;

UPDATE mailchimp_sync_config SET auto_sync = false;

INSERT INTO newsletter_subscribers (email, status, source)
  SELECT 'syn-' || lpad(i::text, 5, '0') || '@ecodia.invalid', 'confirmed', 'test' FROM generate_series(1, 6000) i;
INSERT INTO mailchimp_sync_state (audience_id, email, mc_status, last_action)
  SELECT 'orphan-test', 'syn-' || lpad(i::text, 5, '0') || '@ecodia.invalid', 'subscribed', 'created' FROM generate_series(1, 6000) i;
INSERT INTO mailchimp_sync_state (audience_id, email, mc_status, last_action) VALUES
  ('orphan-test', 'aa-gone@ecodia.invalid', 'subscribed', 'created'),
  ('orphan-test', 'zz-gone@ecodia.invalid', 'subscribed', 'created'),
  ('orphan-test', 'mm-archived@ecodia.invalid', 'archived', 'archived'),
  ('orphan-test-other', 'other-gone@ecodia.invalid', 'subscribed', 'created');

SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS verdict, detail FROM (
  SELECT 1 AS n,
         (SELECT string_agg(email, ',' ORDER BY email) FROM mailchimp_orphaned_state('orphan-test', 1000))
           = 'aa-gone@ecodia.invalid,zz-gone@ecodia.invalid' AS ok,
         'only the two real orphans among 6,000 live contacts (none past the 5,000th)' AS detail
  UNION ALL
  SELECT 2, (SELECT count(*) FROM mailchimp_orphaned_state('orphan-test', 1)) = 1,
         'p_limit is honoured'
  UNION ALL
  SELECT 3, NOT EXISTS (SELECT 1 FROM mailchimp_orphaned_state('orphan-test', 1000) o WHERE o.email = 'mm-archived@ecodia.invalid'),
         'an already archived row is not returned again'
  UNION ALL
  SELECT 4, (SELECT string_agg(email, ',') FROM mailchimp_orphaned_state('orphan-test-other', 10)) = 'other-gone@ecodia.invalid',
         'another audience is swept on its own'
) t ORDER BY n;

ROLLBACK;
