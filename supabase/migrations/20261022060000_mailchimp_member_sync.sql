-- ============================================================
-- 20261022060000: Mailchimp member sync (additive)
--
-- Co-Exist sends its own mail through Resend and keeps doing so. This adds a
-- one-way MEMBER mirror into a Mailchimp audience (email, first/last name,
-- subscribe status, tags), plus one thing flowing back: a Mailchimp
-- unsubscribe is honoured in Co-Exist. Nothing here touches the Resend send
-- path, email_campaigns, or campaign_recipients.
--
-- Moving parts:
--   mailchimp_sync_config   singleton: auto-sync on/off, scope, test allowlist
--   mailchimp_sync_secrets  webhook token + signing secret + cron token
--                           (service role only)
--   mailchimp_sync_state    what we last pushed, per (audience, email)
--   mailchimp_sync_queue    addresses whose Co-Exist data changed
--   mailchimp_sync_runs     one row per sync run (admin status panel)
--   mailchimp_webhook_events every Mailchimp delivery, deduped
--   mailchimp_contacts()    THE mapping from Co-Exist rows to one contact per
--                           address (service role only)
--   triggers on profiles, profile_tags, email_tags, email_suppressions and
--   newsletter_subscribers feed the queue; pg_cron drains it every 5 minutes.
--
-- SCOPE GATE. scope='allowlist' (the default) means ONLY the addresses in
-- config.allowlist are ever enqueued or synced. That is the test phase: the
-- credentials point at an Ecodia-owned TEST audience, and real member data
-- must not land in an account Co-Exist does not own. Going live is: swap the
-- three MAILCHIMP_* function secrets to Co-Exist's own account, then set
-- scope='all' in the admin Mailchimp tab. No code change.
--
-- STATE IS PER AUDIENCE. mailchimp_sync_state is keyed on (audience_id, email),
-- so swapping MAILCHIMP_AUDIENCE_ID starts the new audience from nothing instead
-- of skipping every member as "unchanged" against another audience's history.
--
-- DELETION. A soft-deleted profile, one pending deletion (the 30-day window
-- before cleanup_deleted_accounts() removes the auth user), or a hard-deleted
-- one is ARCHIVED in Mailchimp: off the audience and out of every send, but
-- reversible. delete-permanent is not used: Mailchimp then refuses that address
-- forever via the API, which is Co-Exist's call to make, not a sync's.
--
-- TRIGGERS NEVER FAIL THE WRITE THAT FIRED THEM. Every enqueue is wrapped in
-- an exception handler that downgrades to a WARNING. A Mailchimp mirror is not
-- worth one failed profile save, ticket purchase or tag edit.
-- ============================================================

-- ---------- config ----------
CREATE TABLE IF NOT EXISTS public.mailchimp_sync_config (
  id                   boolean PRIMARY KEY DEFAULT true CHECK (id),
  auto_sync            boolean NOT NULL DEFAULT false,
  scope                text NOT NULL DEFAULT 'allowlist' CHECK (scope IN ('allowlist', 'all')),
  allowlist            text[] NOT NULL DEFAULT '{}',
  webhook_id           text,
  webhook_audience_id  text,
  webhook_connected_at timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Test phase: Ecodia-owned accounts that already exist in production. One is
-- opted out (tate@), so the unsubscribed mapping is exercised by real data.
INSERT INTO public.mailchimp_sync_config (id, auto_sync, scope, allowlist)
VALUES (true, true, 'allowlist', ARRAY[
  'apple@ecodia.au',
  'code@ecodia.au',
  'eos-test-participant@ecodia.au',
  'tate@ecodia.au'
])
ON CONFLICT (id) DO NOTHING;

-- ---------- secrets ----------
CREATE TABLE IF NOT EXISTS public.mailchimp_sync_secrets (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
  cron_token             text NOT NULL DEFAULT (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  webhook_token          text,
  webhook_signing_secret text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.mailchimp_sync_secrets (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------- state ----------
CREATE TABLE IF NOT EXISTS public.mailchimp_sync_state (
  audience_id    text NOT NULL,
  email          text NOT NULL,
  profile_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source         text,
  fingerprint    text,
  synced_tags    text[] NOT NULL DEFAULT '{}',
  mc_status      text,
  last_action    text,
  last_synced_at timestamptz,
  last_error     text,
  PRIMARY KEY (audience_id, email)
);

-- ---------- queue ----------
CREATE TABLE IF NOT EXISTS public.mailchimp_sync_queue (
  email       text PRIMARY KEY,
  reason      text NOT NULL,
  -- true when the change was a member opting back IN; only then may an
  -- existing Mailchimp member be moved back to 'subscribed'.
  consent     boolean NOT NULL DEFAULT false,
  version     integer NOT NULL DEFAULT 1,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz,
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text
);
CREATE INDEX IF NOT EXISTS idx_mailchimp_sync_queue_enqueued ON public.mailchimp_sync_queue (enqueued_at);

-- ---------- runs ----------
CREATE TABLE IF NOT EXISTS public.mailchimp_sync_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  trigger      text NOT NULL CHECK (trigger IN ('manual', 'cron')),
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  mode         text NOT NULL CHECK (mode IN ('full', 'queue')),
  audience_id  text,
  scope        text,
  processed    integer NOT NULL DEFAULT 0,
  created      integer NOT NULL DEFAULT 0,
  updated      integer NOT NULL DEFAULT 0,
  unchanged    integer NOT NULL DEFAULT 0,
  archived     integer NOT NULL DEFAULT 0,
  skipped      integer NOT NULL DEFAULT 0,
  failed       integer NOT NULL DEFAULT 0,
  has_more     boolean NOT NULL DEFAULT false,
  errors       jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_mailchimp_sync_runs_started ON public.mailchimp_sync_runs (started_at DESC);

-- ---------- webhook events ----------
CREATE TABLE IF NOT EXISTS public.mailchimp_webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key  text NOT NULL UNIQUE,
  type        text NOT NULL,
  email       text,
  list_id     text,
  fired_at    text,
  payload     jsonb NOT NULL DEFAULT '{}',
  outcome     text
);
CREATE INDEX IF NOT EXISTS idx_mailchimp_webhook_events_received ON public.mailchimp_webhook_events (received_at DESC);

-- ---------- Data API grants + RLS ----------
-- Admin/staff READ the five status tables from the admin Email > Mailchimp tab
-- (authenticated + RLS below). Every WRITE goes through the mailchimp-sync and
-- mailchimp-webhook edge functions on the service-role key; no INSERT/UPDATE/
-- DELETE policy exists for any API role.
ALTER TABLE public.mailchimp_sync_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailchimp_sync_secrets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailchimp_sync_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailchimp_sync_queue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailchimp_sync_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailchimp_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mailchimp_sync_config, public.mailchimp_sync_state, public.mailchimp_sync_queue,
              public.mailchimp_sync_runs, public.mailchimp_webhook_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.mailchimp_sync_config, public.mailchimp_sync_state, public.mailchimp_sync_queue,
              public.mailchimp_sync_runs, public.mailchimp_webhook_events FROM authenticated;
GRANT SELECT ON public.mailchimp_sync_config, public.mailchimp_sync_state, public.mailchimp_sync_queue,
              public.mailchimp_sync_runs, public.mailchimp_webhook_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailchimp_sync_config, public.mailchimp_sync_state, public.mailchimp_sync_queue,
              public.mailchimp_sync_runs, public.mailchimp_webhook_events TO service_role;

-- server-only: webhook token, Mailchimp signing secret and cron token; read only by the
-- two edge functions on the service-role key. No member or admin ever reads this.
REVOKE ALL ON public.mailchimp_sync_secrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailchimp_sync_secrets TO service_role;

DROP POLICY IF EXISTS "Admin read mailchimp_sync_config" ON public.mailchimp_sync_config;
CREATE POLICY "Admin read mailchimp_sync_config" ON public.mailchimp_sync_config
  FOR SELECT USING (is_admin_or_staff(auth.uid()));
DROP POLICY IF EXISTS "Admin read mailchimp_sync_state" ON public.mailchimp_sync_state;
CREATE POLICY "Admin read mailchimp_sync_state" ON public.mailchimp_sync_state
  FOR SELECT USING (is_admin_or_staff(auth.uid()));
DROP POLICY IF EXISTS "Admin read mailchimp_sync_queue" ON public.mailchimp_sync_queue;
CREATE POLICY "Admin read mailchimp_sync_queue" ON public.mailchimp_sync_queue
  FOR SELECT USING (is_admin_or_staff(auth.uid()));
DROP POLICY IF EXISTS "Admin read mailchimp_sync_runs" ON public.mailchimp_sync_runs;
CREATE POLICY "Admin read mailchimp_sync_runs" ON public.mailchimp_sync_runs
  FOR SELECT USING (is_admin_or_staff(auth.uid()));
DROP POLICY IF EXISTS "Admin read mailchimp_webhook_events" ON public.mailchimp_webhook_events;
CREATE POLICY "Admin read mailchimp_webhook_events" ON public.mailchimp_webhook_events
  FOR SELECT USING (is_admin_or_staff(auth.uid()));

-- ============================================================
-- Enqueue
-- ============================================================

-- Set-based core. Filters by config (auto_sync, scope) BEFORE inserting, so an
-- allowlist-scoped test never fills the queue with thousands of rows it will
-- never drain.
CREATE OR REPLACE FUNCTION public.mailchimp_enqueue_many(p_emails text[], p_reason text, p_consent boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.mailchimp_sync_config;
  n integer := 0;
BEGIN
  SELECT * INTO c FROM public.mailchimp_sync_config WHERE id;
  IF NOT FOUND OR NOT c.auto_sync THEN
    RETURN 0;
  END IF;

  INSERT INTO public.mailchimp_sync_queue AS q (email, reason, consent)
  SELECT DISTINCT e, p_reason, coalesce(p_consent, false)
  FROM (SELECT lower(trim(x)) AS e FROM unnest(p_emails) x) s
  WHERE e IS NOT NULL AND e <> ''
    AND (c.scope = 'all' OR e = ANY (c.allowlist))
  ON CONFLICT (email) DO UPDATE
    SET reason      = excluded.reason,
        consent     = q.consent OR excluded.consent,
        enqueued_at = now(),
        claimed_at  = NULL,
        version     = q.version + 1;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'mailchimp_enqueue_many(%) failed: %', p_reason, SQLERRM;
  RETURN 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mailchimp_enqueue(p_email text, p_reason text, p_consent boolean DEFAULT false)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.mailchimp_enqueue_many(ARRAY[p_email], p_reason, p_consent);
$function$;

-- ---------- profiles ----------
CREATE OR REPLACE FUNCTION public.trg_mailchimp_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.mailchimp_enqueue(NEW.email, 'profile_created', false);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.mailchimp_enqueue(OLD.email, 'profile_deleted', false);
    ELSE
      IF lower(trim(coalesce(OLD.email, ''))) IS DISTINCT FROM lower(trim(coalesce(NEW.email, ''))) THEN
        PERFORM public.mailchimp_enqueue(OLD.email, 'email_changed_from', false);
      END IF;
      PERFORM public.mailchimp_enqueue(
        NEW.email,
        CASE WHEN OLD.marketing_opt_in IS DISTINCT FROM NEW.marketing_opt_in THEN 'consent_changed' ELSE 'profile_changed' END,
        -- only a move back to opted-in is consent to re-subscribe
        (OLD.marketing_opt_in IS NOT DISTINCT FROM false AND NEW.marketing_opt_in IS DISTINCT FROM false)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_mailchimp_profiles: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS mailchimp_profiles_ins ON public.profiles;
CREATE TRIGGER mailchimp_profiles_ins AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_mailchimp_profiles();

DROP TRIGGER IF EXISTS mailchimp_profiles_upd ON public.profiles;
CREATE TRIGGER mailchimp_profiles_upd
  AFTER UPDATE OF email, first_name, last_name, marketing_opt_in, deleted_at, deletion_status ON public.profiles
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email
     OR OLD.first_name IS DISTINCT FROM NEW.first_name
     OR OLD.last_name IS DISTINCT FROM NEW.last_name
     OR OLD.marketing_opt_in IS DISTINCT FROM NEW.marketing_opt_in
     OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
     OR OLD.deletion_status IS DISTINCT FROM NEW.deletion_status)
  EXECUTE FUNCTION public.trg_mailchimp_profiles();

DROP TRIGGER IF EXISTS mailchimp_profiles_del ON public.profiles;
CREATE TRIGGER mailchimp_profiles_del AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_mailchimp_profiles();

-- ---------- profile_tags (statement level: sync_auto_tags() inserts in bulk) ----------
CREATE OR REPLACE FUNCTION public.trg_mailchimp_profile_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.mailchimp_enqueue_many(
        (SELECT array_agg(DISTINCT p.email) FROM new_rows r JOIN public.profiles p ON p.id = r.profile_id),
        'tags_changed', false);
    ELSE
      PERFORM public.mailchimp_enqueue_many(
        (SELECT array_agg(DISTINCT p.email) FROM old_rows r JOIN public.profiles p ON p.id = r.profile_id),
        'tags_changed', false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_mailchimp_profile_tags: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS mailchimp_profile_tags_ins ON public.profile_tags;
CREATE TRIGGER mailchimp_profile_tags_ins AFTER INSERT ON public.profile_tags
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_mailchimp_profile_tags();

DROP TRIGGER IF EXISTS mailchimp_profile_tags_del ON public.profile_tags;
CREATE TRIGGER mailchimp_profile_tags_del AFTER DELETE ON public.profile_tags
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_mailchimp_profile_tags();

-- ---------- email_tags rename: every holder's tag set changed ----------
CREATE OR REPLACE FUNCTION public.trg_mailchimp_email_tags_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.mailchimp_enqueue_many(
      (SELECT array_agg(DISTINCT p.email) FROM public.profile_tags pt JOIN public.profiles p ON p.id = pt.profile_id
        WHERE pt.tag_id = NEW.id),
      'tag_renamed', false);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_mailchimp_email_tags_rename: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS mailchimp_email_tags_rename ON public.email_tags;
CREATE TRIGGER mailchimp_email_tags_rename AFTER UPDATE OF name ON public.email_tags
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION public.trg_mailchimp_email_tags_rename();

-- ---------- email_suppressions (address death in or out) ----------
CREATE OR REPLACE FUNCTION public.trg_mailchimp_suppressions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.mailchimp_enqueue_many((SELECT array_agg(email) FROM new_rows), 'suppression_added', false);
    ELSE
      PERFORM public.mailchimp_enqueue_many((SELECT array_agg(email) FROM old_rows), 'suppression_removed', false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_mailchimp_suppressions: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS mailchimp_suppressions_ins ON public.email_suppressions;
CREATE TRIGGER mailchimp_suppressions_ins AFTER INSERT ON public.email_suppressions
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_mailchimp_suppressions();

DROP TRIGGER IF EXISTS mailchimp_suppressions_del ON public.email_suppressions;
CREATE TRIGGER mailchimp_suppressions_del AFTER DELETE ON public.email_suppressions
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_mailchimp_suppressions();

-- ---------- newsletter_subscribers (website signups) ----------
CREATE OR REPLACE FUNCTION public.trg_mailchimp_newsletter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' AND lower(trim(OLD.email)) IS DISTINCT FROM lower(trim(NEW.email)) THEN
      PERFORM public.mailchimp_enqueue(OLD.email, 'email_changed_from', false);
    END IF;
    PERFORM public.mailchimp_enqueue(
      NEW.email,
      'newsletter_changed',
      (TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed'));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_mailchimp_newsletter: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS mailchimp_newsletter_ins ON public.newsletter_subscribers;
CREATE TRIGGER mailchimp_newsletter_ins AFTER INSERT ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.trg_mailchimp_newsletter();

DROP TRIGGER IF EXISTS mailchimp_newsletter_upd ON public.newsletter_subscribers;
CREATE TRIGGER mailchimp_newsletter_upd AFTER UPDATE OF email, first_name, status ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.trg_mailchimp_newsletter();

-- ============================================================
-- The mapping: one Mailchimp contact per lowercased address
-- ============================================================
--
-- Rules (mirrored and tested in _shared/mailchimp.ts + _tests/mailchimp.test.ts):
--  * A live profile is one with an email, deleted_at NULL and not pending
--    deletion. Anything else does not appear here, so it is archived.
--  * Several live profiles can share an address (17 lowercase duplicates on
--    2026-10-22). They collapse to ONE contact: unsubscribed if ANY of them
--    opted out (consent is conservative), tags are the union, and the name
--    comes from the newest profile that has one.
--  * A website newsletter row counts only when confirmed or unsubscribed.
--    'pending' is skipped on purpose: pushing it as Mailchimp 'pending' would
--    make Mailchimp email that person a confirmation request.
--  * A newsletter 'unsubscribed' also opts out a member with the same address.
--  * An address in email_suppressions is 'unsubscribed' in Mailchimp.
CREATE OR REPLACE FUNCTION public.mailchimp_contacts(
  p_emails text[] DEFAULT NULL,
  p_after  text   DEFAULT NULL,
  p_limit  integer DEFAULT 500
)
RETURNS TABLE (
  email      text,
  profile_id uuid,
  first_name text,
  last_name  text,
  source     text,
  status     text,
  tags       text[],
  suppressed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH live AS (
    SELECT p.id, lower(trim(p.email)) AS email, p.first_name, p.last_name,
           (p.marketing_opt_in IS DISTINCT FROM false) AS opted_in, p.created_at
    FROM public.profiles p
    WHERE p.email IS NOT NULL AND trim(p.email) <> ''
      AND p.deleted_at IS NULL
      AND p.deletion_status IS DISTINCT FROM 'pending_deletion'
      AND (p_emails IS NULL OR lower(trim(p.email)) = ANY (ARRAY(SELECT lower(trim(e)) FROM unnest(p_emails) e)))
      AND (p_after IS NULL OR lower(trim(p.email)) > p_after)
  ),
  per_email AS (
    SELECT l.email,
           (array_agg(l.id ORDER BY (l.first_name IS NOT NULL OR l.last_name IS NOT NULL) DESC, l.created_at DESC))[1] AS profile_id,
           bool_and(l.opted_in) AS opted_in,
           array_agg(l.id) AS ids
    FROM live l
    GROUP BY l.email
  ),
  nl AS (
    SELECT DISTINCT ON (lower(trim(n.email)))
           lower(trim(n.email)) AS email, n.first_name, n.status
    FROM public.newsletter_subscribers n
    WHERE n.email IS NOT NULL
      AND (p_emails IS NULL OR lower(trim(n.email)) = ANY (ARRAY(SELECT lower(trim(e)) FROM unnest(p_emails) e)))
      AND (p_after IS NULL OR lower(trim(n.email)) > p_after)
    ORDER BY lower(trim(n.email)), n.created_at DESC
  ),
  contacts AS (
    SELECT pe.email, pe.profile_id, p.first_name, p.last_name, 'profile'::text AS source,
           pe.opted_in AND coalesce(nl.status, '') <> 'unsubscribed' AS opted_in,
           coalesce((SELECT array_agg(DISTINCT t.name ORDER BY t.name)
                     FROM public.profile_tags pt JOIN public.email_tags t ON t.id = pt.tag_id
                     WHERE pt.profile_id = ANY (pe.ids)), '{}'::text[]) AS tags
    FROM per_email pe
    JOIN public.profiles p ON p.id = pe.profile_id
    LEFT JOIN nl ON nl.email = pe.email
    UNION ALL
    SELECT nl.email, NULL::uuid, nl.first_name, NULL::text, 'newsletter'::text,
           nl.status = 'confirmed', '{}'::text[]
    FROM nl
    WHERE nl.status IN ('confirmed', 'unsubscribed')
      AND NOT EXISTS (SELECT 1 FROM per_email pe WHERE pe.email = nl.email)
  )
  SELECT c.email, c.profile_id, c.first_name, c.last_name, c.source,
         CASE WHEN s.suppressed OR NOT c.opted_in THEN 'unsubscribed' ELSE 'subscribed' END,
         c.tags,
         s.suppressed
  FROM contacts c
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM public.email_suppressions es WHERE lower(trim(es.email)) = c.email) AS suppressed
  ) s
  ORDER BY c.email
  LIMIT greatest(1, least(coalesce(p_limit, 500), 5000));
$function$;

-- State rows whose address is no longer a contact at all (profile hard-deleted,
-- newsletter row removed): the full sync archives these.
CREATE OR REPLACE FUNCTION public.mailchimp_orphaned_state(p_audience_id text, p_limit integer DEFAULT 200)
RETURNS TABLE (email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.email
  FROM public.mailchimp_sync_state s
  WHERE s.audience_id = p_audience_id
    AND s.mc_status IS DISTINCT FROM 'archived'
    AND s.email NOT IN (SELECT c.email FROM public.mailchimp_contacts(NULL, NULL, 5000) c)
  ORDER BY s.email
  LIMIT greatest(1, least(coalesce(p_limit, 200), 1000));
$function$;

-- Claim a batch. A row re-enqueued mid-flight gets version+1 and claimed_at
-- NULL, so the drain's version-pinned delete leaves the newer change queued.
CREATE OR REPLACE FUNCTION public.mailchimp_claim_queue(p_limit integer DEFAULT 100)
RETURNS TABLE (email text, consent boolean, version integer, attempts integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.mailchimp_sync_queue q
     SET claimed_at = now(), attempts = q.attempts + 1
   WHERE q.email IN (
     SELECT q2.email FROM public.mailchimp_sync_queue q2
      WHERE (q2.claimed_at IS NULL OR q2.claimed_at < now() - interval '10 minutes')
        AND q2.attempts < 8
      ORDER BY q2.enqueued_at
      LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.email, q.consent, q.version, q.attempts;
$function$;

REVOKE ALL ON FUNCTION public.mailchimp_enqueue_many(text[], text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mailchimp_enqueue(text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mailchimp_contacts(text[], text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mailchimp_orphaned_state(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mailchimp_claim_queue(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mailchimp_profiles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mailchimp_profile_tags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mailchimp_email_tags_rename() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mailchimp_suppressions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mailchimp_newsletter() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailchimp_contacts(text[], text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mailchimp_orphaned_state(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mailchimp_claim_queue(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mailchimp_enqueue_many(text[], text, boolean) TO service_role;

-- ============================================================
-- Cron drain
-- ============================================================
-- Does nothing (no HTTP call at all) while auto-sync is off or the queue holds
-- nothing claimable. Authenticates to the function with the per-install cron
-- token in mailchimp_sync_secrets, which the function reads back with its own
-- service-role client, so it never depends on the vault key matching the
-- function's env key.
CREATE OR REPLACE FUNCTION public.cron_mailchimp_sync_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  edge_url text := 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/mailchimp-sync';
  svc_key  text;
  tok      text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mailchimp_sync_config WHERE id AND auto_sync) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mailchimp_sync_queue
     WHERE (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes') AND attempts < 8
  ) THEN
    RETURN;
  END IF;
  svc_key := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
  tok     := (SELECT cron_token FROM public.mailchimp_sync_secrets WHERE id);
  PERFORM net.http_post(
    url     := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(svc_key, ''),
      'x-mailchimp-cron', tok),
    body    := '{"action":"sync","mode":"queue"}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_mailchimp_sync_drain() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mailchimp-sync-drain';
    PERFORM cron.schedule('mailchimp-sync-drain', '*/5 * * * *', 'SELECT public.cron_mailchimp_sync_drain()');
  END IF;
END
$do$;

COMMENT ON TABLE public.mailchimp_sync_config IS
  'Mailchimp member sync settings. scope=allowlist syncs only the listed addresses (test phase); scope=all syncs every member. See migration 20261022060000.';
COMMENT ON FUNCTION public.mailchimp_contacts(text[], text, integer) IS
  'One Mailchimp contact per lowercased address, resolved from profiles, profile_tags/email_tags, newsletter_subscribers and email_suppressions. Service role only.';
