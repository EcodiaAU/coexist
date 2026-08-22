# Co-Exist UI Primitives Unification - Punchlist

Source: Tate, 2026-08-21 (reconstructed after a lost tab). This is the durable capture so it never costs us twice.

## The core problem
Switchers, filters, dropdowns, tabs are **fragmented** across the app - every surface reimplements them ad-hoc. They need to collapse onto a **single global, smoothly-animated primitive** per type, with consistent:
- switching animation
- active-state animation
- entry / exit animation
- (for expandable rows) open/close + layout-shift animation

Switchers/switches are **by far the most fragmented** and the top priority to unify.

## Primitives to design + unify
1. **Switcher / segmented control / toggle** - the biggest offender. One global animated design.
2. **Dropdown / select** - several are ad-hoc, not using the global primitive.
   - Homepage **impact section** dropdown is NOT using the right one.
3. **Filter pills** - Explore page switchers, others.
4. **Tabs** - /shop, /admin/shop, shop product detail, others.

## Specific surfaces called out
- **Homepage impact section** - fragmented switcher/dropdown impl; not on the global primitive.
- **Admin pages** - fragmented implementations across the board.
- **Admin users page** - unify the *user row click* AND the *user row settings-button click* to open the **same modal**. Change the settings icon to a **right arrow**.
- **Leader suite** - a few pages with non-unified switchers.
- **Feedback page** - rows have **no smooth open/close** and no layout-shift animation.
- **Explore page** - switchers need unifying (partial work already exists: pill-row + Dropdown/MultiSelect pill props, branch `coexist-explore-filter-pill-row-2026-08-21`, PR #74).
- **/shop, /admin/shop, shop product detail** - switchers, tabs, dropdowns all need unifying onto the global primitive.

## Loading states
- Some pages, if content takes a moment to load, **default to a "not found" page state** - terrible UX.
- Should show a **loading shell** instead.
- The **admin insights page** does the loading shell **really well** - use as the reference.
- We need **perfectly matching shells relative to each page's final state** across the whole app (shell shape mirrors real content shape).

## Motion polish
- **Floating dock on admin insights page** needs an **entry/exit animation**.

## Process (Tate's plan)
1. **Prototype** each primitive first - find a design we're happy with per primitive. ← current step
2. THEN fire crons to roll it out app-wide.

## Prototype
Interactive prototype (live tokens, Eau Sans, real springs): https://claude.ai/code/artifact/7db633e6-6346-48b6-8a69-cf9396bf7b89
Source: `drafts/ui-primitives-unification-2026-08-21/prototype.html`

## STRATEGY SHIFT (Tate, 2026-08-21): adopt OSS, do not hand-roll
Do NOT build these primitives from scratch. Adopt them from the shadcn registry and restyle to the olive tokens. The prototype above is the VISUAL / restyle target, not the implementation. Doctrine: `backend/patterns/adopt-and-restyle-oss-components-no-adhoc-primitives-2026-08-21.md`.
- Co-Exist stack is ready: react 19.2, tailwind v4.2, clsx + tailwind-merge + lucide already installed, `globals.css` uses the `@theme` model shadcn v4 wants. Missing: `@radix-ui/*`, `components.json`, `src/components/ui`.
- LANE 0 (do first): `npx shadcn@latest init` in coexist, add the token-map block to `globals.css` (`--primary: var(--color-primary-600)`, `--background: var(--color-surface-1)`, `--ring: var(--color-primary-400)`, `--border: var(--color-neutral-200)`, plus `--secondary/--muted/--accent/--destructive`), then `shadcn add tabs dropdown-menu select dialog popover command sonner` + `npm i vaul`.
- Then each primitive lane below becomes ADOPT-and-restyle, not build:
  - Switcher -> shadcn Tabs (or a Radix ToggleGroup) restyled to the search-family pill spec (grey surface-3 track, white pill + primary ring, end-bleed geometry).
  - Dropdown / MultiSelect -> shadcn Select / DropdownMenu (keep-open multi via a checkbox menu).
  - Filter pills -> shadcn Toggle / Badge restyled.
  - Tabs -> shadcn Tabs (sliding underline via `data-state` + a layout indicator).
  - Modal -> Vaul (bottom sheet, drag-dismiss) + shadcn Dialog (desktop), replacing the hand-rolled `BottomSheet`/`RouteSheet` chain and the ~11 ad-hoc dialogs. Our routed-page-in-a-sheet pattern layers on top of Vaul.
  - Loading shell -> shadcn Skeleton restyled to the shimmer.
  - Toasts (adjacent win) -> Sonner, retire ad-hoc toasts.
- The existing `SegmentedControl`/`TabBar`/`Dropdown`/`BottomSheet` in `src/components` get replaced by the restyled shadcn versions, not extended. Keep the same export names so callers do not churn.
- OWED enforcement artifact: PreToolUse warn hook flagging a hand-rolled primitive (raw `role="dialog"` + `fixed inset-0`, inline segmented control) when `components.json` exists.

## Decisions (Tate, 2026-08-21 round 2)
- SWITCHER: the A+B blend that matches the `search-bar` primitive. Warm-grey `surface-3` track, rounded-full, `shadow-sm` (same as `search-bar.tsx`), white sliding pill with a `primary-200` ring and `primary-800` label. Give the active pill MORE y-padding (taller). Solid-olive pill stays only for a single high-emphasis toggle.
  - PILL GEOMETRY: the active pill overlays the button box with a uniform ~4px inset, and the END segments fill toward their outer edge (first hugs left, last hugs right, ~1px outer gap) so ends read balanced. Prototype measured leftGap=1 / rightGap=1 / vertical=4. When adding the layoutId slide to `SegmentedControl`, size the indicator off the active button's rect and add the end-bleed for the first/last segment.
- MODAL exit: the sheet must animate OUT rather than vanish instantly. The real `BottomSheet` already does (SHEET_TRANSITION + delayed unmount); only the prototype needed the fix (hold visibility through the 0.42s exit). No app change needed here beyond keeping the exit path when the ~11 dialogs migrate.
- MULTI-SELECT: must NOT close on each select. Stays open while toggling; closes only on Done, outside-click, or the trigger. (Prototype bug was option clicks bubbling to the outside-close handler; real `multi-select.tsx` already keeps open, verify it does and add a Done affordance.)
- FILTER PILLS: more y-padding in ALL states (target ~42px min-height / 44px tap target).
- MODAL: new primitive. The explore event-detail sheet is the best; promote it as canonical and roll out everywhere (Lane 7).
- LOCKED as prototyped: tabs (sliding underline), expandable rows (grid-rows glide), loading shells (shape-matched), floating dock option A (slide up + fade), admin users row (one modal + right-arrow).

## What is ALREADY unified (audit 2026-08-21, do NOT touch)
- `TabBar` (sliding underline, layoutId) is used on ~11 admin surfaces + merch tabs: workflows, partners, surveys, applications, merch/index+sub-tabs, memberships, email, moderation.
- `SegmentedControl` used: explore (`events/index.tsx:270`), leader tasks (`tasks.tsx:1710`), admin collective-detail (`:1465`). Note: it is CSS-only, NO sliding indicator (the design gap to close).
- `Dropdown`/`MultiSelect` (with 2026-08-21 sm/active/leadingIcon pill props) used: explore filters, leader index/events/feedback, admin index.
- Correct loading-guard references: `events/event-detail.tsx:869`, `profile/view-profile.tsx:93`, `collectives/collective-detail.tsx:133`.
- Primitives to migrate ONTO: `SegmentedControl` `src/components/segmented-control.tsx`, `TabBar` `tab-bar.tsx`, `Dropdown` `dropdown.tsx`, `MultiSelect` `multi-select.tsx`, `Chip` `chip.tsx`, `Skeleton` `skeleton.tsx`, `BottomSheet` `bottom-sheet.tsx`, motion lib `src/lib/admin-motion.ts` (`expandCollapse`, `fadeUp`).

## Rollout map (precise, once designs locked)

### Lane 1 - Switcher primitive (add sliding indicator + migrate ad-hoc)
- FIRST: add the layoutId sliding pill to `SegmentedControl` (`segment-control.tsx`), lifting `bottom-tab-bar.tsx:166-173` pattern (LayoutGroup + motion.span layoutId + pill). This upgrades every existing consumer for free.
- Migrate ad-hoc onto it:
  - `home.tsx:1170-1238` scope switcher (National/Collective) + hand-rolled dropdown `:1213-1235` (outside-click `:1103-1113`).
  - `home.tsx:1241-1266` time-range switcher.
  - `admin/events.tsx:539-556` status toggle.
  - `admin/collectives.tsx:243-260` status toggle.
  - `admin/applications.tsx:819-853` duplicate pill row (already has Dropdown `:809` + TabBar `:792`; delete the duplicate).
  - `shop/index.tsx:83-136` inline `CategoryPills` -> filter pills.
  - `product-detail.tsx:609-651` size selector, `:665-703` colour selector -> segmented/pill.

### Lane 2 - Dropdown migration
- `home.tsx:1213-1235` hand-rolled collective dropdown -> shared `Dropdown` (single) or `MultiSelect`.

### Lane 3 - Expandable-row animation (feedback)
- `leader/feedback.tsx:328` (event row body) + `:371` (nested response row) currently `{open && ...}` instant. Wrap in `AnimatePresence` + `expandCollapse` (height/layout tween) + chevron rotate. Toggles at `:173`/`:182`, sets at `:140-141`.

### Lane 4 - Loading-shell system (the "not found while loading" bug)
Root cause: `hooks/use-delayed-loading.ts` returns true only after 1000ms; guarding `if(showLoading) return <Skeleton>` then `if(!data) return <NotFound>` flashes NotFound for up to 1s every load. Fix per file: add raw `isLoading` to the loading guard (`if (showLoading || isLoading) return <Shell/>`). Reference: `event-detail.tsx:869`.
Confirmed offenders (each gets a shape-matched shell + the guard fix):
1. `shop/product-detail.tsx:463-464` - gallery + title/price + variant selectors + sticky buy footer.
2. `shop/order-detail.tsx:102-114` - order title + line items + summary card.
3. `public/collective.tsx:157-169` - hero(h-56) + title + 3 lines + events list (also conflates error+notfound).
4. `admin/collective-detail.tsx:1377-1390` - hero banner + 4 stat cards + tab bar.
5. `events/event-day.tsx:762-776` - title + 2 stat cards + roster list-items.
6. `events/post-event-survey.tsx:235-248` - header card + stacked question cards.
Reference shell: `admin/insights.tsx:498-529` (shape-matched, gated on raw `obsLoading`). Build shells with `Skeleton` variants (`text|title|avatar|card|stat-card|image|list-item`).

### Lane 5 - Admin users modal unification + icon
- `admin/users.tsx:1147` row onClick -> `ProfileModal` (`:1207`); `:1177` gear onClick -> `UserSettingsSheet` (`:1204`). Different modals. Unify to ONE (open the same detail modal from both paths).
- Swap gear icon `Settings` (`:22` import, `:1181` render `<Settings size={18}/>`) -> right chevron (`ChevronRight`), styled as "opens detail" affordance.

### Lane 6 - Floating dock entry/exit
- `admin/insights.tsx:867-886` sticky selection bar is a bare `{selected.size>0 && (<div>)}` (`:872`). Wrap in `AnimatePresence`, convert to `motion.div`, slide-up + fade variant. `motion` + `useReducedMotion` already imported (`:20`), `adminVariants` (`:37`) available.

### Lane 7 - Modal primitive (event-detail sheet becomes canonical)
The "best modal" is a 3-layer chain, and the primitive already exists: `BottomSheet` (`components/bottom-sheet.tsx`) -> `RouteSheet` (`components/route-sheet.tsx`, routing adapter, `bare`) -> a full `<Page>` (`components/page.tsx`) rendered inside it. Explore opens it via `navigate(to,{state:{backgroundLocation}})` (`events/index.tsx:155`, card tap `:434`); App renders the sheet route at `App.tsx:731-734`. What makes it best: routed-page-in-a-sheet, so back/Escape/backdrop/drag all converge on one close path and the list keeps its scroll; `bare` gives hero + sticky glass header + scrolling body + sticky footer CTA; full a11y (role=dialog, aria-modal, focus-trap+restore, body scroll-lock, Escape), drag-dismiss (velocity 0.35, distance 0.25), desktop spring dialog (spring 260/28/0.6). Shared transition token `SHEET_TRANSITION` (`bottom-sheet.tsx:35`).
Step 1: document/export the pattern as the canonical Modal (a small `Modal`/`useRouteModal` wrapper over `RouteSheet` for non-route cases, so local modals get the same shell without needing a route).
Step 2: migrate the ~11 hand-rolled dialogs (own `createPortal` + `fixed inset-0` scrim, NOT on BottomSheet). Safe first conversions (already mimic the sheet shape): `components/campout-requirements-modal.tsx`, `components/campout-guest-requirements-modal.tsx`, `components/ticket-questions-modal.tsx`, `components/dietary-gate.tsx`, `components/phone-gate.tsx`. Then: `components/user-card.tsx`, `components/event-photos-section.tsx` (lightbox), `components/html-chat-bubble.tsx`, `pages/events/event-day.tsx` overlay, `pages/chat/chat-search.tsx`, `pages/admin/updates.tsx` mobile editor.
Exclude (non-dialog full-screen overlays): `confetti.tsx`, `celebration.tsx`, `splash.tsx`, `maintenance-mode.tsx`, `update-required.tsx`, `unified-sidebar.tsx` (drawer).
Already on BottomSheet (reference set, will become consumers): `announcement-modal.tsx`, `task-survey-modal.tsx`, `profile-modal.tsx`, all `*-sheet.tsx`.
