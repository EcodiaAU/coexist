# Co-Exist App - Full Audit Report

**Date:** 2026-04-11
**Auditor:** EcodiaOS
**Scope:** Schema, data integrity, UI consistency, role flows, error states, performance, polish
**Status:** COMPLETE - 5 phases executed

---

## Audit Summary (All Phases)

### Phase 1: Data Integrity & Schema Review (commit a90605b)
- Audited 88 active tables, 78+ migrations, 30+ source files with Supabase queries
- Found 6 Critical, 12 High, 18 Medium, 11 Low issues
- Confirmed 100% RLS coverage across all tables
- Key findings: exposed credentials in .env.development (C1), race conditions in impact logging (C2), silent query failures in stakeholder pages (C4/C5)

### Phase 2: UI Consistency Pass (commit 3af42bf)
- Touched 73 files across the entire app
- Standardized spacing, typography, and color usage
- Fixed inconsistent padding, font weights, and border radius patterns
- Aligned all components with the design system tokens

### Phase 3: Role Flow Fixes & Error States (commit 9d9a747)
- Fixed 10 files with role-related and error state issues
- Improved error handling in critical paths (impact logging, national stats, reports)
- Added proper error checks to survey response submission (C3)
- Fixed silent failures in impact hooks (C5) and reports page (H9)

### Phase 4: Performance, Forms & Final Polish (commit 68cb9ed)
- Addressed 19 files for performance and polish
- Removed unused xlsx dependency (reduced bundle)
- Fixed form validation patterns and loading states
- Polished animations and micro-interactions

### Phase 5: Final Review (this commit)
- Verified build passes clean
- Confirmed all 5 earlier UI improvements intact (footer App Store link, Collectives padding, scrollbar styling, Donate tabs, Leader layout)
- Fixed 2 remaining hardcoded colors: login page bg (#f0ede6 → theme var), admin events CTA (#869d61 → bg-brand)
- Added `--color-surface-warm` to theme for auth page backgrounds

### Still Open (require schema/infrastructure changes)
These issues from Phase 1 require database migrations or credential rotation - outside the scope of frontend code fixes:
- **C1**: Credential rotation + git history scrub (.env.development)
- **C2**: Race condition in impact logging (needs DB transaction/upsert RPC)
- **C6**: Hardcoded seed admin UUID (needs schema change: is_legacy_import flag)
- **H1**: member_count sync trigger on collectives
- **H2/H3/H8**: Missing CHECK constraints on dates and quantities
- **H4/H5/H6**: Referential integrity gaps (content_reports, chat cross-collective, poll votes)
- **H7**: Dual amount columns (decimal vs cents) need migration
- **H12**: JSONB columns without schema validation
- **M1-M18**: Medium issues (mostly schema-level constraints and triggers)

---

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 12 |
| Medium | 18 |
| Low | 11 |

**Tables analyzed:** 88 active, 6 deprecated
**Migration files reviewed:** 78+
**Source files with Supabase queries:** 30+
**RLS coverage:** 100% (all tables have RLS enabled with policies)

---

## CRITICAL

### C1. `.env.development` committed to git with real credentials
- **File:** `.env.development` (tracked in git despite `.gitignore` rule)
- **What's wrong:** Contains real Supabase anon key, database password (`pBLr9h1vZe2cEfVx`), Firebase service account JSON with private key, Resend API key, and Stripe test keys - all in plaintext, all in git history.
- **Fix:** Rotate ALL exposed credentials immediately. Remove file from git tracking with `git rm --cached .env.development`. Use `git filter-branch` or `bfg` to scrub from history. Keep only `.env.example` in version control.

### C2. Race condition in impact logging (concurrent leader writes)
- **File:** `src/pages/events/log-impact.tsx:798-818`
- **What's wrong:** Classic read-then-write without transaction. Two leaders can simultaneously check if impact exists (both get null), then both try to insert. The UNIQUE(event_id) constraint on `event_impact` will catch one, but the loser gets an unhandled constraint violation error.
- **Fix:** Use Supabase RPC with `INSERT ... ON CONFLICT` or wrap in a database transaction. Handle the unique constraint violation gracefully in the UI.

### C3. Unhandled upsert error in survey response submission
- **File:** `src/pages/events/log-impact.tsx:821-831`
- **What's wrong:** `supabase.from('survey_responses').upsert(...)` has no error check. If the upsert fails, execution continues to `syncSurveyImpact()`, which will operate on stale/missing survey data, creating state inconsistency between survey responses and impact records.
- **Fix:** Destructure and check `{ error }` from the upsert. Abort `syncSurveyImpact` if upsert failed.

### C4. Silent query failures in national impact page
- **File:** `src/pages/impact/national.tsx:42, 69, 97, 121`
- **What's wrong:** Four separate Supabase queries destructure only `{ data }` without checking `{ error }`. If any query fails (network issue, RLS denial, timeout), the page silently shows zeros/empty states instead of informing the user. This is the page shown to Landcare stakeholders.
- **Fix:** Destructure `{ data, error }` on all four queries. Show error state if any fail.

### C5. Silent query failures in impact hooks
- **File:** `src/hooks/use-impact.ts:48-50, 110-114`
- **What's wrong:** In `Promise.all` blocks, `leadersCountRes.error` and `appSettingsRes.error` are never checked. Only `membersRes` and `collectivesRes` errors are handled. Failed queries produce undefined data that flows into impact calculations, showing wrong numbers.
- **Fix:** Check all response errors in the Promise.all results.

### C6. Hardcoded seed admin UUID in production code
- **File:** `src/lib/impact-metrics.ts:126`, `src/hooks/use-admin-impact-observations.ts:82`
- **What's wrong:** `SEED_ADMIN = 'a0000000-0000-0000-0000-000000000001'` is hardcoded to detect legacy impact data. This UUID comes from seed.sql and has no guaranteed existence in production. If the seed user doesn't exist in prod, the logic silently fails. If it does exist, it's a magic constant with no documentation in the database.
- **Fix:** Add an `is_legacy_import` boolean column to `event_impact` table, or use a flag in `custom_metrics` JSONB. Remove hardcoded UUID from application code.

---

## HIGH

### H1. Denormalized `collectives.member_count` without sync trigger
- **Schema:** `collectives` table
- **What's wrong:** `member_count` is stored directly on the collectives table but there's no database trigger to keep it in sync when members are added/removed from `collective_members`. If the count drifts, every collective card in the app shows wrong numbers.
- **Fix:** Create a trigger function on `collective_members` INSERT/DELETE that updates `collectives.member_count`. Or switch to a computed count via query.

### H2. No CHECK constraint on `events.date_end >= date_start`
- **Schema:** `events` table
- **What's wrong:** An event can be created where `date_end` is before `date_start`. The app may display negative durations or confusing time ranges.
- **Fix:** `ALTER TABLE events ADD CONSTRAINT chk_event_dates CHECK (date_end IS NULL OR date_end >= date_start);`

### H3. No CHECK constraint on `challenges.end_date > start_date`
- **Schema:** `challenges` table
- **What's wrong:** Same as H2 but for challenges. Additionally, both `status` (enum) and `is_active` (boolean) columns exist - unclear which is authoritative.
- **Fix:** Add date CHECK constraint. Drop `is_active` column and use `status` exclusively. Migrate any code referencing `is_active`.

### H4. `content_reports.content_id` has no FK constraint
- **Schema:** `content_reports` table
- **What's wrong:** `content_id` is a UUID that can reference posts, comments, photos, or chat messages - but has no FK constraint. If the referenced content is deleted, the report points to nothing. Moderators reviewing reports would see broken references.
- **Fix:** This is a polymorphic FK pattern. Options: (a) add separate nullable FK columns for each content type, or (b) add a trigger that validates existence on insert, or (c) accept the limitation and handle missing content gracefully in the moderation UI.

### H5. `chat_messages.reply_to_id` can cross collective boundaries
- **Schema:** `chat_messages` table
- **What's wrong:** `reply_to_id` references `chat_messages(id)` but doesn't enforce that the replied-to message is in the same collective. A message in Collective A could reply to a message in Collective B, which would display incorrectly and potentially leak content across collectives.
- **Fix:** Add a CHECK constraint or trigger that validates `reply_to_id` references a message with the same `collective_id`.

### H6. `chat_poll_votes.option_id` has no referential integrity
- **Schema:** `chat_poll_votes` table
- **What's wrong:** `option_id` is a text field that's supposed to match an `id` in the poll's JSONB `options` array. If the poll creator edits options after votes are cast, votes point to non-existent options.
- **Fix:** Either make polls immutable after first vote (add `is_locked` flag), or normalize options into a `chat_poll_options` table with proper FKs.

### H7. Dual amount columns in donations and merch
- **Schema:** `donations` (amount + amount_cents), `merch_products` (price + base_price_cents), `merch_orders` (total + total_cents)
- **What's wrong:** Two representations of the same value exist. If one is updated without the other, they desync. The CLAUDE.md for the parent business says "All financials in AUD integer cents" - the decimal `amount`/`price`/`total` columns contradict this.
- **Fix:** Deprecate the decimal columns. Migrate all code to use `_cents` columns exclusively. Drop decimal columns after migration.

### H8. `event_tickets.quantity` has no CHECK > 0
- **Schema:** `event_tickets` table
- **What's wrong:** A ticket record with `quantity = 0` is meaningless but not prevented by the schema.
- **Fix:** `ALTER TABLE event_tickets ADD CONSTRAINT chk_ticket_quantity CHECK (quantity > 0);`

### H9. Missing error handling in reports page
- **File:** `src/pages/reports/index.tsx:214-219`
- **What's wrong:** Query to `app_settings` for `leaders_empowered_total` doesn't check for errors. Silently returns 0 if query fails. This is the reporting page that generates data for charity reporting and Landcare presentations.
- **Fix:** Add error handling. Surface errors to user.

### H10. `survey-impact.ts` uses `as any` to suppress type safety
- **File:** `src/lib/survey-impact.ts:60-66`
- **What's wrong:** Destructures fields from `existing ?? ({} as any)`, bypassing TypeScript's null safety. If `existing` is null (query returned nothing), the spread operator on `{}` produces empty fields, and the subsequent upsert may write incomplete data.
- **Fix:** Handle the null case explicitly. Don't use `as any`.

### H11. Incomplete profile creation race condition
- **File:** `src/hooks/use-auth.ts:243-272`
- **What's wrong:** Profile fetch retries once on failure, but if both attempts fail, `profileData` is null. However, `applyState()` can still fire if the retry eventually succeeds asynchronously, causing multiple `setProfile()` calls with conflicting data.
- **Fix:** Use a mutex or ensure only the final state is applied.

### H12. JSONB columns without schema validation (6 tables)
- **Schema:** `surveys.questions`, `chat_polls.options`, `staff_roles.permissions`, `merch_orders.items`, `chat_announcements.metadata`, `event_impact.custom_metrics`
- **What's wrong:** All store structured data as arbitrary JSONB with no database-level schema validation. Malformed data can be inserted and will break the UI or produce incorrect calculations.
- **Fix:** Add CHECK constraints with `jsonb_typeof()` validation, or create PostgreSQL validation functions. At minimum, validate shape in application code before insert.

---

## MEDIUM

### M1. `membership_rewards.plans[]` has no FK to `membership_plans`
- **Schema:** `membership_rewards` table
- **What's wrong:** `plans` is a text array that should reference `membership_plans` but has no FK constraint. Stale plan references possible.

### M2. `event_registrations` no atomic capacity check
- **Schema:** `event_registrations` table
- **What's wrong:** Capacity enforcement relies on a trigger with `SELECT FOR UPDATE`. Under high concurrency (popular event launch), this could allow over-registration if the trigger has a gap.

### M3. `notifications.type` is unconstrained text
- **Schema:** `notifications` table
- **What's wrong:** `type` column is `text NOT NULL` without an ENUM or CHECK constraint. Any string can be inserted. App may not know how to render unknown notification types.

### M4. `promo_codes.code` is case-sensitive UNIQUE
- **Schema:** `promo_codes` table
- **What's wrong:** Users might enter "SAVE10" and "save10" - both would be stored as different codes. Use `UNIQUE(LOWER(code))`.

### M5. Deprecated tables still in schema
- **Tables:** `badges`, `user_badges` (dropped in migration 017, recreated in 047), `product_reviews` (dropped in 050), `post_event_survey_*` tables
- **What's wrong:** Migration history shows tables being dropped and recreated. Current state unclear without running against live DB.

### M6. Missing `updated_at` triggers on many tables
- **Schema:** Multiple tables have `updated_at` column but trigger only set up on some
- **What's wrong:** `updated_at` won't auto-update on modifications, making the column unreliable for cache invalidation or "last modified" displays.

### M7. No index on `profiles.deleted_at` for soft-delete filtering
- **Schema:** `profiles` table
- **What's wrong:** Soft-delete columns exist (`deletion_status`, `deleted_at`, `deletion_requested_at`) but no index. Queries filtering active users will table-scan.

### M8. `task_templates` missing mutual exclusion CHECK
- **Schema:** `task_templates` table
- **What's wrong:** Should have exactly one of `day_of_week`, `day_of_month`, or `event_offset_days` set for the schedule type. No CHECK enforces this - a template could have conflicting schedule data.

### M9. Offline sync null handling inconsistency
- **File:** `src/lib/offline-sync.ts:256, 297, 320, 456, 557, 642, 817`
- **What's wrong:** Multiple `maybeSingle()` calls don't consistently handle the null case. Some check, some don't. Inconsistent error handling across the sync pipeline.

### M10. Dev module delete without cascade verification
- **File:** `src/hooks/use-admin-development.ts:281, 306-310, 472, 625`
- **What's wrong:** Deletes of `dev_modules`, `dev_sections`, `dev_quizzes`, `dev_module_content` rely on DB cascading. If CASCADE is missing or changed, child records orphan silently.

### M11. Referral code system migration gap
- **Schema:** `invites` table
- **What's wrong:** Migrated from code-per-invite to user-per-code system. Old `invites.code` references may not match `referral_codes.code` entries. Orphan rows possible during transition.

### M12. `campaign_recipients.email` denormalized from auth.users
- **Schema:** `campaign_recipients` table
- **What's wrong:** Email is copied at send time. If user changes email after campaign, the record is stale. Not a bug per se, but could cause confusion in analytics.

### M13. No capacity check on `event_ticket_types`
- **Schema:** `event_tickets` → `event_ticket_types`
- **What's wrong:** No database-level enforcement that total tickets sold per type <= `event_ticket_types.capacity`. Relies entirely on application logic.

### M14. `dev_modules.target_roles[]` and `target_user_ids[]` are arrays without JOIN tables
- **Schema:** `dev_modules`, `dev_sections`
- **What's wrong:** Targeting uses PostgreSQL arrays instead of junction tables. No referential integrity, no index optimization for contains queries, no cascade on user deletion.

### M15. Chat room queries missing some error checks
- **File:** `src/pages/chat/chat-room.tsx:220-223, 234, 241, 300`
- **What's wrong:** Several queries in the chat room don't fully destructure and check errors.

### M16. Leader page queries missing error checks
- **File:** `src/pages/leader/index.tsx:93, 694, 921-922`
- **What's wrong:** Multiple queries on the leader dashboard page don't check for errors.

### M17. Quiz page queries missing error checks
- **File:** `src/pages/learn/quiz.tsx:39-41`
- **What's wrong:** Quiz data fetch doesn't check for query errors.

### M18. `post_comments` has no `reply_to_id` for nested threading
- **Schema:** `post_comments` table
- **What's wrong:** Comments are flat. No way to thread replies. `is_deleted` is boolean, not timestamp - can't track when deletion occurred.

---

## LOW

### L1. `email_reminders_sent` has RLS with no user policies (intentional)
- **Schema:** `email_reminders_sent` table
- **What's wrong:** Nothing - by design. Service-role-only table for cron idempotency. Documented.

### L2. Dev-tools page has hardcoded collective UUID
- **File:** `src/pages/admin/dev-tools.tsx:78`
- **What's wrong:** Hardcoded `c0000000-0000-0000-0000-000000000001` as Byron Bay Collective fallback. Only accessible to admins, but fragile.

### L3. Seed data has fake user names
- **File:** `src/pages/admin/dev-tools.tsx:130-146`
- **What's wrong:** "Alex Rivera", "Sam Chen" etc. used in dev seed functions. Admin-only, acceptable for dev, but should not appear in production data.

### L4. E2E tests use `.skip()` with placeholder data
- **File:** `e2e/user-journey.spec.ts:9`
- **What's wrong:** `test@example.com` in skipped test. Not deployed, not a risk.

### L5. Real developer email in `.env.development`
- **File:** `.env.development:6` - `VITE_DEV_EMAILS=tate@ecodia.au`
- **What's wrong:** Minor - developer email exposed. Not a security risk but adds noise.

### L6. Console.error statements in auth hook
- **File:** `src/hooks/use-auth.ts:26, 176-183`
- **What's wrong:** Error messages logged to console. Not leaking sensitive data, but verbose in production. Consider gating behind `import.meta.env.DEV`.

### L7. `cart_reservations` cleanup relies on manual RPC
- **Schema:** `cart_reservations` table
- **What's wrong:** Expired reservations cleaned by RPC function. If cron doesn't run, reservations accumulate and stock appears unavailable.

### L8. No `updated_at` trigger verification
- **Schema:** Multiple tables
- **What's wrong:** Some tables define `updated_at DEFAULT now()` but trigger setup is inconsistent across migrations.

### L9. `challenge_participants` can have both `user_id` and `collective_id`
- **Schema:** `challenge_participants` table
- **What's wrong:** CHECK only enforces at least one is NOT NULL. Both could be set. Unclear if that's a valid state.

### L10. `collective_collaborations` table poorly documented
- **Schema:** Referenced in migrations but structure unclear
- **What's wrong:** Can't fully audit without seeing the live schema.

### L11. Account deletion page query unhandled
- **File:** `src/pages/public/account-deletion.tsx:25`
- **What's wrong:** Minor - public-facing deletion request page query doesn't check error.

---

## RLS STATUS

**Coverage: 100%** - All 88 active tables have RLS enabled with explicit policies. This is solid.

Notable patterns:
- User-scoped: `USING (user_id = auth.uid())`
- Role-based: `USING (is_admin_or_staff(auth.uid()))`
- Collective membership: `USING (is_collective_member(auth.uid(), collective_id))`
- Service-role-only: 1 table (email_reminders_sent) - intentional

No tables found without RLS. The security hardening migration (068) added additional service role restrictions.

---

## PRIORITY FIX ORDER

1. **C1** - Rotate credentials, remove `.env.development` from git (IMMEDIATE - before any stakeholder demo)
2. **C2, C3** - Fix race condition and unhandled upsert in impact logging
3. **C4, C5, C6** - Fix silent query failures in stakeholder-facing pages
4. **H1** - Add member_count sync trigger
5. **H2, H3, H8** - Add missing CHECK constraints
6. **H7** - Standardize on integer cents columns
7. **H4, H5, H6** - Fix referential integrity gaps
8. **H9-H12** - Fix error handling and type safety issues
9. **M1-M18** - Address medium issues in order of user impact

---

*Generated by EcodiaOS for Co-Exist Phase 1 Audit. Do not apply fixes until reviewed.*
