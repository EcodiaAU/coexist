-- =====================================================================
-- D2 Security B: privilege / authz RLS-write hardening
-- Co-Exist remediation program (2026-08-10). Additive + reversible only.
--
-- Closes six DB-layer authorization holes where the trust boundary was
-- enforced only in client JavaScript (authorization-lives-in-the-database):
--
--   F302  Manager self-promote to admin: profiles_update_admin had
--         with_check=NULL, so any UPDATE that passed USING could set
--         role=admin. A BEFORE UPDATE trigger now enforces role semantics.
--   F658  Member-removal / role hierarchy: collective_members_update_leader
--         (and the delete + self-insert policies) had no rank predicate.
--         A BEFORE INSERT/UPDATE/DELETE trigger now enforces the hierarchy.
--   F303  legal_pages writes checked a role list but not the manage_system
--         capability the UI route requires (admin-only). Policies now
--         require has_cap('manage_system'), aligning DB with UI.
--   F475  updates_select_authenticated was USING(true): every authenticated
--         user could read the full body of a collective-specific / leaders
--         update over the wire. Policy is now audience-scoped.
--   F305  audit_log_select was is_super_admin only, but view_audit_log is a
--         manager-default capability -> managers saw an empty page. Policy
--         now honours the capability (is_admin_or_staff AND has_cap).
--   F652  carpool_seats.pickup_* (home addresses) were readable by every
--         collective/channel member via SELECT and the realtime payload.
--         SELECT on those columns is revoked from authenticated/anon so
--         neither a direct fetch nor the realtime broadcast can carry them;
--         the safe view is re-pointed at the SECURITY DEFINER pickup RPC.
--   F306  manage_finances default cap removed (dead: gates nothing) for
--         parity with the frontend catalogue removal.
--
-- ROLLBACK NOTES (all reversible):
--   drop trigger trg_enforce_profile_role_change on public.profiles;
--   drop trigger trg_enforce_collective_member_hierarchy on public.collective_members;
--   drop function public.enforce_profile_role_change();
--   drop function public.enforce_collective_member_hierarchy();
--   GRANT SELECT (pickup_address_text,pickup_lat,pickup_lng) ON public.carpool_seats TO authenticated, anon;
--   ALTER POLICY ... (restore prior USING/WITH CHECK expressions).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shared helper: unified role -> rank (mirrors src/lib/constants.ts ROLE_RANK)
-- participant/member 0 < assist_leader 1 < co_leader 2 <
-- leader/national_leader/national_staff 3 < manager/national_admin 4 <
-- admin/super_admin 5. Unknown -> -1.
-- ---------------------------------------------------------------------
-- NOTE: an earlier migration already defines role_rank(r text). CREATE OR
-- REPLACE cannot rename an input parameter, so keep the name `r` and extend
-- the mapping with the national_*/super_admin aliases (unknown -> -1).
create or replace function public.role_rank(r text)
returns int
language sql
immutable
as $$
  select case r
    when 'participant'     then 0
    when 'member'          then 0
    when 'assist_leader'   then 1
    when 'co_leader'       then 2
    when 'leader'          then 3
    when 'national_leader' then 3
    when 'national_staff'  then 3
    when 'manager'         then 4
    when 'national_admin'  then 4
    when 'admin'           then 5
    when 'super_admin'     then 5
    else -1
  end;
$$;

-- =====================================================================
-- F302: profiles role-change guard
-- Enforces, for any actor who is NOT a super-admin (role=admin):
--   * cannot change their own role
--   * cannot assign the admin or manager role
--   * cannot assign a role at or above their own rank
-- Service-role / edge-function context (auth.uid() IS NULL) is unaffected.
-- Non-role updates (e.g. is_suspended, display_name) short-circuit.
-- =====================================================================
create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  if new.role is not distinct from old.role then
    return new; -- no role change; nothing to enforce
  end if;
  if v_actor is null then
    return new; -- service role / migrations / edge functions
  end if;
  if public.is_super_admin(v_actor) then
    return new; -- admins may assign any role
  end if;

  if new.id = v_actor then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  if new.role in ('admin', 'manager') then
    raise exception 'Only admins may assign the admin or manager role' using errcode = '42501';
  end if;

  select p.role::text into v_actor_role from public.profiles p where p.id = v_actor;
  if public.role_rank(new.role::text) >= public.role_rank(coalesce(v_actor_role, 'participant')) then
    raise exception 'You cannot assign a role at or above your own' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_role_change on public.profiles;
create trigger trg_enforce_profile_role_change
  before update on public.profiles
  for each row execute function public.enforce_profile_role_change();

-- =====================================================================
-- F658: collective_members membership hierarchy guard
-- Mirrors the client rank rules (use-collective.ts useRemoveMember /
-- useUpdateMemberRole) in the DB so a direct supabase-js call cannot bypass
-- them. For any actor who is NOT global staff (is_admin_or_staff):
--   INSERT: a self-join must be role=participant (no self-escalation).
--   UPDATE(self): cannot raise your own role rank.
--   UPDATE(other): must be an active member of the collective, must strictly
--                  outrank the target's current role, and cannot assign a
--                  role at or above your own rank.
--   DELETE(other): must strictly outrank the target (self-leave allowed).
-- Service-role context (auth.uid() IS NULL) is unaffected.
-- =====================================================================
create or replace function public.enforce_collective_member_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_rank int;
begin
  -- Service role / no auth context: privileged, allow.
  if v_actor is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  -- Global staff / admin manage freely (mirrors client isGlobalStaff).
  if public.is_admin_or_staff(v_actor) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id = v_actor and public.role_rank(new.role::text) > 0 then
      raise exception 'You can only join a collective as a participant' using errcode = '42501';
    end if;
    return new; -- other-user inserts are constrained by RLS with_check
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id = v_actor then
      if public.role_rank(new.role::text) > public.role_rank(old.role::text) then
        raise exception 'You cannot escalate your own role' using errcode = '42501';
      end if;
      return new;
    end if;
    select public.role_rank(cm.role::text) into v_actor_rank
      from public.collective_members cm
      where cm.user_id = v_actor and cm.collective_id = new.collective_id and cm.status = 'active'
      limit 1;
    v_actor_rank := coalesce(v_actor_rank, -1);
    if public.role_rank(old.role::text) >= v_actor_rank then
      raise exception 'You can only manage members ranked below you' using errcode = '42501';
    end if;
    if public.role_rank(new.role::text) >= v_actor_rank then
      raise exception 'You cannot assign a role at or above your own rank' using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE
  if old.user_id = v_actor then
    return old; -- self-leave is allowed
  end if;
  select public.role_rank(cm.role::text) into v_actor_rank
    from public.collective_members cm
    where cm.user_id = v_actor and cm.collective_id = old.collective_id and cm.status = 'active'
    limit 1;
  v_actor_rank := coalesce(v_actor_rank, -1);
  if public.role_rank(old.role::text) >= v_actor_rank then
    raise exception 'You can only remove members ranked below you' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_enforce_collective_member_hierarchy on public.collective_members;
create trigger trg_enforce_collective_member_hierarchy
  before insert or update or delete on public.collective_members
  for each row execute function public.enforce_collective_member_hierarchy();

-- =====================================================================
-- F303: legal_pages writes require manage_system (align DB with the
-- admin-only UI route gate). INSERT and UPDATE only; reads unchanged.
-- =====================================================================
alter policy "Staff can insert legal pages" on public.legal_pages
  with check (public.is_admin_or_staff(auth.uid()) and public.has_cap('manage_system'));

alter policy "Staff can update legal pages" on public.legal_pages
  using (public.is_admin_or_staff(auth.uid()) and public.has_cap('manage_system'))
  with check (public.is_admin_or_staff(auth.uid()) and public.has_cap('manage_system'));

-- =====================================================================
-- F475: updates SELECT becomes audience-scoped (was USING(true)).
-- Mirrors the client filterByAudience so a targeted update's body no longer
-- reaches non-recipients over the wire. Client filter remains as UX.
-- =====================================================================
create or replace function public.is_any_collective_leader(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.collective_members
    where user_id = uid
      and status = 'active'
      and role in ('leader', 'co_leader', 'assist_leader')
  );
$$;

alter policy "updates_select_authenticated" on public.updates
  using (
    public.is_admin_or_staff(auth.uid())
    or target_audience = 'all'
    or (target_audience = 'leaders' and public.is_any_collective_leader(auth.uid()))
    or (
      target_audience = 'collective_specific'
      and (
        target_collective_id is null
        or public.is_fellow_collective_member(auth.uid(), target_collective_id)
      )
    )
  );

-- =====================================================================
-- F305: audit_log SELECT honours the view_audit_log capability (a manager
-- default) instead of super-admin only, so the manager Audit Log page
-- shows rows rather than a silent empty list. Still gated by the capability.
-- =====================================================================
alter policy "audit_log_select_super_admin" on public.audit_log
  using (public.is_admin_or_staff(auth.uid()) and public.has_cap('view_audit_log'));

comment on policy "audit_log_select_super_admin" on public.audit_log is
  'D2/F305: broadened from is_super_admin to (is_admin_or_staff AND has_cap(view_audit_log)) so the manager-default view_audit_log capability actually resolves rows. Name retained for migration stability.';

-- =====================================================================
-- F652: carpool pickup PII. A column-level REVOKE is a no-op while a
-- table-level SELECT grant exists (authenticated + anon both hold one), so
-- remove the table-level SELECT and re-grant SELECT on ONLY the non-pickup
-- columns. pickup_address_text/lat/lng then become unreadable by
-- authenticated/anon over BOTH a direct fetch (permission denied) AND the
-- realtime payload (walrus filters columns by has_column_privilege). Writes
-- (INSERT/UPDATE/DELETE) remain table-level and RLS-gated; carpool-save-seat
-- uses service_role. Authorised pickup access remains via
-- get_carpool_seat_pickup (SECURITY DEFINER) and v_carpool_seats_safe.
-- =====================================================================
revoke select on public.carpool_seats from authenticated, anon;
grant select (id, carpool_id, passenger_id, status, created_at)
  on public.carpool_seats to authenticated, anon;

-- Re-point the (previously shipped but unwired) safe view at the SECURITY
-- DEFINER pickup RPC so it still functions after the column revoke and keeps
-- row visibility via base-table RLS (security_invoker=true).
create or replace view public.v_carpool_seats_safe
  with (security_invoker = true) as
select
  cs.id,
  cs.carpool_id,
  cs.passenger_id,
  (p.pickup ->> 'pickup_address_text')             as pickup_address_text,
  (p.pickup ->> 'pickup_lat')::numeric             as pickup_lat,
  (p.pickup ->> 'pickup_lng')::numeric             as pickup_lng,
  cs.status,
  cs.created_at
from public.carpool_seats cs
left join lateral (
  select public.get_carpool_seat_pickup(cs.id) as pickup
) p on true;

grant select on public.v_carpool_seats_safe to authenticated;

-- =====================================================================
-- F306: remove the dead manage_finances default capability (gates nothing;
-- kept in parity with the frontend catalogue removal). manage_membership is
-- retained: it IS wired (034/074 membership RLS).
-- =====================================================================
create or replace function public.coexist_role_caps(p_role text)
returns text[]
language sql
immutable
as $$
  select case
    when p_role in ('admin', 'super_admin') then array[
      'manage_users', 'manage_collectives', 'manage_content', 'send_announcements',
      'manage_email', 'manage_marketing', 'manage_events', 'manage_workflows',
      'manage_partners', 'manage_challenges', 'manage_surveys', 'manage_merch',
      'manage_charity', 'view_reports', 'manage_exports',
      'view_audit_log', 'manage_system', 'manage_membership'
    ]
    when p_role in ('manager', 'national_admin') then array[
      'manage_users', 'manage_collectives', 'manage_content', 'manage_events',
      'manage_workflows', 'manage_partners', 'manage_challenges', 'manage_surveys',
      'manage_merch', 'send_announcements', 'manage_email', 'manage_marketing',
      'manage_charity', 'view_reports', 'manage_exports', 'view_audit_log'
    ]
    else array[]::text[]
  end;
$$;
