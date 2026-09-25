-- Members who cannot receive Co-Exist email, surfaced to admins (2026-09-25).
--
-- WHY THIS EXISTS. On 2026-09-18, proving a re-send of the Healesville invite,
-- eight members turned out to receive no app email at all because the address
-- on their account cannot be right: gmail.con x3, hotmail.con, icloud.con,
-- gmail.co, gmai.com, and hayesabigail@y7mail with no TLD at all. Six had
-- already bounced and been auto-suppressed by resend-webhook, which is the
-- bounce handler working as designed and is exactly why nobody noticed: a member
-- who mistypes their address disappears silently and permanently, and the app
-- tells no one.
--
-- THE WORST CASE NEVER BOUNCES. gmai.com has a live MX (mail.h-email.net, a
-- typo-squat catcher), and resend_events shows four email.delivered rows for
-- kiliclyla@gmai.com since 2026-09-04: her welcome and event registrations are
-- being handed to a stranger's mail server. Suppression can never see that
-- member, because nothing bounces. So there are three independent reasons a
-- member is unreachable, and this function checks all three:
--   1. The address fails the sender's own shape check (malformed / no TLD), so
--      the sender skips the member entirely (recipient-email.ts, reason 'none').
--   2. The address is in email_suppressions (hard bounce / complaint), so every
--      egress point refuses it (_shared/egress-suppression.ts).
--   3. The domain is one keystroke from a major provider (gmai.com, gamil.com,
--      gmail.co, idloud.com, gmail.con). It may bounce later or it may be
--      delivered to someone else; either way the member never reads it.
--
-- READ-ONLY, AND IT NEVER CORRECTS AN ADDRESS. A suggested address is returned
-- for a human to confirm with the member. Writing a guessed address into a
-- member record would still mean mailing a person somewhere they never gave us.
--
-- ACCESS. SECURITY DEFINER because it reads auth.users, with the SAME gate as the
-- /admin/email route (RequireCapability manage_email) checked in the body, the
-- admin_list_users shape. EXECUTE is revoked from PUBLIC and anon, so anon is
-- refused by the ACL; a signed-in member without the capability is refused by
-- the body with 42501. There is no Postgres "admin" role: admins call rpc as
-- `authenticated`, so revoking authenticated would lock the admin out too.

-- ---------------------------------------------------------------------------
-- 1. The sender's shape check, in SQL.
--    The pattern below MUST equal SENDABLE_RE in
--    supabase/functions/_shared/recipient-email.ts character for character.
--    src/test/unreachable-members-sendable-parity.test.ts parses this literal
--    and fails the build if the two drift, because an admin view that disagrees
--    with the sender is worse than none.
-- ---------------------------------------------------------------------------
create or replace function public.coexist_email_sendable(p_email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    regexp_replace(p_email, '^\s+|\s+$', '', 'g') ~ '^[^\s@,;:<>"'']+@[^\s@,;:<>"'']+\.[A-Za-z]{2,}$',
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Optimal-string-alignment distance (Levenshtein plus adjacent transposition,
--    so gamil.com is ONE edit from gmail.com). fuzzystrmatch is not installed on
--    this project and its levenshtein() counts a transposition as two.
-- ---------------------------------------------------------------------------
create or replace function public.coexist_osa_distance(a text, b text)
returns integer
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  la int := length(a);
  lb int := length(b);
  d int[];
  i int;
  j int;
  w int := length(b) + 1;
  cost int;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  -- Flattened (la+1) x (lb+1) matrix: cell (i, j) lives at i * w + j + 1.
  d := array_fill(0, array[(la + 1) * w]);
  for i in 0..la loop d[i * w + 1] := i; end loop;
  for j in 0..lb loop d[j + 1] := j; end loop;
  for i in 1..la loop
    for j in 1..lb loop
      cost := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      d[i * w + j + 1] := least(
        d[(i - 1) * w + j + 1] + 1,
        d[i * w + j] + 1,
        d[(i - 1) * w + j] + cost
      );
      if i > 1 and j > 1
         and substr(a, i, 1) = substr(b, j - 1, 1)
         and substr(a, i - 1, 1) = substr(b, j, 1) then
        d[i * w + j + 1] := least(d[i * w + j + 1], d[(i - 2) * w + j - 1] + 1);
      end if;
    end loop;
  end loop;
  return d[la * w + lb + 1];
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Likely-typo detection. Returns the address the member probably meant, or
--    NULL when the address looks deliberate. Four rules, most certain first:
--      a) no TLD, and adding .com / .com.au gives a real provider (y7mail)
--      b) a TLD that does not exist and sits one key from .com (.con, .cmo)
--      c) one edit from a major provider of 9+ characters (gmai.com, gmail.co)
--      d) a single-domain brand under the wrong suffix (gmail.vin,
--         icloud.net.au, coexistaus.org.au). Gmail, iCloud and Co-Exist have NO
--         country variants, unlike hotmail.fr or yahoo.de, which are real and
--         must never be flagged; that is why this rule names three brands only.
--    An exact provider match is never flagged. Rule c only measures against
--    providers of 9+ characters because short ones collide with real domains
--    (aon.com is one edit from aol.com; mail.com and ymail.com are one edit from
--    gmail.com, which is why both are in the list as real providers).
--    Calibrated 2026-09-25 against every live member domain (111 distinct over
--    3,103 accounts): it flags 14 domains, every one a typo (gmail.con x4,
--    gmai.com, gamil.com, gmail.co, gmail.vin, hotmail.con, hotmail.co,
--    hotmail.com.ah, icloud.con, icloud.net.au, idloud.com, bigoond.com,
--    coexistaus.org.au, y7mail), and leaves mail.com, ymail.com, fastmail.fm,
--    yahoo.com.tw, hotmail.fr, yahoo.de and live.fr alone. predicate-counted.
-- ---------------------------------------------------------------------------
create or replace function public.coexist_email_typo_suggestion(p_email text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  c_providers constant text[] := array[
    'gmail.com', 'googlemail.com',
    'hotmail.com', 'hotmail.com.au', 'hotmail.co.uk',
    'outlook.com', 'outlook.com.au', 'live.com', 'live.com.au', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'yahoo.com', 'yahoo.com.au', 'yahoo.co.uk', 'ymail.com', 'myyahoo.com',
    'rocketmail.com', 'y7mail.com', 'aol.com',
    'bigpond.com', 'bigpond.net.au', 'optusnet.com.au', 'iinet.net.au',
    'westnet.com.au', 'tpg.com.au', 'iprimus.com.au', 'internode.on.net',
    'telstra.com', 'protonmail.com', 'proton.me', 'pm.me', 'fastmail.com',
    'gmx.com', 'mail.com', 'email.com', 'qq.com',
    'coexistaus.org'
  ];
  c_single_domain_brands constant text[] := array[
    'gmail.com', 'icloud.com', 'coexistaus.org'
  ];
  c_typo_tlds constant text[] := array[
    'con', 'cmo', 'ocm', 'vom', 'xom', 'cpm', 'cim', 'clm', 'comm', 'coom'
  ];
  v_addr text := regexp_replace(coalesce(p_email, ''), '^\s+|\s+$', '', 'g');
  v_at int;
  v_local text;
  v_domain text;
  v_tld text;
  v_candidate text;
  v_best text;
  v_best_d int := 99;
  v_d int;
begin
  if position('@' in v_addr) = 0 then return null; end if;
  -- Split on the LAST '@', so a quoted local part cannot shift the domain.
  v_at := length(v_addr) - position('@' in reverse(v_addr)) + 1;
  v_local := left(v_addr, v_at - 1);
  v_domain := lower(substr(v_addr, v_at + 1));
  if v_local = '' or v_domain = '' then return null; end if;
  if v_domain = any(c_providers) then return null; end if;

  -- a) No TLD at all.
  if position('.' in v_domain) = 0 then
    foreach v_candidate in array array[v_domain || '.com', v_domain || '.com.au'] loop
      if v_candidate = any(c_providers) then return v_local || '@' || v_candidate; end if;
    end loop;
    return null;
  end if;

  -- b) A TLD that does not exist and is one key off .com.
  v_tld := substring(v_domain from '\.([^.]+)$');
  if v_tld = any(c_typo_tlds) then
    return v_local || '@' || regexp_replace(v_domain, '\.[^.]+$', '.com');
  end if;

  -- c) One edit from a major provider.
  foreach v_candidate in array c_providers loop
    continue when length(v_candidate) < 9;
    continue when abs(length(v_candidate) - length(v_domain)) > 1;
    v_d := public.coexist_osa_distance(v_domain, v_candidate);
    if v_d < v_best_d then
      v_best_d := v_d;
      v_best := v_candidate;
    end if;
  end loop;
  if v_best_d = 1 then return v_local || '@' || v_best; end if;

  -- d) A single-domain brand under the wrong suffix.
  foreach v_candidate in array c_single_domain_brands loop
    if split_part(v_domain, '.', 1) = split_part(v_candidate, '.', 1) then
      return v_local || '@' || v_candidate;
    end if;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The admin read. One row per member who cannot receive app email.
--    The address judged is the one the SENDER would use: resolveRecipientEmail
--    in recipient-email.ts, all four branches, mirrored below. Judging only
--    auth.users.email would flag Apple-relay members whose profile address is
--    the one we actually deliver to.
--    Excluded on purpose: accounts pending deletion, and our own test domains
--    (reserved TLDs, example.*, coexist.dev / coexist.local e2e accounts, the
--    Play pre-launch robots at cloudtestlabaccounts.com, resend.dev), which are
--    undeliverable by design and would bury the members Kurt can actually help.
-- ---------------------------------------------------------------------------
create or replace function public.admin_unreachable_members()
returns table (
  user_id uuid,
  display_name text,
  auth_email text,
  profile_email text,
  judged_email text,
  reasons text[],
  suppression_reason text,
  suppressed_at timestamptz,
  suggested_email text,
  collectives text[],
  member_since timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin_or_staff(auth.uid()) and public.has_cap('manage_email')) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  with base as (
    select
      p.id as uid,
      p.display_name as dname,
      p.created_at as since,
      u.last_sign_in_at as last_in,
      nullif(regexp_replace(coalesce(u.email::text, ''), '^\s+|\s+$', '', 'g'), '') as a_email,
      nullif(regexp_replace(coalesce(p.email, ''), '^\s+|\s+$', '', 'g'), '') as p_email
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.deleted_at is null
  ),
  resolved as (
    select
      b.*,
      case
        when public.coexist_email_sendable(b.a_email)
             and lower(b.a_email) not like '%@privaterelay.appleid.com' then b.a_email
        when public.coexist_email_sendable(b.a_email) then
          case
            when public.coexist_email_sendable(b.p_email)
                 and lower(b.p_email) not like '%@privaterelay.appleid.com' then b.p_email
            else b.a_email
          end
        when public.coexist_email_sendable(b.p_email) then b.p_email
        else null
      end as deliver
    from base b
  ),
  judged as (
    select
      r.*,
      coalesce(r.deliver, r.a_email, r.p_email) as shown,
      s.reason as s_reason,
      s.created_at as s_at
    from resolved r
    left join lateral (
      select es.reason, es.created_at
      from public.email_suppressions es
      where lower(btrim(es.email)) = lower(r.deliver)
      order by es.created_at desc
      limit 1
    ) s on r.deliver is not null
  ),
  flagged as (
    select
      j.*,
      public.coexist_email_typo_suggestion(j.shown) as suggestion,
      -- coalesce, not a bare split_part: a member with NO address has a NULL
      -- domain, NOT (NULL IN (...)) is NULL, and the test-domain filter below
      -- would silently drop exactly the member this surface exists to show.
      coalesce(lower(split_part(j.shown, '@', 2)), '') as dom
    from judged j
  ),
  classified as (
    select
      f.*,
      array_remove(array[
        case when f.shown is null then 'no_address' end,
        case when f.shown is not null and f.deliver is null
              and position('.' in f.dom) = 0 and f.dom <> '' then 'no_tld' end,
        case when f.shown is not null and f.deliver is null
              and not (position('.' in f.dom) = 0 and f.dom <> '') then 'malformed' end,
        case when f.s_reason = 'bounce' then 'bounced' end,
        case when f.s_reason = 'complaint' then 'complained' end,
        case when f.s_reason is not null and f.s_reason not in ('bounce', 'complaint') then 'suppressed' end,
        case when f.suggestion is not null then 'typo_domain' end
      ], null) as why
    from flagged f
  )
  select
    c.uid,
    c.dname,
    c.a_email,
    c.p_email,
    c.shown,
    c.why,
    c.s_reason,
    c.s_at,
    c.suggestion,
    coalesce((
      select array_agg(col.name order by col.name)
      from public.collective_members cm
      join public.collectives col on col.id = cm.collective_id
      where cm.user_id = c.uid and cm.status = 'active'
    ), array[]::text[]),
    c.since,
    c.last_in
  from classified c
  where cardinality(c.why) > 0
    and not (
      c.dom in ('coexist.dev', 'coexist.local', 'cloudtestlabaccounts.com', 'resend.dev',
                'example.com', 'example.org', 'example.net')
      or c.dom ~ '\.(invalid|test|example|localhost|local)$'
    )
  order by c.since desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Supabase default privileges hand every new public function to anon
-- and authenticated, so REVOKE FROM PUBLIC alone would leave both grants in
-- place. The helpers are only ever called from inside the definer above, which
-- runs as its owner, so no client role needs them at all.
-- ---------------------------------------------------------------------------
revoke all on function public.coexist_email_sendable(text) from public, anon, authenticated;
revoke all on function public.coexist_osa_distance(text, text) from public, anon, authenticated;
revoke all on function public.coexist_email_typo_suggestion(text) from public, anon, authenticated;
grant execute on function public.coexist_email_sendable(text) to service_role;
grant execute on function public.coexist_osa_distance(text, text) to service_role;
grant execute on function public.coexist_email_typo_suggestion(text) to service_role;

revoke all on function public.admin_unreachable_members() from public, anon;
grant execute on function public.admin_unreachable_members() to authenticated, service_role;

comment on function public.admin_unreachable_members() is
  'Members who cannot receive Co-Exist email (malformed / no TLD / suppressed / likely-typo domain). Read-only; never corrects an address. Gate: is_admin_or_staff + has_cap(manage_email), in body. See migration 20260925120000.';
