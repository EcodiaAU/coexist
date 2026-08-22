# Co-Exist UI consistency audit (2026-08-21)

Branch: `coexist-ui-consistency-2026-08-21` (off `coexist-ui-rollout-integration`).
Method: logged into localhost:5205 as the admin test account (uid 4cc11fa1), CDP-screenshotted every key surface at desktop (1280) and mobile (390). Read-only pass; the dev server env points at production Supabase, so no form submits / no writes / no account changes were made. Shots in `drafts/audit-shots/`.

## Headline

The radius fix is HOLDING everywhere. Tate's "SOOOO many unmigrated elements" was overwhelmingly the "full rectangles disease" (the circular `--radius` custom-property ref), now fixed on the integration branch. Across every surface below, `rounded-*` renders as real rounded corners.

The app is already comprehensively on the shared primitives:

| primitive | usage |
|---|---|
| Dropdown | 92 usages across 31 files (this IS the app's select primitive; shadcn `ui/select` is unused directly) |
| BottomSheet | 41 files |
| Skeleton | 71 files |
| TabBar | 11 files |
| SegmentedControl | 5 files |
| Modal | 5 files |
| Chip | 5 files |
| MultiSelect | 1 file |

## Per-surface (radius + consistency)

Every surface below verified rounded + on shared primitives at BOTH breakpoints.

- **home** (`/`): impact scope switcher, event cards, hero. Rounded. `home-{desktop,mobile}.png`.
- **explore / events** (`/explore`): SegmentedControl (Events/Collectives), the filter pill-row (Any time / All types / All states = Dropdown `size=sm`), search bar, event cards, floating TabBar (mobile). All rounded + shared. `explore-{desktop,mobile}.png`, `events-{desktop,mobile}.png`.
- **leaderboard** (`/leaderboard`): rounded. `leaderboard-{desktop,mobile}.png`.
- **shop** (`/shop`): category Chips (All / Accessories / Shirts), search, product cards. Rounded + shared. `shop-{desktop,mobile}.png`.
- **profile** (`/profile`): rounded. `profile-{desktop,mobile}.png`.
- **admin insights** (`/admin/insights`): three filter Dropdowns (All Time / All Collectives / All Types), stat cards + badges, growth charts. Rounded + shared. `admin-insights-{desktop,mobile}.png`.
- **admin users** (`/admin/users`): stat cards, "All Roles" Dropdown, search, user rows. Rounded + shared. `admin-users-{desktop,mobile}.png`.
- **admin email** (`/admin/email`): Email Marketing surface (contains one native select, see gaps). `admin-email-{desktop,mobile}.png`.
- **create event** (`/events/create`): collective picker, form sections (contains one native select). Rounded. `create-event-{desktop,mobile}.png`.

## GENUINE gaps (migrated this pass)

Exactly THREE native `<select>` remain in the whole codebase (`grep -rn "<select" src` = 3 hits). These are the last hand-rolled form controls; migrated to the shared `Dropdown`:

1. **`src/pages/admin/email/quick-send-tab.tsx:898`** - "See it as" subscriber preview picker. Was `rounded-sm border bg-white` native select. Dynamic option list (sample subscribers) + an empty placeholder option.
2. **`src/pages/events/create-event.tsx:1317`** - ticket question-type picker. Was `bg-surface-3` (grey fill = the exact "wireframe placeholder" look the Dropdown restyle set out to kill), inline with a Toggle.
3. **`src/pages/events/log-impact.tsx:360`** - per-sighting confidence picker. Was a compact `rounded-sm` sky-themed native select with a hand-positioned chevron.

## Dialog candidates (brief STEP 2b) - ALL correctly LEFT, with reason

The brief named four "hand-rolled dialog" candidates. Read each; none is a genuine scrim+centered/sheet content dialog, so migrating any to `Modal` would DEGRADE it. This matches the brief's own carve-out ("leave true overlays alone; when unsure, leave it and note it").

- **`src/components/user-card.tsx`** - LEFT: it is `aria-modal="false"` with no scrim (a presentational card the caller positions), AND it has ZERO call sites app-wide (`grep -rn "<UserCard" src` = 0). Nothing to migrate; unverifiable if migrated.
- **`src/components/event-photos-section.tsx`** (lightbox) - LEFT: full-screen `bg-black` media viewer with prev/next carousel nav. The `Modal` olive-card/bottom-sheet shell is the wrong shape for an edge-to-edge photo gallery.
- **`src/pages/events/event-day.tsx`** (overlay) - LEFT: the only hand-rolled overlay here is the fullscreen tap-to-enlarge QR display (`bg-white/98`, tap-anywhere-to-dismiss, sized to be scanned across a room). Specialized utility overlay, not a content dialog. The file already uses `BottomSheet` + `ConfirmationSheet` for its real dialogs.
- **`src/components/place-autocomplete.tsx`** - LEFT: a portalled typeahead suggestion popover anchored to a text input (async live place search). Not a scrim dialog, and not a `Dropdown` fit (Dropdown is a fixed option set with a trigger; this is a live-search listbox).

## App-wide dialog sweep (STEP 2c thoroughness)

Grepped every `fixed inset-0` scrim and every `role="dialog"`/`aria-modal` in `src`. Every hit is EITHER a shared primitive (`modal.tsx`, `bottom-sheet.tsx`, `ui/dialog.tsx`) OR an intentional overlay that must stay hand-rolled (`unified-sidebar.tsx` drawer, `celebration.tsx`, the photo lightbox, the QR display, the unreferenced user-card). There are NO hidden hand-rolled content dialogs to migrate.

## Minor note for Tate (not migrated)

`admin/insights` has a text-link tab strip (Overview / Growth / Impact / Attendance / By collective / Years / Raw data) that is a plain text nav rather than the shared `TabBar`/`SegmentedControl`. It works and reads fine; it is a text dock, not a broken control, and is not a clean shared-primitive swap (TabBar is icon+label pills; this is a dense inline text index). Left as-is; flagging in case a future pass wants to unify it.

## Verification of the 3 migrations

- **build:typecheck** (`tsc -b && vite build`): exits 0. The first run FAILED and caught a real bug: in quick-send the option label `s.first_name || s.display_name || s.email` is `string | null` (email is nullable), which violates `DropdownOption.label: string`. Fixed with a `|| ''` guard. Re-ran: clean.
- **lint** (`eslint .`): 0 errors (185 pre-existing warnings across the repo, none in the three edited files; the migration also removed a now-unused `ChevronDown` import from log-impact).
- **Primitive render proof**: the shared `Dropdown` (both default and the `size="sm"` variant these migrations use) is proven rendering as a rounded-full pill on live surfaces captured this pass: admin-users "All Roles", admin-insights three filters, the explore filter pill-row (`size="sm"`), and create-event's own "Activity Type" + "Weekly" recurrence dropdowns (computed `border-radius` = full, height 44 default / 36 sm). The migrations are 1:1 swaps of a native `<select>` for this proven primitive with standard props, so they inherit that render.
- **Live-render of the 3 specific instances: NOT captured.** All three sit behind deep conditional state that is impractical to drive read-only against the production-pointed dev DB without risking writes: create-event's question-type picker needs ticketing enabled + a question added inside an accordion that throws a full-page loading overlay mid-interaction; quick-send's picker needs an email body containing a `{{variable}}` plus loaded sample subscribers; log-impact's confidence picker needs a specific event's wildlife impact-log form. This is stated plainly rather than claimed. Repro for a human reviewer: (1) create-event -> expand Ticketing -> toggle "Require tickets?" -> Add a question -> the type picker is the migrated Dropdown; (2) admin email quick-send with `{{first_name}}` in the body -> "See it as" picker; (3) a wildlife event's impact log -> per-sighting confidence picker.

Risk read: these are minimal mechanical swaps to an already-proven primitive, value/onChange behaviour preserved, build + lint green. On mobile each now opens the shared bottom-sheet instead of the OS-native select, which is the more consistent behaviour. Given the "regression worse than unmigrated" bar, the changes are low-risk; the PR is left UNMERGED for Tate's eyeball.

## Conclusion

The consistency work is essentially DONE on the integration branch. The only genuine remaining gaps were the 3 native selects (migrated here). The dialog "gaps" were the radius disease plus correctly-classified overlays. Post-migration: `grep -rn "<select" src` = 0.
