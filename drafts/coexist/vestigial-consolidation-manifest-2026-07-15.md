# Co-Exist Vestigial + Consolidation Manifest

Date: 2026-07-15
Repo: /Users/ecodia/.code/coexist (branch main)
Scope: READ-ONLY audit -> executable cleanup manifest. Every claim below carries a concrete grep/command proof that was actually run during the adversarial verification pass.

Guardrails (do not violate):
- web/ (Next.js marketing site) is a KEEP. Never delete web/ or anything only-used-by-web/.
- shared/ (impact-core.ts, impact-metrics.ts) is imported by BOTH src/ and web/. KEEP.
- Tables site_content, team_members, partners are KEEP (read by web/lib/queries.ts and the app).

---

## 1. DELETE (safe deletions)

### 1a. Marketing-admin vestige

**src/pages/admin/site.tsx (231 lines) + its wiring**: authorized delete (controls nothing live; coexistaus.org is Kurt's Squarespace).
- DELETE file src/pages/admin/site.tsx
- src/App.tsx:150: delete `const AdminSitePage = lazy(() => import('@/pages/admin/site'))`
- src/App.tsx:511: delete the `<Route path="site" ... AdminSitePage ...>` line
- src/components/sidebar/admin-nav.ts:71: delete the 'Marketing Site' nav item
- src/components/sidebar/admin-nav.ts:18: delete the `Globe,` import (now orphaned; noUnusedLocals fails otherwise)
- KEEP src/lib/capabilities.ts:28 (manage_marketing def) and :104 (manager ROLE_DEFAULT_CAPS). REFUTED in candidate: the DB migration 20260714030000_capabilities_enforced_in_db.sql hardcodes manage_marketing into coexist_role_caps() for admin (line 67) and manager (line 75); removing the TS def creates silent TS/DB RBAC drift. A capability with no UI route is harmless.
- Proof: `grep -rn 'AdminSitePage|admin/site|Globe' src/` -> only App.tsx:150/:511, admin-nav.ts:18/:71. Globe used only at admin-nav.ts:71.

**Consequence (behavioural note, no extra edits):** site.tsx is the SOLE in-app writer of site_content, team_members, and the marketing partners table. After removal there is no in-app editor for those three tables; the tables stay live and web/ keeps reading them.
- Proof: `grep -rn team_members src/` -> writes only at site.tsx:87/94/100; `grep -rn "from('partners')" src/` -> only site.tsx:64/106/113/119; `grep -rn site_content src/` -> upsert only at site.tsx:80.
- DO NOT touch src/pages/admin/partners.tsx or App.tsx:145/:506 or the manage_partners capability (different feature: organisations/partner_offers).
- KEEP migration supabase/migrations/20260622130000_marketing_cms.sql.

### 1b. Dead code (unreferenced components/pages/hooks)

**src/pages/admin/reports.tsx (1371 LOC), src/pages/admin/impact.tsx (772 LOC), src/pages/admin/metrics.tsx (189 LOC)**: superseded by inline AdminInsightsPage; zero importers.
- DELETE all three files.
- src/App.tsx:151-154: remove the now-stale comment block claiming they load via the AdminInsightsPage tabs wrapper (provably false; not build-breaking but leaves zero dangling references to the deleted component names).
- No edit to src/components/admin-layout.tsx:225 or src/pages/admin/index.tsx:330: URL-string refs that resolve via the redirect routes (App.tsx:500-503), do not import the files.
- Proof: `grep '@/pages/admin/{impact,metrics,reports}'` across src/+web/ -> no matches; the /admin/impact|metrics|reports URLs are `<Navigate replace/>` redirects with no component import.

**src/pages/impact/index.tsx (611 LOC, default export ImpactDashboardPage)**: /impact route is `<Navigate to='/profile' replace/>`; nothing imports the page.
- DELETE the file. No other edits.
- Proof: the only importers of pages/impact (App.tsx:190, use-role-prefetch.ts:69) target @/pages/impact/national (a different file). No `@/pages/impact` barrel import exists.

**src/pages/updates/create.tsx (639 LOC, export CreateUpdatePage)**: no route, no importer; live authoring is admin/updates.tsx via useCreateUpdate.
- DELETE the file. No other edits.
- Proof: whole-repo `grep -rn CreateUpdatePage` and `grep -rn updates/create` (self excluded) -> empty. App.tsx wires only @/pages/updates/index and @/pages/admin/updates.

**src/pages/more.tsx (238 LOC, MorePage)**: no importer; App.tsx defines no /more route element.
- DELETE the file. The /more nav strings in the layouts are a separate concern (they already resolve to no route element pre-deletion).
- OPTIONAL doc hygiene: MOBILE_PADDING_AUDIT.md:231 stale row (moot if that file is deleted per 1c).
- Proof: `git grep MorePage` / `git grep pages/more` -> only self-def + the MOBILE_PADDING_AUDIT.md row; `grep -niE more src/App.tsx` -> empty.

**src/pages/leader/reports.tsx (6 LOC re-export stub)**: `export { default } from '@/pages/reports/index'`, itself unreferenced; App.tsx:178 wires LeaderReportsPage directly to reports/index.
- DELETE the file. No other edits.
- Proof: `grep -rn 'leader/reports' src/` (self excluded) -> empty.

**src/components/admin/admin-list-page.tsx (123 LOC)**: never adopted; zero code importers.
- DELETE the file. Its re-export of AdminHeroStatRow is unused (all 20+ consumers import AdminHeroStatRow directly from @/components/admin-hero-stat).
- Proof: `grep -rn 'admin-list-page|AdminListPage'` whole repo -> only self + CONSOLIDATION_REPORT.md (a doc).

**src/pages/admin/merch/returns-tab.tsx (124 LOC, ReturnsTab)**: merch index does not import it; TAB_COMPONENTS map has no returns entry.
- DELETE the file. No other edits.
- Proof: `grep -rn ReturnsTab` whole repo -> only returns-tab.tsx:23.

**src/components/map/index.ts (3 LOC barrel)**: every consumer imports the concrete modules directly; barrel form unused.
- DELETE the file. map-view.tsx + use-map.ts stay (live via direct imports).
- Proof: no import of `@/components/map` or `@/components/map/index` anywhere; 5 consumers use @/components/map/map-view or @/components/map/use-map.

**src/hooks/use-form-mutation.ts (66), src/hooks/use-public-stats.ts (71), src/hooks/use-search.ts (206)**: zero importers (343 LOC total).
- DELETE all three files. No other edits.
- Proof: `grep -rn 'usePublicStats|use-public-stats|useFormMutation|use-form-mutation|useSearch|use-search' src/` (self excluded) -> empty. web/lib/public-stats.ts is a standalone server-side reimplementation, not the app hook.

**src/pages/onboarding/steps/step-interests.tsx (77), src/pages/onboarding/steps/step-profile-photo.tsx (107)**: dropped from the flow; onboarding.tsx imports only the other 5 steps.
- DELETE both files. No other edits.
- Proof: `grep -rn 'StepInterests|StepProfilePhoto|step-interests|step-profile-photo'` -> only self; onboarding.tsx:12-16 imports name-handle/location/collective/first-event/celebration.

**src/components/top-nav.tsx (279 lines, TopNav)**: dead parallel nav; never rendered. Live nav is UnifiedSidebar.
- DELETE the file.
- src/components/index.ts:66: remove the line `export { TopNav } from './top-nav'`.
- Proof: full-repo grep for TopNav -> only interface (top-nav.tsx:16), function def (:22), barrel re-export (index.ts:66). No `<TopNav` JSX anywhere.

### 1c. Root cruft / stale docs

**AUDIT-REPORT.md**: one-off 2026-04-11 report, self-labelled COMPLETE. `git rm AUDIT-REPORT.md`.
- Proof: `git grep -l AUDIT-REPORT -- ':!AUDIT-REPORT.md'` -> 0 refs.

**CONSOLIDATION_REPORT.md**: one-off 2026-04-01 analysis (dead d:/ Windows path), committed under garbage 'fjudfh' commit. `git rm CONSOLIDATION_REPORT.md`.
- Proof: `git grep CONSOLIDATION_REPORT` (self excluded) -> 0.

**MOBILE_PADDING_AUDIT.md**: one-off 2026-04-23 padding audit; fix already shipped. `git rm MOBILE_PADDING_AUDIT.md`.
- Proof: `git grep MOBILE_PADDING_AUDIT` (self excluded) -> 0.

**drafts/coexist/2.0.19-test-report.md + 2.0.19-evidence/*.png (6) + evidence-2.0.19-glovebox-event-map.png**: spent QA gate for 2.0.19, superseded by 2.0.20 (Play prod 2026-07-14).
- `git rm drafts/coexist/2.0.19-test-report.md`
- `git rm drafts/coexist/2.0.19-evidence/android-api30-webview-gate.png`
- `git rm drafts/coexist/2.0.19-evidence/android-api35-coldstart.png`
- `git rm drafts/coexist/2.0.19-evidence/ios-sim-coldstart.png`
- `git rm drafts/coexist/2.0.19-evidence/web-checkout-handoff-a0.png`
- `git rm drafts/coexist/2.0.19-evidence/web-event-detail-leader-export.png`
- `git rm drafts/coexist/2.0.19-evidence/web-questions-modal-required-gate.png`
- `git rm drafts/coexist/evidence-2.0.19-glovebox-event-map.png`
- KEEP adjacent 2.0.19-regression-test-matrix.md and 2.0.19-sentry-reconcile-plan.md (not in scope, no cross-ref).
- Proof: `git grep -l '2.0.19-test-report'` (drafts excluded) -> 0.

**drafts/floating-local-v2-* (4 files)**: spent rollout/cutover/sim/trigger-fix for floating-local v2, shipped in 1.8.22.
- `git rm drafts/floating-local-v2-rollout-plan-2026-05-26.md`
- `git rm drafts/floating-local-v2-simulation-2026-05-26.md`
- `git rm drafts/floating-local-v2-cutover-2026-05-26.sql`
- `git rm drafts/floating-local-v2-trigger-fix-2026-05-26.sql`
- These .sql are manual cutover runbooks, NOT supabase/migrations/ entries. Deleting unapplies nothing.
- Proof: `git grep -nE 'floating-local-v2|floating_local_v2'` (candidates excluded) -> 0.

### 1d. Unused deps

**i18next + react-i18next (package.json)**: zero i18n usage in src/.
- package.json:51: remove `"i18next": "^25.8.20",`
- package.json:64: remove `"react-i18next": "^16.5.8",` (must go together; react-i18next depends on i18next)
- vite.config.ts:69: remove `if (id.includes('i18next')) return 'i18n'` (dead manualChunks hint)
- Run `npm install` to regenerate package-lock.json.
- OPTIONAL: src/locales/en.json is imported by nothing.
- Proof: `grep -rin i18n src/ index.html` -> 0; `grep -rln 'useTranslation|i18next|I18nextProvider' src/` -> nothing.

**@axe-core/react (package.json:73, devDependency)**: never imported.
- package.json:73: delete `"@axe-core/react": "^4.11.1",`
- Regenerate lockfiles via install (package-lock + auto-derived deno.lock:15).
- DO NOT touch vitest-axe (package.json:98): different package, LIVE at src/test/setup.ts:3 and src/test/accessibility-audit.test.tsx:9.
- Proof: exact-name grep -> only package.json:73 + a prose comment at src/test/accessibility.test.tsx:8.

**autoprefixer (package.json:87, devDependency)**: no build wiring at app root (Tailwind v4 @tailwindcss/vite handles prefixing).
- package.json:87: delete `"autoprefixer": "^10.4.27",`
- Regenerate package-lock.json via `npm install`.
- web/ has its own web/package.json (@tailwindcss/postcss) and does not consume the root dep.
- Proof: `git grep autoprefixer` -> only package.json:87 + package-lock.json; no root postcss/tailwind/browserslist config exists.

### 1e. Dead supabase

**supabase/functions/debug-push/ (280 lines)**: diagnostic one-shot push with a hardcoded debug passphrase; zero callers.
- DELETE directory supabase/functions/debug-push/ (single file index.ts).
- No edit to supabase/deploy-functions.sh (debug-push is NOT in its FUNCTIONS array) or config.toml.
- Out-of-repo follow-up (SURFACE, see s3): undeploy the live edge function from remote Supabase project tjutlbzekfouwsiaplbr so the passphrase-bypass endpoint stops serving.
- Proof: `grep -rn debug-push` (excl node_modules/_worktrees/ios/android) -> only self-refs at index.ts:1,169. Every .invoke() targets send-push, never debug-push.

---

## 2. CONSOLIDATE

There are NO safe-to-auto-apply consolidations. The two consolidation candidates both refuted:

- **Parallel modal/overlay primitives** (ticket-questions-modal, campout-requirements-modal, phone-gate, dietary-gate -> bottom-sheet.tsx): REFUTED. phone-gate and dietary-gate are DELIBERATELY non-dismissable safety gates (required mobile number / dietary + medical data). BottomSheet is unconditionally dismissable via Escape (:114), backdrop (:229), and drag (:182-187) with no prop to disable it. Consolidating the gates is a functional regression on required data collection. Even the two dismissable modals conditionally lock their backdrop mid-submit (ticket-questions:46, campout-requirements:81), which BottomSheet cannot model. See s3 (surface to Tate).

- **Stripe test twins** (create-checkout-test + stripe-webhook-test): sanctioned test harness, a keep-and-resync-vs-retire decision, not an auto-consolidation. See s3.

The highest-value REAL consolidation already latent in the DELETE set: the three superseded admin analytics pages (reports/impact/metrics, 2332 LOC) collapse into the single live src/pages/admin/insights.tsx. That consolidation is already complete at the routing layer (redirects in place); the DELETE just removes the dead residue.

---

## 3. SURFACE TO TATE (human decision required)

1. **supabase/functions/generate-wallet-pass/ (426 lines)**: Apple .pkpass + Google Wallet membership-card generator. Zero front-end callers but ACTIVELY DEPLOYED (supabase/deploy-functions.sh:16, functions.bat:3). Question: is the membership-card feature still on the roadmap (keep + file a wiring task) or abandoned (delete dir + strip both deploy manifests + undeploy from project tjutlbzekfouwsiaplbr)?

2. **supabase/functions/moderate-content/ (250 lines)**: uploaded-image content moderation (Google Vision SafeSearch) for a youth charity, shipped but never wired to any upload path. Compliance-sensitive child-safety control. Question: delete the unwired function, or WIRE it into the image-upload paths (use-event-photos, cover-image, chat/feed uploads)? Recommend wiring over deletion. Do NOT touch the content_report table (live).

3. **supabase/functions/create-checkout-test/ + stripe-webhook-test/ (a pair)**: doctrine-sanctioned Stripe test-mode twins, drifted from prod (create-checkout 650 vs test 545; stripe-webhook 663 vs test 633). Question: is the Stripe e2e test flow still run? If yes -> resync twins to prod logic; if no -> retire both dirs + undeploy both (they are a pair) + update COEXIST_TICKETING_PARITY_PLAN.md:108,166.

4. **src/pages/admin/site.tsx capability (manage_marketing)**: the page delete is authorized, but if Tate wants the capability itself gone, that is an RBAC role-default change: author a new migration altering coexist_role_caps() to drop manage_marketing from admin+manager, apply to prod, THEN remove capabilities.ts:28 and :104 in the same change. Default action: keep the capability (harmless with no UI route).

5. **debug-push undeploy**: repo delete (s1e) is clean, but the live edge function on project tjutlbzekfouwsiaplbr carries a hardcoded passphrase auth bypass ('coexist-debug-2026'). Undeploy it separately from the repo cleanup.

6. **@capacitor/browser (package.json:23)**: native plugin, zero call sites (only compiled iOS artifacts remain). Removal is NOT a single-file edit: package.json:23 removal, then `npm install`, then `npx cap sync` (regenerates Package.swift / capacitor.plugins.json / capacitor.settings.gradle), then rebuild iOS + Android and re-verify boot. Confirm no future deep-link / in-app-browser flow is planned before removing.
   - Proof: `grep -rln '@capacitor/browser|Browser.open' src/` -> 0; not a transitive dep of any other plugin.

---

## 4. SAVED (looked dead, refuted by a live reference: do not re-audit)

- **manage_marketing capability (capabilities.ts:28/:104)**: Postgres-enforced in migration 20260714030000_capabilities_enforced_in_db.sql (admin line 67, manager line 75). Removing the TS mirror creates silent TS/DB RBAC drift.
- **Modal/gate consolidation into BottomSheet**: phone-gate + dietary-gate are intentionally non-dismissable safety/data-collection gates; BottomSheet cannot be made non-dismissable.
- **generate-wallet-pass**: evidence "only Sentry-wrap touched it" was wrong; it is in the live deploy pipeline (deploy-functions.sh:16, functions.bat:3). Roadmap decision.
- **moderate-content**: unwired but a child-safety compliance surface; Tate decision, not a mechanical sweep.
- **create-checkout-test / stripe-webhook-test**: doctrine-sanctioned external-HTTP test harness; absence of an in-repo caller is by design.
- **@capacitor/browser**: code-dead but a native plugin; removal needs cap sync + native rebuild, not a hand-edit (surfaced, not swept).

---

## 5. EXECUTION ORDER (safe sequence on main, typecheck/build gate between groups)

Run each group, then gate with `npx tsc --noEmit` (or `npm run build`) before the next. Any red = stop and fix before proceeding.

1. **Group A: dead code files (1b), no wiring beyond same-file edits.**
   Delete: reports.tsx, impact.tsx, metrics.tsx, impact/index.tsx, updates/create.tsx, more.tsx, leader/reports.tsx, admin-list-page.tsx, merch/returns-tab.tsx, map/index.ts, use-form-mutation.ts, use-public-stats.ts, use-search.ts, step-interests.tsx, step-profile-photo.tsx, top-nav.tsx.
   Edit: src/components/index.ts:66 (drop TopNav re-export); src/App.tsx:151-154 (drop stale comment).
   GATE: `npx tsc --noEmit`.

2. **Group B: marketing-admin vestige (1a).**
   Delete src/pages/admin/site.tsx; edit App.tsx:150, App.tsx:511, admin-nav.ts:71, admin-nav.ts:18 (Globe). KEEP capabilities.ts:28/:104.
   GATE: `npx tsc --noEmit` (Globe orphan removal is what keeps noUnusedLocals green).

3. **Group C: unused deps (1d).**
   Edit package.json (i18next:51, react-i18next:64, @axe-core/react:73, autoprefixer:87) + vite.config.ts:69. Run `npm install` to regenerate lockfiles.
   GATE: `npm run build` (real build, not just tsc: exercises the manualChunks change).

4. **Group D: root cruft + stale docs + drafts (1c) and dead supabase repo delete (1e).**
   `git rm` the docs, the 2.0.19 bundle, the floating-local-v2 bundle, and the supabase/functions/debug-push/ dir. Pure removals, no build surface.
   GATE: `git status` clean-of-danglers check + one final `npm run build`.

5. **Commit** the whole cleanup on main (trunk-based, ship from main per doctrine).

6. **Out-of-band (NOT in the commit): SURFACE items s3.** None of the surface-to-Tate items get auto-applied. debug-push undeploy (s3.5) and any generate-wallet-pass / moderate-content / stripe-test-twins decision happen after Tate rules on them.

DO NOT sequence @capacitor/browser (s3.6) into any group: it requires cap sync + native rebuild and is Tate-gated.
