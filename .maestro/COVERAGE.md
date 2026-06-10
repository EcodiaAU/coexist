# Maestro coverage map - Coexist (Capacitor, both stores)

Source of truth for "is the whole app mapped". Every route from
`src/App.tsx` (enumerated 2026-06-10, 124 path entries). A route is
COVERED only when a flow drives it and asserts dump-verified anchors;
PARTIAL when a flow reaches it but asserts thinly; UNCOVERED otherwise.
Update this file in the SAME commit as any flow change (lifecycle rule in
backend/patterns/maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10.md).

Status totals 2026-06-10 (after author batch 2): 47 covered / 6 partial
/ ~71 uncovered + 3 findings raised this session (see bottom).

Deep-link primitive (2026-06-10 unlock): `coexist://<path>` opens the
native intent and lands on the routed page reliably, including admin
sub-routes. Most new flows lean on this rather than tab-and-drawer
chains, so coverage payoff per flow is high.

## Customer core (the public-push gate set)

| Route | Status | Flow / note |
|---|---|---|
| / (authed home) | COVERED | 01-signin-authed-feed |
| /login | COVERED | 01 conditional block |
| / cold start | COVERED | 90-cold-start-render (strict canary, bug 1b1e718d) |
| /chat | COVERED | 11-chat-channel-open (chat-tab lands in default channel; STAFF CHANNELS list reached via the back-from-tab path, see finding F2) |
| /chat/:collectiveId | COVERED | 11 (Sunshine Coast = member's default collective room) |
| /chat/channel/:channelId | UNCOVERED | staff channel deep-link path; queued |
| /profile | COVERED | 02-tabs-walk |
| /profile/edit | COVERED | 06-profile-edit-render (form fields + Save Changes; full edit-save-revert raised a write-through finding, see F1) |
| /profile/tickets | COVERED | 07-profile-tickets |
| /profile/privacy | COVERED | redirects to /settings/privacy (17-settings-subpages) |
| /profile/:userId | UNCOVERED | needs a known peer user id |
| /events | COVERED | 08-explore-walk (redirects to /explore) |
| /events/:id | UNCOVERED | PRIORITY: detail + RSVP create-assert-DELETE (prod-write-with-cleanup) queued for batch 3 |
| /events/:id/day | UNCOVERED | |
| /events/:id/impact | UNCOVERED | |
| /events/:id/survey, /profile-survey | UNCOVERED | |
| /events/:id/ticket-confirmation | UNCOVERED | rides the RSVP flow |
| /events/:id/check-in, /check-in/:token | UNCOVERED | leader-side |
| /explore | COVERED | 08-explore-walk |
| /collectives | COVERED | 10-collectives-explore-tab (redirects to /explore?tab=collectives) |
| /collectives/:slug | UNCOVERED | needs a tap from explore list; queued |
| /collectives/:slug/manage | UNCOVERED | leader-side |
| /notifications | COVERED | 09-notifications-walk |
| /settings | COVERED | 04-settings-walk |
| /settings/account | COVERED | 17-settings-subpages |
| /settings/notifications | COVERED | 17-settings-subpages |
| /settings/privacy | COVERED | 17-settings-subpages |
| /learn | COVERED | 15-learn-walk (My Learning empty-state) |
| /learn/module/:id, /learn/section/:id, /learn/quiz/:id, /learn/complete | UNCOVERED | needs a published module; queued |
| /shop | COVERED | 12-shop-walk |
| /shop/:slug, /shop/cart, /shop/checkout, /shop/order-confirmation, /shop/orders, /shop/orders/:id | UNCOVERED | checkout needs prod-write-with-cleanup design |
| /tasks | COVERED | 13-tasks-walk |
| /updates | COVERED | 14-updates-walk |
| /impact | COVERED | redirects to /profile (02-tabs-walk) |
| /impact/national | UNCOVERED | metric surface: DB-invariance asserts required |
| /referral | COVERED | 16-referral-walk |
| /signup | UNCOVERED | needs create-assert-DELETE account design |
| /forgot-password, /reset-password, /verify-email | UNCOVERED | email-loop bound; assert form render at minimum |
| /onboarding, /welcome, /welcome-back, /accept-terms | UNCOVERED | fresh-account path |
| /suspended | UNCOVERED | needs seeded state |

## Admin (test account HAS admin role)

| Route | Status | Flow / note |
|---|---|---|
| /admin (home) | COVERED | 03-admin-walk (anchors: Collectives + App tabs; select VALUES are not hierarchy text) |
| /admin/events | COVERED | 31-admin-events-list (list + counters + BIGGEST EVENT) + 05-admin-metrics-invariance (UPCOMING / REGISTRATIONS / AVG ATTENDANCE vs DB truth) |
| /admin/events/create | UNCOVERED | reached via probe; create-assert-DELETE candidate |
| /admin/users | COVERED | 20-admin-users |
| /admin/collectives | COVERED | 21-admin-collectives |
| /admin/collectives/:id | UNCOVERED | tap from list |
| /admin/tasks | COVERED | 22-admin-tasks-workflows |
| /admin/surveys | COVERED | 23-admin-surveys |
| /admin/surveys/create, /admin/surveys/:id/edit | UNCOVERED | |
| /admin/moderation | COVERED | 24-admin-moderation |
| /admin/metrics | COVERED | 25-admin-metrics-reports (Attendance & Retention labels; DB-invariance pass queued) |
| /admin/reports | COVERED | 25-admin-metrics-reports |
| /admin/insights | UNCOVERED | FINDING F3: deep-link route lands on Welcome (signed-out shell). Reproduced 2026-06-10. Queued for investigation. |
| /admin/impact | UNCOVERED | |
| /admin/national-impact | UNCOVERED | |
| /admin/exports | UNCOVERED | |
| /admin/email | COVERED | 26-admin-email |
| /admin/updates | COVERED | 27-admin-updates |
| /admin/applications | COVERED | 28-admin-applications |
| /admin/audit-log | UNCOVERED | |
| /admin/challenges | UNCOVERED | |
| /admin/contacts | COVERED | 30-admin-legal-contacts (Emergency Contacts) |
| /admin/create | UNCOVERED | |
| /admin/dev-tools | UNCOVERED | |
| /admin/development/* (modules, quizzes, sections, results: 8 routes) | UNCOVERED | needs published learn content first |
| /admin/partners | COVERED | 29-admin-partners-shop |
| /admin/photos | UNCOVERED | |
| /admin/shop | COVERED | 29-admin-partners-shop (Merch & Store) |
| /admin/legal-pages | COVERED | 30-admin-legal-contacts (Organisational Policies) |

## Auxiliary / legal / marketing (render-only)

| Route | Status | Flow |
|---|---|---|
| /about | COVERED | 18-aux-render-sweep |
| /contact | COVERED | 18-aux-render-sweep |
| /partners | COVERED | 18-aux-render-sweep |
| /leadership | COVERED | 18-aux-render-sweep |
| /lead-a-collective | COVERED | 18-aux-render-sweep |
| /donate | COVERED | 18-aux-render-sweep |
| /privacy | COVERED | 18-aux-render-sweep |
| /terms | COVERED | 18-aux-render-sweep |
| /cookies | COVERED | 18-aux-render-sweep |
| /accessibility | COVERED | 18-aux-render-sweep |
| /disclaimer | COVERED | 18-aux-render-sweep |
| /data-policy | COVERED | 18-aux-render-sweep |
| /data-deletion | COVERED | 18-aux-render-sweep |
| /account-deletion | COVERED | 18-aux-render-sweep |
| /donate/thank-you, /donate/donors | UNCOVERED | post-donate state |
| /download | UNCOVERED | |
| /leader, /leader-welcome | UNCOVERED | role-gated |
| /unsubscribe | UNCOVERED | email-loop bound |
| /auth/callback | UNCOVERED | OAuth round-trip |
| /design/events, /design/* | UNCOVERED | design tooling, low priority |

## Findings raised in batch 2 (2026-06-10)

- **F1 - Profile -> Edit Profile Display Name round-trip looks like a no-op.**
  Save Changes button tap completes and the profile screen rehydrates,
  but the new Display Name does not appear on the profile h1 or in the
  More-drawer account row. Either the write isn't persisting or the read
  path uses a different column (first_name vs display_name). Worth a
  read-side trace before re-arming the edit-revert flow.
- **F2 - Chat bottom-tab opens the default channel directly and the back
  press from there goes Home, not to the chat list.** This is fine UX
  but means /chat (list) needs an alternate entry. Likely the chat list
  page is reachable from a leave-channel route or a drawer entry we
  haven't found yet; deep-link `coexist://chat` also lands in the
  channel. The STAFF CHANNELS list does exist (probe screenshot at
  /tmp/probe-chat.png from this session) so the route is wired; the
  entry point is the gap.
- **F3 - `coexist://admin/insights` lands on the signed-out Welcome
  screen.** Reproduced twice in this session, with session preserved
  for the next deep-link (/admin/events showed authed admin UI right
  after). Either a route guard returns the Welcome component when the
  insights surface errors at first paint (white-screen masked by the
  redirect), or the page imports throw and the ErrorBoundary's fallback
  is the Welcome shell. Needs a code-side investigation.

## Rules that bind authoring here

- androidWebViewHierarchy: devtools (Capacitor).
- Anchors from dumps/screenshots only; full-string regex; select VALUES never anchor.
- Prefer `openLink: "coexist://path"` for fast surface navigation (works for both customer and admin routes); use UI taps when the journey matters (auth, tab nav, form submit).
- Prod writes allowed ONLY as create -> assert -> DELETE -> assert-gone (Tate 2026-06-10); cleanup failure is itself a finding.
- State-mutating flows get 90+ prefixes.
- Creds env-injected (MAESTRO_CX_EMAIL / MAESTRO_CX_PASSWORD).
- `hideKeyboard` on Android Capacitor presses back and CAN navigate the
  router off the current screen. Prefer `scrollUntilVisible` to bring
  the next anchor into view, or tap a non-input area.
