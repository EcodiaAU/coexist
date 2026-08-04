# Co-Exist Ticketing Parity + Comprehensive Export + Trunk Consolidation

Execution-ready action plan. Repo `/Users/ecodia/.code/coexist`. Bundle `org.coexistaus.app`, ASC app id `6760897574`, Vercel project `coexist` (team ecodia), web `app.coexistaus.org`. Canonical trunk `origin/main` = `0b7464a` (native 2.0.9 / iOS build 69 / Android vc56). Authored 2026-07-09. Trunk-based: everything lands on and ships from `main`, no feature branches survive this plan.

---

## 1. Executive summary

The export/dietary/medical work the brief believed was stranded is already merged and live. `origin/main` (`0b7464a`, native 2.0.9) is a strict superset of `main-ship` and all four `feat/*` branches. Web (app.coexistaus.org, ships from `main` via Vercel git-integration), iOS App Store (2.0.9, build 69), and Android Play (2.0.9, vc56) all carry the registered-tab phone export. The "main = 2.0.2, missing the work" premise in the brief describes only the stale LOCAL `main` (`e2b6e6a`) that was never fetched.

So the trunk problem is a local-checkout + branch-zoo hygiene problem, not a lost-work problem. Consolidation moves ZERO feature content onto trunk. It is: fast-forward local `main` to `origin/main`, retire the four contained feature branches plus the local-only `main-ship`, and reconcile the ONLY genuinely-stranded work (the two Sentry branches, which forked pre-2.0.7 and lack the release/QA/RLS/medical work) onto trunk.

What we are BUILDING on top of the reconciled trunk: (1) per-event custom questions at ticket purchase (Eventbrite parity, 4WD is one instance), definitions in a new `event_ticket_questions` table, answers in `event_tickets.custom_answers jsonb` written at the single canonical reserve point; (2) one comprehensive export replacing the checked-in-only builder, sourced from `event_tickets` across all states with phone/dietary/medical/emergency/custom-answer columns, delivered through a `SECURITY DEFINER` export RPC. Nine ordered, independently-committable units, each landing on `main`, shipped web + iOS + Android through the full eight-rung pipeline. Zero ticketing test coverage exists today, so the build authors its own.

---

## 2. Ground-truth findings

### 2.1 Live production state (verified two ways each)
- iOS App Store live = **2.0.9 READY_FOR_SALE**, build **69** (ASC `appStoreVersions?include=build`, key R8P6K38X47). Build 69 cut from release commit `7b7ce46`; `git merge-base --is-ancestor d3996eb 7b7ce46` = YES. Live iOS contains the export.
- Android Play live = **2.0.9** (public probe `{"http":200,"live_version":"2.0.9","updated_on":"6 July 2026"}`), `release/2.0.9` = versionCode 56, mapped to `7b7ce46` which contains `d3996eb`. Live Android contains the export.
- Web live = **app.coexistaus.org** deployment `dpl_25LeqzN2BcDbwrcmy9KHgywfJ5SL`, target production, branch `main`, sha `0b7464a` (origin/main tip). Live bundle grep of `event-detail-V-v86QDf.js` contains "Copy phone list" and "registered (pre-event)". Confirmed at binary/bundle level.

### 2.2 The Angelica "is it actually live" answer
The "registered-tab / phone export is now live" told to Angelica on 8 Jul is **TRUE on all three surfaces** a Co-Exist organiser uses: web (origin/main `0b7464a`), iOS App Store 2.0.9 build 69, Android Play 2.0.9 vc56. The server-side half (the RLS grant `profiles_select_event_registrant_leader` + helper `is_event_registrant_of_led_collective`) is also live in coexist prod, so a leader actually reads their event's registrant profiles.

Forward risk (NOT a current-live problem): the newest iOS **TestFlight** build 78 (2.0.18, `native/sentry-capacitor-2026-07-07`) forked before the export merged and regressed it back out. The next iOS store ship must NOT go from that lineage without reconciling onto trunk first.

### 2.3 Git trunk reconciliation
| Ref | Tip | Native version | On remote? |
|---|---|---|---|
| **origin/main** (canonical) | `0b7464a` | 2.0.9 / build 69 / vc56 | yes |
| local `main` (stale) | `e2b6e6a` | 2.0.5 / build 64 / vc52 (pkg 2.0.2) | 0 ahead / 23 behind origin/main |
| local `main-ship` | `8a4cfb6` | 2.0.8 / build 68 / vc55 | **local-only, not on remote**; 6 behind origin/main |
| `native/sentry-capacitor-2026-07-07` | `ef921be` | 2.0.18 / build 78 | yes; 23 unique, forked pre-2.0.7 |
| `edge/sentry-deno-2026-07-07` | `ea62021` | (n/a) | yes; 2 unique |

`package.json` "version" is vestigial (stuck 2.0.6 on origin/main; real version lives in `ios/App/App.xcodeproj/project.pbxproj` MARKETING_VERSION/CURRENT_PROJECT_VERSION and `android/app/build.gradle` versionName/versionCode). There are **no git tags** in the repo. CI (`.github/workflows/ci.yml`) is a lint/tsc/vite-build gate on `push:[main]` / `pull_request:[main,develop]`, no deploy step, keys exclusively on `main`. Store builds and web both ship from `main`; `main-ship` never shipped anything.

Migration state: the three feature migrations (`20260706000000_events_drift_checkin_external_columns.sql`, `20260708000000_leader_read_event_registrant_profiles.sql`, `20260708100000_add_medical_requirements_to_profiles.sql`) exist exactly once on trunk, are already applied to prod, and are idempotent (`ADD COLUMN IF NOT EXISTS` / additive OR-policy). Neither Sentry branch touches any file under `supabase/migrations/`. Pre-existing hygiene note (not caused here): trunk carries duplicate migration timestamp prefixes (`20260518090000/100000/110000`, `20260623000000`); Supabase orders by full filename so not breaking, flag for a later pass, do not touch during consolidation.

---

## 3. Per-branch disposition

| Branch | Tip | Disposition | Why | Order |
|---|---|---|---|---|
| `feat/campout-dietary-medical-purchase` | `0b7464a` | **DISCARD** | IS origin/main HEAD; richest tip, already trunk | after ff |
| `feat/pre-event-attendee-export-web` | `4ae15da` | **DISCARD** | Contained; = origin/main minus 1 commit; carries the RLS fix, already on trunk + prod | after ff |
| `feat/pre-event-roster-export` | `d3996eb` | **DISCARD** | The "told Angelica it's live" export commit; strict ancestor of main-ship, subsumed | after ff |
| `feat/dietary-ticket-gate` | `1ab8d9d` | **DISCARD** | Older/weaker dietary gate, superseded by campout purchase-time gate | after ff |
| `main-ship` (local-only) | `8a4cfb6` | **DISCARD** | 6 behind origin/main, redundant + misleading; never merge onto main (would rewind trunk 6 commits) | after ff |
| `edge/sentry-deno-2026-07-07` | `ea62021` | **RECONCILE onto main** | 2 unique commits, `_shared/sentry.ts` + wraps 33 edge fns; zero migrations; genuinely unmerged | STEP 4a (first) |
| `native/sentry-capacitor-2026-07-07` | `ef921be` | **RECONCILE onto main** | 23 unique commits, `@sentry/capacitor` + scroll UX; zero migrations; forked pre-2.0.7, lacks 2.0.7-2.0.9 work | STEP 4b (second) |
| `sentry/edge-functions-f1a9ecd0` | (older) | **DISCARD after 4a** | superseded by edge/sentry-deno; retire once contained | after 4 |
| ~40 other stranded branches | various | **SEPARATE gated sweep (STEP 8)** | most squash-merged/abandoned; not in this scope | follow-up worker |

The four `feat/*` need ZERO ordering because there are ZERO merges (they are the same commit objects already in trunk's linear history). Retire by containment check, never by name.

### Consolidation execution (do these first, before any build unit)

STEP 0  - dirty tree. Currently on `native/sentry-capacitor-2026-07-07` with `M supabase/functions/excel-sync/index.ts` (tracked live edge fn, unknown provenance) plus scratch (`.maestro/flows/71-*.yaml`, `_imgtest.cjs`, `_worktrees/`, swiftpm dir). Do NOT discard blindly (per `probe-provenance-of-inherited-working-tree-changes-before-prod-ship`):
```
git -C /Users/ecodia/.code/coexist stash push -u -m "pre-consolidation-2026-07-09 (excel-sync + maestro + scratch)"
git -C /Users/ecodia/.code/coexist stash show -p stash@{0}   # inspect excel-sync: commit-onto-branch+deploy, or drop if scratch
```

STEP 1  - adopt trunk, ff local main (SAFE, non-destructive):
```
git -C /Users/ecodia/.code/coexist fetch origin
git -C /Users/ecodia/.code/coexist checkout main
git -C /Users/ecodia/.code/coexist merge --ff-only origin/main
```
`--ff-only` is the rail; if it refuses, STOP and surface (means local main gained a commit).

STEP 3  - retire contained branches (gated; `-d` refuses unmerged, `-D` banned here):
```
for b in feat/campout-dietary-medical-purchase feat/pre-event-attendee-export-web \
         feat/pre-event-roster-export feat/dietary-ticket-gate main-ship; do
  if git -C /Users/ecodia/.code/coexist merge-base --is-ancestor "$b" origin/main; then
     git -C /Users/ecodia/.code/coexist branch -d "$b"
     git -C /Users/ecodia/.code/coexist push origin --delete "$b" 2>/dev/null || echo "  ($b local-only)"
  else echo "SKIP $b  - not contained"; fi
done
```
Deleting the four remote `feat/*` refs is a shared-ref mutation: batch one Tate go-ahead (local `-d` needs none, reflog-recoverable).

STEP 4  - reconcile Sentry (the only real conflicts). Edge first, native second:
```
git checkout -b integ/sentry-consolidation origin/main
git merge --no-ff edge/sentry-deno-2026-07-07     # near-zero conflict (additive wrappers)
git merge --no-ff native/sentry-capacitor-2026-07-07
```
Conflict hotspots on 4b: (1) version files GUARANTEED  - `ios/App/App.xcodeproj/project.pbxproj` (2.0.9/69 vs 2.0.18/78) + `android/app/build.gradle` (vc56 vs vcNN); resolve by bumping to a NEW release ABOVE both (2.0.19 / iOS 79 / vc57) so the next ship is unambiguously ahead of stray TestFlight 78, and fix `package.json` in the same edit. (2) `src/pages/events/event-detail.tsx`  - trunk's campout-modal wiring (`beginTicketCheckout` ~:1002/:1095, modal :2043) + event_extras pills vs the branch's stretchy hero; keep BOTH by hunk, then CDP/sim visual-verify. (3) `src/components/app-shell.tsx`  - dietary-gate backstop vs scroll behaviour; keep both. Land via `git checkout main && git merge --ff-only integ/sentry-consolidation`, then retire the two Sentry branches + `sentry/edge-functions-f1a9ecd0` by containment. Dispatch STEP 4 as its own worktree-isolated worker (needs iOS-sim + CDP visual-verify).

---

## 4. Feature build spec (ordered, independently-committable units, each landing on main)

Two load-bearing design decisions, justified by write-point topology:
- **Definitions** live in a NEW event-scoped table `event_ticket_questions` (not on `event_ticket_types`): Eventbrite asks once per order regardless of tier, and a dedicated table gives ordered rows, per-question RLS, a stable `question_id` that survives label edits (answers never orphan, export columns stay stable), and clean CRUD.
- **Answers** live in `event_tickets.custom_answers jsonb` keyed by `question_id` (NOT a child table): there is exactly ONE shared write point for both paid flows (`reserve_event_ticket`, single INSERT `20260331130000_event_ticketing.sql:118-127`) plus two free-path direct inserts (`claim-event-ticket:100-110`, `grant-event-ticket:157-166`). A jsonb column is written once per path; a child table would need a second per-answer INSERT in each of four paths for zero query benefit. `stripe-webhook:241-343` never touches answers (written at reserve, before payment). Validate `question_id` against `event_ticket_questions` in the RPC; resolve export columns from the questions table as source of truth. Shape `{ "<question_id>": string | string[] | boolean | number }`.

| # | Commit | Depends on | Ships via |
|---|---|---|---|
| **1A** | migration `20260710000000_event_ticket_questions.sql`: create table (id, event_id FK ON DELETE CASCADE, label, qtype CHECK in text/boolean/single_select/multi_select, options text[], required, sort_order, is_active, created_at) + `ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS custom_answers jsonb`; RLS enable, `GRANT SELECT ... TO authenticated`, staff-manage policy mirroring `20260708000000_leader_read_event_registrant_profiles.sql`; explicit grants per `supabase-create-table-must-include-explicit-grants` | consolidation | DB via Supabase Management API |
| **1B** | migration `20260710000100_reserve_ticket_custom_answers.sql`: `CREATE OR REPLACE FUNCTION reserve_event_ticket(...)` add `p_answers jsonb DEFAULT NULL` (last positional; named callers stay valid), pre-INSERT validation loop over active+required questions (RAISE on missing/empty), add `custom_answers` to column list (~:119) + `p_answers` to VALUES (~:123). Single server-side gate for both paid paths; webhook untouched | 1A | DB |
| **1C** | edge fns pass answers: `create-checkout/index.ts` `:468-473` add `p_answers: body.answers`; `create-checkout-test/index.ts` identical (parallel Stripe-test copy, per `stripe-e2e-verification-via-parallel-test-functions`); `guest-ticket-checkout/index.ts` `:163-168`; `claim-event-ticket/index.ts` `:100-110` add `custom_answers: body.answers ?? null` (+ pending->confirmed update branch :79); `grant-event-ticket/index.ts` `:157-166` same. Defensive non-object shape reject edge-side; authoritative required-check stays in RPC | 1B | `supabase functions deploy` each |
| **1D** | types + hooks: `src/types/database.types.ts` add `event_ticket_questions` Row/Insert/Update + `custom_answers: Json | null` on `event_tickets` (mirror how `medical_requirements` was threaded); new `src/hooks/use-event-ticket-questions.ts` with `useEventTicketQuestions(eventId)` (SELECT active ORDER BY sort_order) + `useSaveTicketQuestions()` modeled on `useSaveTicketTypes` (`use-event-tickets.ts:471+`) | 1A | web/native bundle |
| **1E** | create-event editor: `src/pages/events/create-event.tsx` add `ticket_questions` to `CreateExtraFields` (:113-127) + `INITIAL_EXTRA` (:131-145); in `StepTicketing` (:1094-1244) add an "Attendee questions" StepCard (add/remove/reorder, label, qtype selector, options editor for select types, Required toggle, reusing addTier/updateTier/removeTier :1102-1125); persist on CREATE after ticket-type insert (:1962-1985), on EDIT via `useSaveTicketQuestions`; show in StepReview (:1398-1506) | 1D | web + iOS + Android |
| **1F** | buy-surface collection + validation: NEW `src/components/ticket-questions-modal.tsx` on the `campout-requirements-modal.tsx` pattern (portal, blocking, per-type control, required non-empty gate, dismissable); rewire `event-detail.tsx` `beginTicketCheckout` (:513-522) ordering campout-modal -> questions-modal (if `useEventTicketQuestions` non-empty) -> `doTicketCheckout(ticketTypeId, answers)`, thread answers into `ticketCheckout.mutateAsync` (`use-event-tickets.ts:167-190`) + create-checkout body; guest path `public/event.tsx` buy card (:314-387) render active questions inline (fetch alongside existing public event fetch), collect into `buyAnswers`, block required-empty in `handleBuy` (:88-118), add `answers` to POST body (:100-110) | 1C, 1D | web + iOS + Android |
| **2G** | migration `20260710000200_event_attendee_export_rpc.sql`: `SECURITY DEFINER STABLE get_event_attendee_export(p_event_id uuid) RETURNS jsonb`; authorize via `is_collective_staff(auth.uid(), collective_id)` OR admin (reuses the roster/leader helper, avoids multi-table RLS embed); attendee universe = UNION of user_id from `event_registrations` (all statuses) + `event_tickets` (all statuses) LEFT JOIN profiles + latest ticket per user; returns first/last/display name, email, phone, postcode, dietary, medical, emergency contact name/phone/relationship (all on profiles per `042_extended_profile_fields.sql` + `20260708100000`), plus ticket_status, registration_status, checked_in_at, registered_at, custom_answers | 1A | DB |
| **2H** | rewrite export builder `src/hooks/use-event-attendees-export.ts`: `useEventAttendeesExport` calls `supabase.rpc('get_event_attendee_export', {p_event_id})` (replaces the `event_registrations` embed :70-82); widen `AttendeeExportRow` with emergency/ticket_status/registration_status/custom_answers; replace scope enum with a status FILTER (all/going/waitlisted/cancelled, default all) over the single fetched set with one clear Status label per row; `buildAttendeesCsv` header becomes `['Name','Status','Email','Phone','Postcode','Dietary','Medical','Emergency contact','Emergency phone']` PLUS one dynamic column per active question (label header, value from custom_answers[question_id], arrays joined `; `); keep `buildPhoneList` (:189) + `buildAttendeesPlainText` (:163), folding the pre-event/phone export into this one export | 2G, 1D | bundle |
| **2I** | export UI `src/pages/events/admin-attendees-export.tsx`: replace Registered/Checked-in scope tabs (:20-23/:130-150) with All/Going/Waitlisted/Cancelled filter (default All); feed `useEventTicketQuestions(eventId)` into `buildAttendeesCsv` for dynamic columns; retain Download .csv / Copy text / Copy phone list (:60-95); update subtitle (:107) to "Name, status, contact, dietary, medical, emergency contact + your custom questions - every ticket state" | 2H | web + iOS + Android |

Backend (1A-1C, 2G) is additive and lands first with no UI risk. Post-1F/2I: bump `package.json` to match native, cut a release commit bumping pbxproj + build.gradle.

Open gaps to flag (not blockers): the campout dietary/medical gate and the authed questions modal cover the AUTHED path; the GUEST path (`guest-ticket-checkout`) has no profile, so guest campout buyers get no profile dietary/medical, but custom questions DO cover guests (answers on the ticket). Consider migrating campout dietary/medical to custom questions to close the guest gap uniformly. Free claim/grant accept answers (1C) but the claim-page UI to collect them is a follow-up; grant stays leader-optional.

---

## 5. Test / scenario matrix

Run surfaces: `npm test` (vitest unit, `src/test/`, jsdom) · `npm run test:e2e` (playwright, app served, `e2e/helpers.ts`) · `.maestro/flows/*.yaml` via `maestro test` (65 flows) · edge fns have NO deno harness (exercised only via live `-test` twins against Stripe test-mode) · DB/RPC/RLS via `mcp__ecodia-supabase__db_query`/`db_execute` with role-scoped JWTs. Zero ticketing coverage exists today (grep of `src/test/` + `e2e/` for reserve/checkout/export = none).

### Layer 0  - consolidation pre-flight (automatable)
- C0 feature base = `origin/main 0b7464a`, export builder present is the Phone/`buildPhoneList` version (`grep -c "buildPhoneList\|AttendeeExportScope"` > 0). C1 each `feat/*` contained (`--is-ancestor` = yes) before delete. C2 the 3 prod migrations idempotent on a fresh env (apply twice, second = 0 changes). C3 new question migration additive (existing tickets get NULL, not error). C4 `package.json` bumped to match native.

### Layer A  - unit / vitest (automatable)
Question-def validation (U1-U5: 4 types accepted, select-without-options rejected, dup id rejected, sort_order stable, options-on-non-select tolerated). Answer validation (U6-U15: required blank blocked per type incl. multi_select/checkbox-waiver/number/date, optional blank allowed, select-not-in-options rejected, unknown question id stripped, zero-questions baseline). Export builder (U16-U26: dynamic column per question in sort_order, multi_select joined + CSV-escaped, comma/quote/newline escaped, NULL answers blank cells, every state labelled, sourced from event_tickets all-states, multi-quantity row rule, duplicate-label disambiguation, phone dedup, name resolution, empty set header-only). Gate interaction (U27-U29: campout + questions compose, non-campout only questions, campout-zero-questions only dietary modal).

### Layer B  - integration / real DB (automatable via db_query/db_execute)
I1 reserve persists custom_answers at pending. I2 omitted p_answers backward compatible. I3/I4 capacity/sale-window RAISE, no orphan answers. I5 answers UNCHANGED after webhook confirm (invariant). I6 cancel/refund retains answers. I7 questions added after sale -> old tickets NULL. I8 multi-quantity one answer-set per ticket. I9 concurrent-reserve-at-capacity FOR UPDATE, no oversell. I10 export RPC returns all states + all fields. I11 `get_user_profile_v1` medical under sensitive tier.

### Layer C  - edge functions (needs live Stripe test-mode via `-test` twins, except free paths)
EF1-EF3 paid authed create-checkout (answers pass, required-missing 4xx no row, select-tampered rejected) [Stripe test]. EF4-EF5 paid guest (answers on ticket, no profile write; required-missing 400) [Stripe test]. EF6-EF9 free claim/grant (service-role drivable, NO Stripe: $0 confirmed ticket with answers, existing-ticket update no dup). EF10-EF11 stripe-webhook finalize + idempotency, answers untouched, one registration/points [Stripe test twin]. EF12-EF13 refund/cancel state transitions [test twin / free]. EF14 CORS preflight for Capacitor webview (per `supabase-edge-function-needs-cors-for-capacitor-webview`). EF15 answers payload drift sanitized (untrusted-ingress as data).

### Layer D  - RLS / role-scoped deny+allow (automatable via role JWTs)
R1 leader reads OWN event registrants ALLOW. R2 leader reads OTHER event DENY. R3 registrant with no `collective_members` row (the Hannah Lyttle 13/24 root cause) now readable via event-registrant path. R4 plain member DENY. R5 anon reads custom_answers DENY. R6 owner reads own answers ALLOW. R7/R8 leader reads own event's ticket answers ALLOW / other DENY. R9 medical non-owner-non-leader DENY. R10 additivity: existing self-read unregressed. R11 SECURITY DEFINER helper no recursion into profiles.

### Layer E  - E2E / device (mix)
E1-E4 web/playwright (organiser adds questions + reappear on edit, each type's control renders, buyer required enforced, comprehensive CSV all columns/states) [automatable web]. E5-E8 Maestro iOS/Android + guest (authed purchase with questions on-device custom_answers probe, campout combined gate keyboard-aware, old-Android WebView compat, guest capture) [NEEDS LIVE DEVICE/SIM; use `coord.tap` not tapOn-by-text for Capacitor inputs]. E9 leader roster row-count vs registrant-count (RLS live) [web/CDP]. E10 zero-questions regression [device/sim].

### Layer F  - visual / CDP whole-frame (needs deployed URL, eyes-on)
V1 question builder controls, V2 each type's buyer input (label/help/required-asterisk/error, light+dark), V3 combined campout+questions modal keyboard-aware (Capacitor keyboard events not visualViewport), V4 export UI, V5 long multi-select no layout break at mobile width.

### Regression fence (automatable)
REG1 checkout without questions unchanged contract. REG2 confirmation email fires. REG3 points awarded. REG4 one registration onConflict(event_id,user_id). REG5 capacity/sold-out unchanged. REG6 checked-in survey export scope preserved. REG7 existing 28 unit + 6 e2e + 65 maestro green. REG8 existing reserve callers unbroken (default p_answers). REG9 free claim/grant without answers still $0 confirmed. REG10/REG11 migrations replay-safe + old tickets exportable. REG12 ticket_code uniqueness.

**Needs live Stripe test-mode:** EF1-EF5, EF10-EF12, EF15, E8 (the webhook->confirm->points->email->answers-survival chain is only proven end-to-end here). **Needs live device/sim:** E5-E8, E10, V3 (Capacitor webview input/keyboard, old-Android WebView, on-device custom_answers persistence). **Free paths need neither:** EF6-EF9, EF13 (service-role drivable, cheapest full-persistence proof).

Design decisions the build must PIN before authoring expected values: (a) multi-quantity = one answer-set per ticket vs per-seat (U22/I8); (b) whether paid-then-waitlisted is a real `event_tickets` state or only `event_registrations.status` (U20/U21); (c) whether guest dietary/medical becomes custom questions (EF4 gap).

---

## 6. Ship plan (web + iOS + Android, eight dev-process rungs)

Order: land consolidation (STEP 1 + 3), then STEP 4 (Sentry integration as its own worktree worker), then feature units 1A-2I on `main`, then one release ship.

1. **Research**  - done (this plan). Ground truth confirmed against origin/main 0b7464a.
2. **Plan**  - this document; units 1A-2I dependency-ordered.
3. **Write**  - author each unit on `main` (short-lived working branch allowed, ship gate is landed on main). No feature branches survive.
4. **Unit test**  - vitest Layer A + Layer 0 pre-flight green (`npm test`).
5. **Integration test**  - Layer B (db_query/db_execute) + Layer C free paths (EF6-EF9) + Layer D RLS role-scoped; Layer C Stripe paths via live `-test` twins.
6. **Visual-verify via CDP**  - Layer F against the deployed preview URL, whole-frame eyes-on, self-iterated (per `visual-verify-is-the-merge-gate`); + Maestro Layer E on iOS sim + old-Android WebView emulator.
7. **Push**  - GitHub-recognised author; migrations 1A/1B/2G applied to prod via Supabase Management API (NOT auto-run by build, per `migrations-must-run-on-deploy-not-just-ship`); edge fns 1C `supabase functions deploy` (all four + create-checkout-test twin).
8. **Verify deploy**  -
   - **Web:** Vercel git-integration on `main` -> deployment target production, alias app.coexistaus.org READY; discriminating probe: live-bundle grep for the new dynamic-column export + questions modal string.
   - **iOS:** Mac-local headless ASC API path (per `mac-local-headless-ios-ship-via-asc-api-2026-06-08`; NOT from the TestFlight-78/sentry lineage unless trunk-merged). New release 2.0.19 / build 79 above stray 78; verify ASC build attached + version READY_FOR_SALE, TestFlight VALID.
   - **Android:** Play console (code@ business account only, per `play-console-code-at-account-only`), versionName 2.0.19 / vc57; verify public Play version probe matches.
   - Post-ship: on-device `custom_answers` persistence probe (E5/E8) and a real leader export row-count check (E9).

Consolidation STEP 1 + 3 change NO shipping code, so they require no store re-ship. Only STEP 4 (Sentry) and the feature units produce a new store-shippable build.

---

## 7. Open decisions for Tate + forward enforcement

### Decisions needing Tate
1. **Remote-ref deletions (STEP 3).** Deleting the four remote `feat/*` refs is a shared-ref mutation. Safe by containment proof; recommend one batched go-ahead to delete `feat/campout-dietary-medical-purchase`, `feat/pre-event-attendee-export-web`, `feat/pre-event-roster-export`, `feat/dietary-ticket-gate` remote refs. Local `-d` + `main-ship` (local-only) need no gate.
2. **`excel-sync/index.ts` working-tree diff (STEP 0).** Tracked live edge-fn modification of unknown provenance. If the stash inspection shows real work, it must be committed onto `main` + edge-deployed separately, not folded into consolidation. Surface the diff before deciding.
3. **STEP 8 branch-zoo sweep.** ~40 other stranded branches. Any branch with genuinely-unmerged commits (`git cherry origin/main $b` `+` lines) is Tate-gated before deletion. Recommend a follow-up audit worker, not folded into this ship.
4. **Guest campout dietary/medical gap.** Product call: migrate campout dietary/medical to custom questions so guest buyers are captured uniformly, or accept the authed-only gate. Not a blocker for the parity build.

### Forward trunk enforcement (codify-at-the-moment triad)
1. **Dispatch-brief rule** (add to worker-brief template + git-hygiene doctrine): every code worker commits to and ships from `main`; a short-lived working branch is allowed but its ship gate is "landed on `main`" within the same arc; the completion signal must include `git merge-base --is-ancestor <workbranch> origin/main` = true or an explicit "stranded, needs reconciliation" flag. No long-lived parallel `main-ship`/release lines.
2. **Git-hygiene canary** (`scheduler.cron`, pattern-file `trunk-based-git-hygiene-canary-2026-07-09`): daily report-only sweep over each active Ecodia repo, alarm on any `feat/*`/`fix/*` with genuinely-unmerged (`git cherry` `+`) commits older than N days, or any local-only branch ahead of `origin/main` that is not a same-day working branch; write a `status_board` row (`entity_type=repo_hygiene`) and SMS only on threshold crossing (per `health-canary-must-alert-not-silently-accumulate`). This is exactly what would have caught the 40-branch drift + divergent `main-ship` + the TestFlight-cut-from-export-missing-branch weeks ago.
3. **Tags going forward**  - no git tags exist; tag releases (`v2.0.9` on `7b7ce46`) so version->commit mapping stops relying on commit-message archaeology.
