# Handoff: Co-Exist UI mature restyle - admin long-tail (2026-08-15)

Cold-start-safe. Read top to bottom, then keep going. You are continuing an
in-progress design pass on the Co-Exist app. Repo: `/Users/ecodia/.code/coexist`
(React + Vite + Tailwind v4 + Capacitor). Deploys to https://app.coexistaus.org
via Vercel on push to `main`. Re-probe `git log origin/main` before you start:
later commits may sit on top of the ones named here.

## The mission (Tate's direction, verbatim intent)

Tate felt Co-Exist was "not up to par" and had over-directed the design toward
austerity. He sharpened it:

> "the /admin page is just really cringey and UI heavy instead of the mature
> co-exist style that we've been applying to the /profile, /explore and homepage"

The job is to bring every admin surface into the mature, restrained, editorial
Co-Exist style already proven on the member surfaces (/profile, /explore, home)
and the Insights page. Restraint is the higher craft here. Do NOT add gradient
blobs, rainbow per-metric badges, alert banners, or big bold icon headers.

Governing rule when the design review and this direction disagree: **Tate's
mature/restrained direction wins.** The review (`drafts/ui-design-review-2026-08-15.md`)
recommends adding colour, micro-viz and tinted shadows back. Use the review ONLY
as a defect map (where the problems are), and apply the mature fix, never the
add-colour-back fix.

## What is DONE and LIVE on app.coexistaus.org

Four commits on `main`, all pushed and deploy-verified with authed CDP canaries
against the DEPLOYED url:

- `44c583a1` dashboard (`src/pages/admin/index.tsx`): mature `SectionHeader`
  (`font-heading text-[13px] font-bold uppercase tracking-widest text-neutral-700/70`,
  no coloured icon), a flat hairline-divided `OverviewStat` strip replacing the
  boxy multi-colour bento. Also `events-missing-impact-card.tsx` calmed to a white
  editorial card, `optimized-image.tsx` given a brand-tinted skeleton + branded
  error tile (app-wide), and truncation fixes on `admin-hero-stat.tsx` +
  `home.tsx`.
- `4fbf30c6`: `empty-state.tsx` (app-wide) dashed-stroke SVGs replaced by branded
  solid `WatermarkTile`s; `admin/users.tsx` olive hero filled with real counts
  (`useAdminUserCounts`, head-only) + default Participant pill suppressed + row
  hover; `admin/collectives.tsx` empty hero filled via cached `useAdminOverview('all')`;
  `admin/audit-log.tsx` `formatDetails()` + 8-char target token killing the raw
  JSON / 36-char UUID leak.
- `cf0f80e9`: `admin/merch/products-tab.tsx` price promoted to the hero number
  (`text-base font-bold neutral-900 tabular-nums`), variant-count meta to neutral-500.
- `4a10562d`: `components/dropdown.tsx` (app-wide) default trigger changed from the
  grey `bg-surface-3` wireframe fill to `bg-white border border-neutral-200
  hover:border-neutral-300`. The `tone='dark'` hero variant is untouched.

PARKED on purpose: `src/components/bento-stats.tsx` rainbow-badge re-wire was
reverted. Do NOT re-apply rainbow/per-metric badges unless Tate asks.

## The member app is already mature (do not re-do it)

Probed live 2026-08-15 (home, explore, leaderboard, profile). All at the mature
bar: full-bleed photo heroes, medal (gold/silver/bronze) leaderboard, wrapped
headers, tinted-initials avatar fallback, gradient-backed profile hero. Most of
the review's member-cluster findings are STALE. Two specific debunks:
- The profile-header "black void avatar" is fixed: the hero paints a nature
  gradient base (`profile/index.tsx:253`) and uses the shared tinted `Avatar`.
- The bottom-right dark circle "FAB" the review flagged is the Studio editor
  toggle (only shows for editor/admin sessions like devshot's), NOT a member bug.

So spend effort on ADMIN, not the member app. Re-probe live before trusting any
member finding in the review doc.

## The mature style vocabulary (apply to every admin page)

North-stars to copy (read first): `src/pages/admin/insights.tsx` (the calmest
admin page), `src/pages/events/index.tsx` (explore `SectionHeader`),
`src/pages/admin/index.tsx` (the shipped dashboard `SectionHeader` + `OverviewStat`).
Shared primitives to reuse: `AdminHeroStat` + `AdminHeroStatRow`
(`src/components/admin-hero-stat.tsx`), `useAdminHeader(title, { heroContent })`
(`src/components/admin-layout.tsx`), `useAdminOverview('all')`
(`src/hooks/use-admin-dashboard.ts`, cached national counts), `EmptyState`
(`src/components/empty-state.tsx`, presets now branded).

DO:
- Small uppercase tracked editorial section headers, no decorative icons.
- Flat stats: hairline dividers, `tabular-nums`, tiny muted labels, small neutral
  icons. Restrained colours only (primary / moss / sprout / glass), never a
  rainbow deck.
- White cards `border-neutral-100 shadow-sm rounded-2xl`, generous whitespace,
  one scarce green accent for actions only.
- Fill the olive hero band via `heroContent`. It is FIXED-height by design
  (`admin-layout.tsx`, min-h-[15rem]), so you cannot shrink it; fill it with real
  counts instead of leaving a title over a void.

KILL ON SIGHT:
- Boxy multi-colour stat decks (bento with per-metric colour).
- Big bold `text-lg/xl font-bold` headings with coloured icons + grey sub-captions.
- Yellow/red alert banners for routine states (calm to editorial cards).
- Empty olive hero bands carrying only a centred title.
- All-zero stat rows above an empty-state (two "nothing here" signals stacked).
- Bespoke dashed-box / bare `bg-neutral-*` empty states (use `<EmptyState>`).
- Meta text below `neutral-500` that a user must read (dates, notes) - it reads
  as broken. Raise to `>= neutral-500` (legibility floor).

## Remaining work: the admin long-tail (ranked, dev-loop + screenshot each)

The high-impact surfaces are done. What is left is ~25-30 lower-traffic admin
pages with the same recurring defects. Diminishing returns, but real. Per page,
run the recipe below, screenshot authed, read it, fix, move on.

The recurring recipe (apply what the page needs):
1. Header: convert any bold-icon `SectionHeader` to the mature editorial style.
2. Hero: if `useAdminHeader('X')` has no `heroContent` and the page has counts,
   add a memoized `<AdminHeroStatRow>` (reuse `useAdminOverview('all')` or the
   page's own data hook). If the dataset can be empty, suppress the row rather
   than render all zeros.
3. Empty states: swap any bespoke illustration for `<EmptyState illustration=
   "empty|search|error" ... />`.
4. Legibility: raise faint meta text to `>= neutral-500`.

Named targets:
1. `admin/email/index.tsx` - "Draft with AI" reads as disabled; give it the
   filled primary `Button` variant used by Create Survey / New Update. Give the AI
   textarea a white ground + border + placeholder (review #9). Also the email
   sub-tabs (`email/*.tsx`).
2. `admin/updates.tsx` + `admin/applications.tsx` - suppress the all-zero hero
   stat row when the primary metric is 0 (review #2).
3. `admin/contacts.tsx` - Emergency Contacts: promote the phone number to
   `text-base font-semibold neutral-900 tabular-nums` (review #6, it is the
   actionable datum); strengthen category tints; raise meta above the floor.
4. `admin/legal-pages.tsx` - dates are near-invisible neutral-300; raise to
   neutral-500. Editorial hairline list rather than identical card soup (review #12/13).
5. `admin/events.tsx` - vary card weight so a high-registration event is not
   identical to a 1-registration one; design the single-event-group few-case (#12).
6. Fill-or-suppress hero + empty-state sweep across the rest: `surveys.tsx`,
   `photos.tsx`, `partners.tsx`, `memberships/index.tsx`, `challenges.tsx`,
   `moderation/index.tsx`, `dev-tools.tsx`, `collective-detail.tsx`,
   `create.tsx`, `create-survey.tsx`, `development/*`, `merch/*` sub-tabs
   (orders/inventory/analytics/promos/shipping).

Optional polish already flagged but not required: Users bulk-action bar
(checkboxes exist), Collectives card-weight variation.

## The dev loop

1. `npm run dev` from the repo root (Vite, http://localhost:5173, HMR, Node >=22).
2. Authed screenshot via CDP token injection. Canonical Chrome must be up on :9222
   (`bash /Users/ecodia/.code/ecodiaos/backend/scripts/chrome-cdp.sh` if not). Then:
   `node drafts/handoff-admin-mature-restyle-2026-08-15/devshot.cjs <path> <name> <width> <height>`
   e.g. `node drafts/handoff-admin-mature-restyle-2026-08-15/devshot.cjs /admin/email email-after 1440 900`
   It reads admin creds from `/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/coexist.json`
   (+ anon key from `coexist_supabase.json`), mints a GoTrue token, injects it into
   `localStorage['sb-tjutlbzekfouwsiaplbr-auth-token']`, navigates, and writes a
   full-page PNG to `drafts/handoff-admin-mature-restyle-2026-08-15/shots/<name>.png`
   (stable dir next to this doc; `mkdir -p`d; gitignored). Read the PNG eyes-on.
   - `DEV_URL=https://app.coexistaus.org` points it at the deployed site.
   - `SETTLE=8000` (default 3500): data-heavy pages animate count-up via
     `startTransition`, which the headless tab starves, so a short settle shows
     `0` stats. Use `SETTLE>=8000` on heavy pages (users, big lists) and on cold
     deployed loads (the splash needs ~10-12s).
   - Admin looks best at 1440 wide; the member app at 390x844.
3. Iterate: edit -> HMR -> screenshot -> read the whole frame like a designer.

## Push / deploy

- Deploys on `git push origin main` (Vercel auto-deploy). Commit author MUST be
  GitHub-recognised (EcodiaCode / EcodiaTate) or Vercel skips the build. This repo
  commits straight to `main`; Tate approved shipping the restyle 2026-08-15.
- The `first-commit-probe-bind` hook fires on the FIRST coexist commit of a
  session and scans the BASH COMMAND STRING (not the `-F` file) for a single line
  carrying `probe:` AND a `not <adjacent>` clause. With `-F msgfile`, append the
  probe as a shell comment on the command, e.g.
  `git commit -F msg.txt  # probe: CDP shot of /admin/email shows a filled Draft-with-AI button not the prior disabled-grey CTA`.
  Keep the full message in the file too.
- After push: `vercel_list_deployments` (ecodia-code MCP, `limit` as a bare number)
  until the commit's deployment is `READY`, then a deployed-url CDP canary showing
  the change live (`DEV_URL=https://app.coexistaus.org`, SETTLE>=10000).

## Gotchas / truth

- `npx tsc --noEmit -p tsconfig.app.json` has PRE-EXISTING errors in
  `use-events.ts`, `use-admin-events.ts`, `settings/account.tsx`, test files
  (supabase RPC type-gen drift). NOT yours. Verify only that YOUR changed files
  add no new errors: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep <yourfile>`.
- Em-dashes (U+2014) banned at character level (hook-enforced). `grep -c
  $'\xe2\x80\x94' <file>` must return 0 before commit.
- Lazy images below the fold render grey in a headless full-page shot (never
  scrolled into view). That grey is a capture artifact, not a defect.
- Before editing a file, `find src -mmin -12` to confirm no sibling worker is
  mid-edit on it. Unrelated cron workers (gmail-inbox-poll etc.) do not touch
  coexist src.
- Do NOT commit the ambient churn: `ios/.../Package.resolved`,
  `supabase/.temp/cli-latest`, `deno.lock`. Stage only your changed src files.

## Pointers

- status_board row `9200dea7-b053-4a00-8519-02ea1d052d82`
  ("Co-Exist UI design uplift (admin-first)"), next_action_by=ecodiaos. Update it
  in the SAME turn you ship.
- Design review `drafts/ui-design-review-2026-08-15.md` is PARTLY STALE - a defect
  map only, re-probe live before trusting a finding.
- Screenshots from this session: `shots/` next to this doc.
- Live tip as of 2026-08-15: `4a10562d` (re-probe `git log origin/main`).
