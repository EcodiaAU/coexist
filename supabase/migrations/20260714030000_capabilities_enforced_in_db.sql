-- Capabilities become REAL: the 18-capability model is enforced by Postgres, not by React.
--
-- THE DEFECT (P1, found 2026-07-14 in the fleet-wide authorization audit)
--   Co-Exist ships an 18-capability permission model with a per-user override editor that
--   admins actually use (src/lib/capabilities.ts + src/hooks/use-admin-user-roles.ts).
--   NONE of it was enforced in the database. RLS gated on ROLE (is_admin_or_staff, is_admin_tier,
--   is_super_admin); the app gated on CAPABILITY; the two never met. role-gate.tsx even carried
--   the comment "frontend-only gating". Revoking a capability in the admin UI changed nothing.
--
--   It was worse than that. staff_roles SELECT is is_super_admin() only, so a manager cannot read
--   their OWN override row: use-auth.ts fetchStaffData got zero rows (RLS filters, it does not
--   error), permissionOverrides stayed null, and resolveCapabilities fell back to the full role
--   defaults. So the overrides were ignored by the frontend too. Live proof: user
--   ad250fa1-0e2e-4bc3-878b-767af8fd6aa2 (manager) carries six explicit revokes (manage_email,
--   manage_merch, manage_charity, manage_partners, manage_challenges, send_announcements) and
--   today holds every one of them, in both layers.
--
-- THE FIX
--   The role -> default capability mapping is ported INTO SQL, so the database is the source of
--   truth. has_cap() resolves role defaults through the per-user jsonb overrides. Write policies
--   call it. my_capabilities() lets the app ASK the database the same question instead of
--   answering it independently, so the two layers cannot drift again.
--
-- SCOPE (deliberately conservative, this is a live client app)
--   * Capability gates the WRITE paths (insert / update / delete). READS stay on the existing role
--     predicate. Reason: admin surfaces read each other's tables. reports.tsx reads merch_orders
--     under view_reports, and use-admin-create.ts reads email_campaigns under manage_workflows.
--     Capability-gating those SELECTs would have blanket-locked the revoked manager out of pages
--     they still legitimately hold. The revoke has to be surgical, and the authority that matters
--     is the authority to MUTATE.
--   * Only capabilities that a manager holds BY DEFAULT are enforced. manage_finances and
--     manage_system are NOT in ROLE_DEFAULT_CAPS.manager, so gating the finance/system tables on
--     them would newly deny both live managers something RLS grants them today. That is a lockout
--     beyond the audited blast radius, so those tables keep their role check and the gap is
--     boarded rather than guessed at.
--   * The COLLECTIVE tier (leader / co_leader / assist_leader, 61 live users) is untouched.
--     ROLE_DEFAULT_CAPS gives those roles ZERO capabilities, because collective staff work through
--     /leader, which has no capability gates at all. There is no declared capability model for
--     collective scope, so any capability gate there would lock out every collective leader.
--     Inventing one is guessing. is_collective_staff / is_collective_leader_or_above stay.
--   * staff_roles stays is_super_admin. my_capabilities() is SECURITY DEFINER, so a manager can
--     learn their own resolved capabilities without being granted read on the override table.
--
-- BLAST RADIUS (probed against live prod at write time, not from a doc)
--   staff_roles: 4 rows. One manager with the six revokes above (the intended and only restriction).
--   One admin with {manage_users: true}, a grant, additive. Two with {}.
--   profiles: 5 admin, 2 manager, 37 leader, 20 assist_leader, 4 co_leader, 1395 participant.
--   ZERO national_leader rows, so is_admin_or_staff() resolves to exactly {admin, manager} today.
--   Admins hold all 18 capabilities, so no admin loses anything. Anon is untouched throughout.

begin;

-- ---------------------------------------------------------------------------
-- Role -> default capabilities. The SQL port of ROLE_DEFAULT_CAPS in
-- src/lib/capabilities.ts. This is now the source of truth; the TypeScript is
-- the mirror, and my_capabilities() below is how the app reads it.
-- Alias normalisation matches resolveCapabilities() exactly.
-- ---------------------------------------------------------------------------
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
      'manage_finances', 'manage_charity', 'view_reports', 'manage_exports',
      'view_audit_log', 'manage_system', 'manage_membership'
    ]
    when p_role in ('manager', 'national_admin') then array[
      'manage_users', 'manage_collectives', 'manage_content', 'manage_events',
      'manage_workflows', 'manage_partners', 'manage_challenges', 'manage_surveys',
      'manage_merch', 'send_announcements', 'manage_email', 'manage_marketing',
      'manage_charity', 'view_reports', 'manage_exports', 'view_audit_log'
    ]
    -- leader / national_leader / co_leader / assist_leader / participant hold no
    -- global capabilities. Their authority is collective-scoped and lives in
    -- collective_members, gated by is_collective_staff / is_collective_leader_or_above.
    else array[]::text[]
  end;
$$;

-- ---------------------------------------------------------------------------
-- The primitive. Role defaults resolved through per-user jsonb overrides:
--   override true  -> grant, override false -> revoke, absent -> role default.
-- SECURITY DEFINER because a policy must resolve profiles + staff_roles without
-- the caller holding read on either.
-- ---------------------------------------------------------------------------
create or replace function public.has_cap(p_cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when s.permissions ? p_cap then (s.permissions ->> p_cap)::boolean
      else p_cap = any(coexist_role_caps(p.role::text))
    end
    from profiles p
    left join staff_roles s on s.user_id = p.id
    where p.id = auth.uid()
  ), false);
$$;

-- The app asks the database the same question rather than answering it itself.
-- SECURITY DEFINER so a manager can resolve their own capabilities without being
-- granted select on staff_roles (which stays super-admin only).
create or replace function public.my_capabilities()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select array(
      select c
      from unnest(coexist_role_caps(p.role::text)) c
      where coalesce((s.permissions ->> c)::boolean, true)
      union
      select k
      from jsonb_each_text(coalesce(s.permissions, '{}'::jsonb)) as o(k, v)
      where v = 'true'
    )
    from profiles p
    left join staff_roles s on s.user_id = p.id
    where p.id = auth.uid()
  ), array[]::text[]);
$$;

revoke all on function public.coexist_role_caps(text) from public;
revoke all on function public.has_cap(text) from public;
revoke all on function public.my_capabilities() from public;
grant execute on function public.coexist_role_caps(text) to authenticated;
grant execute on function public.has_cap(text) to authenticated;
grant execute on function public.my_capabilities() to authenticated;

-- ---------------------------------------------------------------------------
-- POLICY REWRITES.
--
-- Shape, applied without exception:
--   the admin ARM of a policy becomes  (is_admin_or_staff(auth.uid()) and has_cap('<cap>'))
-- Keeping the role predicate alongside the capability makes this strictly narrowing: nobody
-- gains access they lack today, and a per-user grant still cannot let a participant write
-- (which matches the app, where /admin is behind a minRole=manager route guard).
-- Collective arms are copied through untouched.
--
-- For a FOR ALL policy, USING also governs DELETE and UPDATE row visibility, and stands in as
-- WITH CHECK for INSERT. So narrowing USING on a FOR ALL policy gates every write. Where that
-- policy was ALSO the table's only staff read path, a companion SELECT policy restores the read.
-- ---------------------------------------------------------------------------

-- ---- manage_email ----------------------------------------------------------
alter policy "Admin/staff can manage campaigns" on public.email_campaigns
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_email'));
alter policy "Admin/staff can manage templates" on public.email_templates
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_email'));
alter policy "Admin/staff can manage tags" on public.email_tags
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_email'));
alter policy "Admin/staff can view recipients" on public.campaign_recipients
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_email'));

-- Those four FOR ALL policies were the only staff READ path on their tables. Reads stay on the
-- role check (see SCOPE: use-admin-create.ts reads email_campaigns under manage_workflows).
create policy email_campaigns_select_staff on public.email_campaigns
  for select to authenticated using (is_admin_or_staff(auth.uid()));
create policy email_templates_select_staff on public.email_templates
  for select to authenticated using (is_admin_or_staff(auth.uid()));
create policy email_tags_select_staff on public.email_tags
  for select to authenticated using (is_admin_or_staff(auth.uid()));
create policy campaign_recipients_select_staff on public.campaign_recipients
  for select to authenticated using (is_admin_or_staff(auth.uid()));

-- ---- manage_merch ----------------------------------------------------------
-- merch_products / merch_inventory already carry an independent `select true` policy, so
-- narrowing the FOR ALL policy gates writes only.
alter policy merch_products_manage_admin on public.merch_products
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_merch'));
alter policy merch_inventory_manage_admin on public.merch_inventory
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_merch'));
alter policy promo_codes_manage_admin on public.promo_codes
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_merch'));
alter policy merch_orders_update_admin on public.merch_orders
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_merch'));
alter policy return_requests_update_admin on public.return_requests
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_merch'));
alter policy shipping_config_admin_update on public.shipping_config
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_merch'));
alter policy shipping_config_admin_insert on public.shipping_config
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_merch'));
-- promo_codes / merch_orders / return_requests keep their existing SELECT policies untouched:
-- reports.tsx reads merch_orders under view_reports, and buyers read their own orders.

-- ---- manage_charity --------------------------------------------------------
-- donation_projects_select_active already ORs is_admin_or_staff, so staff reads survive.
alter policy donation_projects_manage_admin on public.donation_projects
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_charity'));

-- ---- manage_partners -------------------------------------------------------
-- organisations / partner_offers / event_organisations all keep independent read policies.
alter policy organisations_manage_admin on public.organisations
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_partners'));
alter policy partner_offers_manage_admin on public.partner_offers
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_partners'));
alter policy event_organisations_manage_leader on public.event_organisations
  using (
    (exists (
      select 1 from events e
      where e.id = event_organisations.event_id
        and is_collective_staff(auth.uid(), e.collective_id)
    ))
    or (is_admin_or_staff(auth.uid()) and has_cap('manage_partners'))
  );

-- ---- manage_challenges -----------------------------------------------------
alter policy challenges_manage_admin on public.challenges
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_challenges'));
alter policy challenge_participants_delete_own on public.challenge_participants
  using (user_id = auth.uid() or (is_admin_or_staff(auth.uid()) and has_cap('manage_challenges')));

-- ---- send_announcements ----------------------------------------------------
-- updates_select_authenticated is `true`, so every member still reads updates.
alter policy updates_manage_staff on public.updates
  using (is_admin_or_staff(auth.uid()) and has_cap('send_announcements'));

-- ---- manage_events ---------------------------------------------------------
-- Collective arms preserved verbatim. Only the global-admin arm is capability-gated.
alter policy events_delete_admin on public.events
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_events'));
alter policy events_insert_leader on public.events
  with check (
    is_collective_leader_or_above(auth.uid(), collective_id)
    or (is_admin_or_staff(auth.uid()) and has_cap('manage_events'))
  );
alter policy events_update_leader on public.events
  using (
    created_by = auth.uid()
    or is_collective_leader_or_above(auth.uid(), collective_id)
    or (is_admin_or_staff(auth.uid()) and has_cap('manage_events'))
  );

-- ---- manage_collectives ----------------------------------------------------
alter policy collectives_insert_admin on public.collectives
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_collectives'));
alter policy collectives_update_leader on public.collectives
  using (
    leader_id = auth.uid()
    or is_collective_leader_or_above(auth.uid(), id)
    or (is_admin_or_staff(auth.uid()) and has_cap('manage_collectives'))
  );

-- ---- manage_users ----------------------------------------------------------
-- profiles_update_own_safe still governs self-edits, so this narrows admin edits only.
alter policy profiles_update_admin on public.profiles
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_users'));
-- /admin/applications is RequireCapability cap="manage_users".
alter policy "Staff can update applications" on public.collective_applications
  using (is_admin_tier(auth.uid()) and has_cap('manage_users'));

-- ---- manage_surveys --------------------------------------------------------
alter policy surveys_insert_leader on public.surveys
  with check (
    (exists (
      select 1 from events e
      where e.id = surveys.event_id and is_collective_staff(auth.uid(), e.collective_id)
    ))
    or (is_admin_or_staff(auth.uid()) and has_cap('manage_surveys'))
  );
alter policy surveys_update_owner_or_admin on public.surveys
  using (
    created_by = auth.uid()
    or (is_admin_or_staff(auth.uid()) and has_cap('manage_surveys'))
    or (surveys.event_id is not null and exists (
      select 1 from events e
      where e.id = surveys.event_id and is_collective_leader_or_above(auth.uid(), e.collective_id)
    ))
  )
  with check (
    created_by = auth.uid()
    or (is_admin_or_staff(auth.uid()) and has_cap('manage_surveys'))
    or (surveys.event_id is not null and exists (
      select 1 from events e
      where e.id = surveys.event_id and is_collective_leader_or_above(auth.uid(), e.collective_id)
    ))
  );
alter policy surveys_delete_owner_or_admin on public.surveys
  using (
    created_by = auth.uid()
    or (is_admin_or_staff(auth.uid()) and has_cap('manage_surveys'))
    or (surveys.event_id is not null and exists (
      select 1 from events e
      where e.id = surveys.event_id and is_collective_leader_or_above(auth.uid(), e.collective_id)
    ))
  );

-- ---- manage_workflows ------------------------------------------------------
-- task_templates_select_staff already carries the staff read.
alter policy task_templates_manage_admin on public.task_templates
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_workflows'));

-- ---- manage_content --------------------------------------------------------
-- Moderation + the development curriculum. Reads (published content, own reports) untouched.
alter policy content_reports_update_admin on public.content_reports
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));

alter policy dev_modules_insert on public.dev_modules
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_modules_update on public.dev_modules
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_modules_delete on public.dev_modules
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));

alter policy dev_module_content_insert on public.dev_module_content
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_module_content_update on public.dev_module_content
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_module_content_delete on public.dev_module_content
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));

alter policy dev_sections_insert on public.dev_sections
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_sections_update on public.dev_sections
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_sections_delete on public.dev_sections
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));

alter policy dev_section_modules_insert on public.dev_section_modules
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_section_modules_update on public.dev_section_modules
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_section_modules_delete on public.dev_section_modules
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));

alter policy dev_quizzes_insert on public.dev_quizzes
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_quizzes_update on public.dev_quizzes
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_quizzes_delete on public.dev_quizzes
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));

alter policy dev_quiz_questions_insert on public.dev_quiz_questions
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_quiz_questions_update on public.dev_quiz_questions
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_quiz_questions_delete on public.dev_quiz_questions
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));

alter policy dev_quiz_options_insert on public.dev_quiz_options
  with check (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_quiz_options_update on public.dev_quiz_options
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));
alter policy dev_quiz_options_delete on public.dev_quiz_options
  using (is_admin_or_staff(auth.uid()) and has_cap('manage_content'));

-- dev_assignments: the collective arm is preserved, the admin arm is capability-gated.
alter policy dev_assignments_insert on public.dev_assignments
  with check (
    (is_admin_or_staff(auth.uid()) and has_cap('manage_content'))
    or (collective_id is not null and is_collective_leader_or_above(auth.uid(), collective_id))
  );
alter policy dev_assignments_update on public.dev_assignments
  using (
    (is_admin_or_staff(auth.uid()) and has_cap('manage_content'))
    or (collective_id is not null and is_collective_leader_or_above(auth.uid(), collective_id))
  );
alter policy dev_assignments_delete on public.dev_assignments
  using (
    (is_admin_or_staff(auth.uid()) and has_cap('manage_content'))
    or (collective_id is not null and is_collective_leader_or_above(auth.uid(), collective_id))
  );

commit;
