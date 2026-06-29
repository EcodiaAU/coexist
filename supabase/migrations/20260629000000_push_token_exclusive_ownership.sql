-- Push token exclusive device ownership
--
-- ROOT CAUSE (2026-06-29): an FCM/APNs registration token is bound to a device
-- (app install), not to a user. The old unique constraint (user_id, token) let
-- the SAME device token be owned by MULTIPLE users at once. When a user signed
-- out and another signed in on the same device, the prior user's (user_id,token)
-- row survived, so send-push (which fetches tokens by user_id) still delivered
-- that prior user's notifications to a device they were no longer signed into.
-- Observed in prod: one iOS token owned by tate@, apple@ and a test account.
--
-- The client cannot self-heal: RLS only lets a user delete their OWN rows, so a
-- newly-signed-in user cannot evict the previous owner's stale row.
--
-- FIX: enforce the invariant "one device token belongs to exactly one user".
--   1. Collapse existing duplicates, keeping the most-recently-updated owner.
--   2. Replace unique(user_id, token) with unique(token).
--   3. Add a SECURITY DEFINER RPC `claim_push_token` that atomically evicts any
--      other user's claim on the token (RLS-bypassing) and upserts the caller's.
--      The client calls this on registration instead of a plain upsert, so the
--      current device owner is always the only owner.

/* ------------------------------------------------------------------ */
/*  1. Collapse existing duplicate token rows (keep newest owner)      */
/* ------------------------------------------------------------------ */

delete from public.push_tokens
where id in (
  select id from (
    select id,
           row_number() over (
             partition by token
             order by updated_at desc, created_at desc, id desc
           ) as rn
    from public.push_tokens
  ) ranked
  where ranked.rn > 1
);

/* ------------------------------------------------------------------ */
/*  2. One token = one user (add unique(token))                        */
/*                                                                     */
/*  We ADD unique(token) but deliberately KEEP the existing            */
/*  unique(user_id, token). Old app builds still in the field call     */
/*  .upsert(onConflict: 'user_id,token'); if that index disappeared    */
/*  their token storage would error and push would silently degrade    */
/*  until every user updated. Keeping both: unique(token) is the new   */
/*  binding invariant (one device token = one user); unique(user_id,   */
/*  token) keeps old clients' upsert target resolvable. On old clients */
/*  a cross-user re-claim now fails CLOSED (insert violates            */
/*  unique(token)) instead of creating the duplicate that caused the   */
/*  bug; new builds use claim_push_token and are fully correct.        */
/* ------------------------------------------------------------------ */

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'push_tokens_token_unique'
      and conrelid = 'public.push_tokens'::regclass
  ) then
    alter table public.push_tokens
      add constraint push_tokens_token_unique unique (token);
  end if;
end $$;

/* ------------------------------------------------------------------ */
/*  3. Atomic exclusive-claim RPC                                     */
/* ------------------------------------------------------------------ */

create or replace function public.claim_push_token(
  p_token       text,
  p_platform    text,
  p_device_info jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'claim_push_token: not authenticated';
  end if;
  if p_token is null or length(p_token) = 0 then
    raise exception 'claim_push_token: token required';
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'claim_push_token: invalid platform %', p_platform;
  end if;

  -- Evict any OTHER user's claim on this device token. SECURITY DEFINER lets us
  -- delete rows the caller could not delete under RLS. This is the heal that the
  -- client cannot do for itself when a previous user did not sign out cleanly.
  delete from public.push_tokens
  where token = p_token
    and user_id <> v_uid;

  -- Upsert the caller's ownership. After the delete above the only possible
  -- conflicting row on unique(token) is the caller's own previous row.
  insert into public.push_tokens (user_id, token, platform, device_info, updated_at)
  values (v_uid, p_token, p_platform, coalesce(p_device_info, '{}'::jsonb), now())
  on conflict (token) do update
    set user_id     = excluded.user_id,
        platform    = excluded.platform,
        device_info = excluded.device_info,
        updated_at  = now();
end;
$$;

revoke all on function public.claim_push_token(text, text, jsonb) from public;
-- Supabase default privileges also grant EXECUTE to anon; an anon caller would
-- be rejected by the auth.uid() null-check anyway, but revoke it for least
-- privilege so only signed-in users can claim a token.
revoke execute on function public.claim_push_token(text, text, jsonb) from anon;
grant execute on function public.claim_push_token(text, text, jsonb) to authenticated;
