# Co-Exist session handoff: leader role-scope RLS fix + admin/updates safe-area

Date: 2026-06-09. Author: EcodiaOS (conductor). Purpose: hand off so another chat can finish.

## TL;DR

A collective leader (Fei, Hobart) was seeing log-impact tasks for every other
collective. Root cause: `profiles.role = 'leader'` was being treated as GLOBAL
staff, but it actually means "leads >=1 collective". The backend leak is FIXED
and APPLIED LIVE. The frontend changes are made + verified but NOT yet committed
(repo has CRLF drift, see below). Ship FE as a branch + PR.

---

## Root cause (verified against live DB, project ref `tjutlbzekfouwsiaplbr`)

- The legacy `national_leader` role was migrated INTO `leader`
  (`supabase/migrations/20260413070001_unified_roles_data.sql` line 5). There are
  now **0** `national_leader` profiles live.
- `profiles.role` is auto-synced to a user's HIGHEST collective role
  (`20260413090000_sync_profiles_to_highest_role.sql`). So leading ONE collective
  sets `profiles.role = 'leader'`.
- The LIVE `is_admin_or_staff()` was `role IN ('national_leader','leader','manager','admin')`
  -- it treated every collective leader as global staff. (The 076/078 migrations
  meant to exclude `leader`, but the timestamp-named 20260413 migration re-added
  it and won the lexicographic ordering race.)
- Canonical model is already documented in `src/lib/capabilities.ts` (Tate verbatim
  9 May 2026 "leaders can't see or access admin pages"): manager/admin = global,
  leader/co_leader/assist_leader = collective-scoped.

## Decisions (Tate, 2026-06-09)

1. Global/national staff = **admin + manager only**. leader/co/assist = collective-scoped.
2. Event AND task **deletion = managers/admin only** (leaders keep create+edit, not delete).
3. National staff chat (`staff_national`, name "National Leader") = **all leadership
   tiers** (assist_leader/co_leader/leader/national_leader/manager/admin), **no participants**.
   This is a SEPARATE axis from data access -- do not conflate.
4. Ship FE via **feature branch + PR** (not direct to main).

---

## BACKEND -- APPLIED LIVE + COMMITTED (verified)

File: `supabase/migrations/20260609120000_scope_leader_out_of_global_staff.sql`
(already executed against the live DB on 2026-06-09 and recorded in
`supabase_migrations.schema_migrations`; the file is idempotent so re-running via
`supabase db push` is safe).

Three changes:
1. `is_admin_or_staff(uid)` -> `role::text IN ('national_leader','manager','admin')`
   (drops `leader`). This ONE function is called by **167 RLS policies**, so the
   fix cascades to events/tasks/updates/photos/walk_ins/registrations/etc.
2. `sync_national_staff_channel()` trigger:
   - Now adds/keeps ALL leadership tiers (assist/co/leader/national_leader/manager/admin).
   - **Fixed a pre-existing bug**: the eviction guard was `IF OLD IS NOT NULL`, which
     in PL/pgSQL is false whenever ANY column is null, so demotions never evicted
     anyone (that is why demoted past-leaders lingered). Now gated on `TG_OP='UPDATE'`.
3. Reconcile `staff_national` membership: ADD missing leadership-tier profiles (+5),
   REMOVE non-leadership members (the 3 participants).

NOT touched (intentional, verified): the 16 collective-scoped policies (already
scoped by `collective_members.role` + `collective_id`); `is_collective_staff_or_above`
/ `get_user_profile_v1` / `src/lib/profile-visibility.ts` (the member-PII tier --
deliberately lets any leadership-tier viewer see member PII per the 29 Apr 2026
directive); event/task DELETE policies (stay `is_admin_or_staff`-only = manager/admin).

### Verification (per-persona, impersonated via SET ROLE authenticated + JWT claims, before -> after)

| persona | is_admin_or_staff | collective_members | profiles | tasks | walk_ins | content_reports |
|---|---|---|---|---|---|---|
| admin | true->true | 715->715 | 745->745 | 1->1 | 14->14 | 2->2 |
| manager | true->true | 715->715 | 745->745 | 1->1 | 14->14 | 2->2 |
| Fei (Hobart leader) | true->**false** | 715->**10** | 745->**8** | 1->0 | 14->0 | 2->0 |
| other leader | true->false | 715->108 | 745->105 | 1->0 | 14->0 | 2->0 |
| participant | false->false | 41->41 | 40->40 | 0->0 | 0->0 | 0->0 |

Positive proof scoped branches still work: Melbourne City leader sees 6/14 walk_ins
(their own), Adelaide staffer sees 1/1 task (theirs), other leader keeps 108 roster +
1 event photo. Fei keeps her 10-person Hobart roster. admin/manager/participant: zero
change. staff_national: 64 -> 66 (34 leader + 20 assist + 5 co + 5 admin + 2 manager,
0 participants). Trigger demote->participant now evicts; re-promote re-adds.

Note: events stayed 378->378 for everyone because ALL 378 events are `is_public=true`,
so event SELECT was never the leak. **Fei's symptom is fixed by the FE hook, not RLS**
(see frontend below) -- the impact-task list queries the public events table.

---

## FRONTEND -- MADE + tsc-clean + em-dash-clean, NOT committed yet

All changes align divergent spots with the canonical model (global staff = manager/admin).
0 new TypeScript errors (verified by stash/diff: 6 baseline pre-existing stale-`database.types`
errors, 6 with changes -- all unrelated to these files).

1. `src/hooks/use-impact-form-tasks.ts` (~line 80): `isGlobalStaff = isAdmin || isNationalLeader`
   where `isNationalLeader = profile?.role === 'national_leader'` (was `=== 'leader'`).
   Managers still handled separately via `managed_collectives`. **This is the fix for Fei's
   actual symptom** -- the hook no longer skips the collective filter for leaders.
2. `src/pages/events/event-day.tsx:344`: `isStaff` drops `'leader'` ->
   `national_leader || manager || admin`. Collective's own leaders still reach their event
   via `isAssistLeader` (useCollectiveRole, collective-scoped).
3. `src/pages/events/log-impact.tsx:620`: same as event-day.
4. `src/hooks/use-updates.ts` (2 spots: `filterByAudience` ~line 38, and the unread-count
   query ~line 178): `isStaffOrAdmin` drops `'leader'` -> `['national_leader','manager','admin']`.
5. `src/pages/admin/updates.tsx` (the ORIGINAL request, unrelated to RLS): the mobile detail
   overlay now respects safe areas -- added `paddingTop: var(--safe-top)` and
   `paddingBottom: calc(56px + var(--safe-bottom) + 0.75rem)` to the `lg:hidden fixed inset-0`
   overlay so the back button clears the notch and the edit/delete footer clears the bottom
   tab bar; replaced the ad-hoc text "Back" with the global circular icon back button.

### Remaining FE steps (TO DO)
- Create branch (e.g. `fix/leader-scope-rls`), normalize ONLY these 5 files to LF
  (they sit in a repo with CRLF drift -- see below), commit, push, open PR.
- Verify on the Vercel PREVIEW deploy: as a single-collective leader, the log-impact
  task list shows only that collective's events; admin/manager still see all.

---

## REPO STATE WARNING (coexist)

`git status` shows ~270 files modified, but this is **CRLF line-ending drift** from the
Corazon(Windows)->Mac host migration, NOT real changes. HEAD files are LF; working-tree
files are CRLF. No `.gitattributes`, no `core.autocrlf` set. There are NO unpushed commits
(`origin/main..HEAD` is empty). My edits to `event-day.tsx`/`log-impact.tsx` are clean
(already LF); `use-impact-form-tasks.ts`, `use-updates.ts`, `admin/updates.tsx` carry
full-file CRLF noise and must be LF-normalized before commit (e.g. `perl -i -pe 's/\r$//' <file>`)
so the PR diff is just the real edits.

Separately worth fixing org-wide: add a `.gitattributes` with `* text=auto eol=lf` and
renormalize, but that is a big separate cleanup -- do NOT bundle it with this PR.

---

## OPEN PEOPLE/DATA ITEMS (not code)

1. **keelydeklerk duplicate account.** Two separate `auth.users`, both `email` provider
   (NOT a sign-in quirk -- two different addresses):
   - REAL: `keelydeklerk@coexistaus.org` (id `5f797b96-...`), created 30 Mar, role=leader,
     IS the Northern Rivers leader, has content (1 event, 1 message, 2 registrations),
     correctly in the national chat.
   - DUPLICATE: `keelydeklerk@coexistaus.org.au` (id `e34aa0e2-...`), created 3 Jun,
     role=participant, ZERO collective memberships, ZERO content. Already removed from
     the national chat by the migration. Safe to delete (nothing attached). Tate to confirm.
2. **Stutigovil** (`stutigovil@coexistaus.org`, id `0c9fdfbb-...`): a demoted past leader,
   role already participant, no memberships, never logged in. Was stale in the national chat
   (the OLD trigger bug never evicted her); the migration removed her. No further action unless
   you want to delete/disable the account.
3. **apple** (`apple@ecodia.au`): the test/review account, role=participant, "leads" a
   collective literally named "Test". Removed from national chat by the migration. Leave it.

---

## DB access used (for the finishing chat)

Live Co-Exist DB via the session pooler: host `aws-1-ap-southeast-2.pooler.supabase.com`
port 5432, user `postgres.tjutlbzekfouwsiaplbr`, db `postgres`, SSL no-verify. DB password
is in `coexist/.env*` as `SUPABASE_DB_PASSWORD`. Use `SET ROLE authenticated` +
`SET LOCAL "request.jwt.claims" = '{"sub":"<uid>"}'` to test RLS as a specific user.

Key collective ids: Hobart `f07f0758-...`, Northern Rivers `9a2f9919-...`.
