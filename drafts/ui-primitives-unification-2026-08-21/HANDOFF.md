# Handoff: Co-Exist UI primitives unification + fleet OSS-adoption pivot

Written 2026-08-21 for the next chat to resume cold. Read this, then the PUNCHLIST.md next to it.

## One-paragraph state
Tate lost a tab of Co-Exist UI notes; they were recaptured and turned into a prototype + rollout plan. Midway, Tate reframed the whole thing into a FLEET strategy: stop hand-rolling and ad-hoc-inline UI, adopt best-in-class OSS components and restyle them to our tokens (shadcn registry as the universal intake). That is now doctrine. The Co-Exist prototype is APPROVED and is the VISUAL / restyle target. Nothing has been built into the live repo yet. The rollout is boarded and waits on the `worker-cap-bash-ok` gate (worker dispatch is off) plus Tate's go.

## The mission
Unify Co-Exist's fragmented switchers / dropdowns / filters / tabs / modals / loading states onto ONE set of primitives, by ADOPTING open-source components (not hand-rolling) and restyling to the olive brand. Then apply the same adopt-and-restyle discipline across all projects.

## THE STRATEGIC PIVOT (most important, fleet-wide)
Doctrine: `backend/patterns/adopt-and-restyle-oss-components-no-adhoc-primitives-2026-08-21.md`.
- Do NOT build UI primitives in-house. Adopt from the shadcn registry (`npx shadcn@latest add <name-or-url>` copies restyle-able source in, you own it), restyle to project tokens.
- Ad-hoc inline UI is BANNED (Tate veto "adhoc inline things", live). Hand-rolling a primitive that exists is banned.
- Stack: shadcn/ui spine (Radix + Tailwind) for app chrome; Vaul + shadcn Dialog for sheets/modals; Sonner for toasts; cmdk for command. Showcase/marketing motion = Aceternity (DECIDED default) / Magic UI / Motion Primitives / React Bits / 21st.dev, via the registry.
- Applies to every React+Tailwind project (Co-Exist, Friend, Studio, ecodia.au, DayCrew, Chambers, wedge-sites, new apps). The wedge-new-app / wedge-site scaffolds should create components.json + the token map at stamp time.
- Grounded in transcript grep: Tate has sent shadcn (1067), radix (937), aceternity, magic ui, motion primitives, react bits, 21st.dev, sonner, cmdk, vaul, konsta.

## Co-Exist stack (probed 2026-08-21, ground truth)
- Repo: `/Users/ecodia/.code/coexist`. Current branch when this started: `coexist-explore-filter-pill-row-2026-08-21` (carries in-flight pill-row work; PR #74 unmerged).
- react ^19.2.4, vite, tailwindcss ^4.2.2, framer-motion ^12.38.0, clsx ^2.1.1, tailwind-merge ^3.5.0, lucide-react ^0.577.0.
- MISSING (so adoption is clean): no `@radix-ui/*`, no `components.json`, no `src/components/ui`.
- Tokens: `src/styles/globals.css` uses the Tailwind v4 `@theme` model. Brand olive `--color-brand/#869e62`, primary ramp 50-950 (#869e62 is primary-400, #5d7340 is primary-600), surface-0 #fff / surface-1 #f6f7f3 (page) / surface-2 #f5f5f5 / surface-3 #ebebeb, neutral ramp, semantic success/warning/error/info, radius sm .375 / md .5 / lg .75 / xl 1 / 2xl 1.25rem. Fonts: Eau Sans (400/700/900) + Montserrat fallback; Spectral = Ecodia credit only. App is LIGHT-ONLY (dark disabled). Framer Motion is the motion lib; `src/lib/admin-motion.ts` has expandCollapse/fadeUp/stagger/drawerSpring.

## Artifacts produced this session
- PROTOTYPE (approved, all Tate revisions in, CDP-verified desktop+mobile): https://claude.ai/code/artifact/7db633e6-6346-48b6-8a69-cf9396bf7b89 . Source: `drafts/ui-primitives-unification-2026-08-21/prototype.html`. This is the restyle target.
- PUNCHLIST (7 lanes + Lane 0 + strategy shift + decisions + exact file:line rollout map): `drafts/ui-primitives-unification-2026-08-21/PUNCHLIST.md`.
- LANE 0 TOKEN MAP (verified: all 13 referenced tokens resolve in globals.css): `drafts/ui-primitives-unification-2026-08-21/lane0-shadcn-token-map.css`.
- DOCTRINE: `backend/patterns/adopt-and-restyle-oss-components-no-adhoc-primitives-2026-08-21.md`.
- status_board row id `7b32785f-d2c9-48ec-b2e1-ea23ff2cc2f1` (next_action_by=tate).
- Memory: `feedback_adopt-and-restyle-oss-components-fleet-wide-no-adhoc-2026-08-21.md` (+ MEMORY.md pointer).

## DECISIONS LOCKED (Tate)
- Switcher: A+B blend matching the `search-bar` primitive. Grey surface-3 track, rounded-full, shadow-sm, white sliding pill + primary-200 ring + primary-800 label, taller active pill. Solid-olive pill only for a single high-emphasis toggle. PILL GEOMETRY: pill overlays the button box, ~4px inset, end segments fill toward the outer edge (first hugs left, last hugs right; prototype measured leftGap=1 / rightGap=1 / vertical=4).
- Multi-select: stays open until Done / outside-click / trigger (never closes per-select).
- Filter pills: more y-padding all states (~42px min-height).
- Tabs: sliding underline (shadcn Tabs). Same indicator family as the switcher.
- Expandable rows (feedback): grid-rows glide + chevron rotate + body fade (expandCollapse).
- Loading shells: shape-matched skeleton per page; fix the "not found while loading" bug (root cause `hooks/use-delayed-loading.ts`; 6 offenders listed in PUNCHLIST Lane 4).
- Floating dock: option A (slide up + fade), AnimatePresence on `admin/insights.tsx:872`.
- Admin users: unify row-click + gear to ONE modal; gear icon -> right chevron (`admin/users.tsx:1147/1177/1181`).
- Modal: adopt Vaul + shadcn Dialog; the explore event-detail sheet (BottomSheet->RouteSheet->bare Page chain) is the pattern to preserve on top.
- Showcase gallery: Aceternity (default), shadcn for app chrome.

## NEXT ACTIONS (in order) - the resume path
1. Gate: confirm `worker-cap-bash-ok` is cleared (Tate) so a worker can be dispatched for the heavy code work. If still gated and Tate wants proof first, run Lane 0 as a local PoC on the conductor in an isolated worktree (git worktree add) so the live repo is untouched.
2. LANE 0 in coexist: `npx shadcn@latest init` (Vite guide), paste `lane0-shadcn-token-map.css` into `src/styles/globals.css`, then `npx shadcn@latest add tabs dropdown-menu select dialog popover command sonner` + `npm i vaul`. Verify Node >=22 (Capacitor CLI needs it).
3. Restyle each adopted primitive to the prototype spec (switcher geometry, multi-select keep-open, pill padding, tabs underline, modal = Vaul bottom sheet + shadcn Dialog desktop).
4. Migrate surfaces per PUNCHLIST lanes 1-7 (exact file:line there). Replace the existing `SegmentedControl`/`TabBar`/`Dropdown`/`BottomSheet` with the restyled shadcn versions, KEEP the same export names so callers do not churn.
5. Fix loading-shell offenders (Lane 4, 6 files) + admin-users modal unify (Lane 5) + floating-dock animation (Lane 6).
6. OWED artifact: PreToolUse warn hook flagging a hand-rolled primitive (`role="dialog"`+`fixed inset-0`, inline segmented control) when the repo has `components.json`.
7. VERIFY every surface: CDP screenshot against the DEPLOYED url (not localhost), confirm the change shipped and looks right. shadcn-in-olive needs an eyes-on-pixels proof (not just a token grep).

## Blockers
- `worker-cap-bash-ok` gate OFF -> worker dispatch for the code rollout is blocked. This is Tate's to clear.
- Tate final confirm on the OSS approach + Aceternity (already recommended decisively).

## Unrelated open item in this session's inbox (do not lose)
Worker 849e2a55 escalated: the `approval_queue` re-mirror-block fix (commit f9d05fee) is confirmed correct read-only but NOT integrated/deployed (deployed file still unfixed, f9d05fee not in main). Blocked by the SAME worker-ceiling gate + expired ecodia-supabase MCP token. Full brief in inbox msg 593d5426. Needs a focused turn once worker-cap clears; unrelated to the UI work.
