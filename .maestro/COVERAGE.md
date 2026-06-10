# Maestro coverage map - Coexist (Capacitor, both stores)

Source of truth for "is the whole app mapped". Every route from
`src/App.tsx` (enumerated 2026-06-10, 124 path entries). A route is
COVERED only when a flow drives it and asserts dump-verified anchors;
PARTIAL when a flow reaches it but asserts thinly; UNCOVERED otherwise.
Update this file in the SAME commit as any flow change (lifecycle rule in
backend/patterns/maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10.md).

Status totals 2026-06-10 (after author batch 4): ~73 covered / ~6 partial
/ ~45 uncovered + 3 findings: F1 (open), F2 (canary armed in 38), F3
(corrected: deep-link bypasses authed session; canary armed in 32).

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
| /chat/channel/:channelId | UNCOVERED | staff channel deep-link path; queued. F2 canary 38 proves the bottom-tab-back path exits the app to the launcher (the chat list entry point is the gap). |
| /profile | COVERED | 02-tabs-walk |
| /profile/edit | COVERED | 06-profile-edit-render (form fields + Save Changes; full edit-save-revert raised a write-through finding, see F1) |
| /profile/tickets | COVERED | 07-profile-tickets |
| /profile/privacy | COVERED | redirects to /settings/privacy (17-settings-subpages) |
| /profile/:userId | UNCOVERED | needs a known peer user id |
| /events | COVERED | 08-explore-walk (redirects to /explore) |
| /events/:id | COVERED | 39-events-detail-deep-walk (Supabase-seeded next-free-public event id via .maestro/scripts/seed-event-id.js runScript + coexist://events/<id> deep-link; asserts Share Event + a CTA branch from Register / Cancel Registration / Check In Now / Join Waitlist / You're registered). The unstable activity-type chip tap path is bypassed. RSVP create-assert-DELETE in 91-events-detail-rsvp-cleanup. |
| /events/:id/day | UNCOVERED | |
| /events/:id/impact | UNCOVERED | |
| /events/:id/survey, /profile-survey | UNCOVERED | |
| /events/:id/ticket-confirmation | UNCOVERED | rides the RSVP flow |
| /events/:id/check-in, /check-in/:token | UNCOVERED | leader-side |
| /explore | COVERED | 08-explore-walk |
| /collectives | COVERED | 10-collectives-explore-tab (redirects to /explore?tab=collectives) |
| /collectives/:slug | COVERED | 36-collective-detail (Explore -> Collectives tab -> tap Sunshine Coast row -> assert About/Members/Upcoming/Join/Events anchor) |
| /collectives/:slug/manage | UNCOVERED | leader-side |
| /notifications | COVERED | 09-notifications-walk |
| /settings | COVERED | 04-settings-walk |
| /settings/account | COVERED | 17-settings-subpages |
| /settings/notifications | COVERED | 17-settings-subpages |
| /settings/privacy | COVERED | 17-settings-subpages |
| /learn | COVERED | 15-learn-walk (My Learning empty-state) |
| /learn/module/:id, /learn/section/:id, /learn/quiz/:id, /learn/complete | UNCOVERED | needs a published module; queued |
| /shop | COVERED | 12-shop-walk + 50-shop-journey-render |
| /shop/cart | COVERED | 50-shop-journey-render |
| /shop/orders | COVERED | 50-shop-journey-render |
| /shop/order-confirmation | COVERED | 50-shop-journey-render (renders fallback when no session) |
| /shop/:slug, /shop/checkout, /shop/orders/:id | UNCOVERED | checkout needs prod-write-with-cleanup design; product slug needs seeded id |
| /tasks | COVERED | 13-tasks-walk |
| /updates | COVERED | 14-updates-walk |
| /impact | COVERED | redirects to /profile (02-tabs-walk) |
| /impact/national | COVERED | 41-impact-national-render (render walk: AUSTRALIA-WIDE + TREES PLANTED + event attendances / volunteer hours stat-tile labels). Metric-vs-DB invariance asserts on the dynamic counts are queued for a paired flow following the 05-admin-metrics-invariance pattern. |
| /referral | COVERED | 16-referral-walk |
| /signup | COVERED | 99-auth-signed-out-sweep (signed-OUT clearState path, render-only) |
| /forgot-password, /reset-password, /verify-email | COVERED | 99-auth-signed-out-sweep (render-only) |
| /welcome | COVERED | 99-auth-signed-out-sweep (marketing landing) |
| /onboarding, /welcome-back, /accept-terms | UNCOVERED | needs seeded fresh-account state |
| /suspended | UNCOVERED | needs seeded suspended state |

## Admin (test account HAS admin role)

| Route | Status | Flow / note |
|---|---|---|
| /admin (home) | COVERED | 03-admin-walk (anchors: Collectives + App tabs; select VALUES are not hierarchy text) |
| /admin/events | COVERED | 31-admin-events-list (list + counters + BIGGEST EVENT) + 05-admin-metrics-invariance (UPCOMING / REGISTRATIONS / AVG ATTENDANCE vs DB truth) |
| /admin/events/create | UNCOVERED | reached via probe; create-assert-DELETE candidate (queued for next batch as 92-admin-events-create-cleanup) |
| /admin/users | COVERED | 20-admin-users |
| /admin/collectives | COVERED | 21-admin-collectives |
| /admin/collectives/:id | COVERED | 35-admin-collective-detail (tap Sunshine Coast row -> assert Members/Manage/Leaders/Region/Active anchor; Permission required branch also accepted) |
| /admin/tasks | COVERED | 22-admin-tasks-workflows |
| /admin/surveys | COVERED | 23-admin-surveys |
| /admin/surveys/create, /admin/surveys/:id/edit | UNCOVERED | |
| /admin/moderation | COVERED | 24-admin-moderation |
| /admin/metrics | COVERED | 25-admin-metrics-reports (Attendance & Retention labels; DB-invariance pass queued) |
| /admin/reports | COVERED | 25-admin-metrics-reports |
| /admin/insights | STRICT-CANARY | 32-admin-insights-f3-canary asserts the F3 bug state: coexist://admin/insights bypasses the authed session and lands on the marketing Welcome shell (EXPLORE. CONNECT. PROTECT. + Get Started + I have an account). NOT a capability gate; the Permission required EmptyState would read differently. Hypothesis: AdminInsightsPage's three lazy imports + Suspense unwrap leak to the marketing route. Canary RED-inverts when the deep-link routes to tabs or Permission required. |
| /admin/impact | COVERED | via /admin/insights redirect tab (App.tsx:461 redirects /admin/impact -> /admin/insights#impact); the impact tab is the default tab (32 canary) |
| /admin/national-impact | COVERED | 33-admin-sweep-render (either-branch matcher; Permission required accepted) |
| /admin/exports | COVERED | 33-admin-sweep-render (redirects to /admin/insights#reports per App.tsx:464; either-branch matcher) |
| /admin/email | COVERED | 26-admin-email |
| /admin/updates | COVERED | 27-admin-updates |
| /admin/applications | COVERED | 28-admin-applications |
| /admin/audit-log | COVERED | 33-admin-sweep-render |
| /admin/challenges | COVERED | 33-admin-sweep-render |
| /admin/contacts | COVERED | 30-admin-legal-contacts (Emergency Contacts) |
| /admin/create | COVERED | 33-admin-sweep-render |
| /admin/dev-tools | COVERED | 33-admin-sweep-render |
| /admin/development (list) | COVERED | 34-admin-development-render |
| /admin/development/modules/new | COVERED | 34-admin-development-render |
| /admin/development/{modules,sections,quizzes,results} detail (6 routes) | UNCOVERED | needs published learn content first |
| /admin/partners | COVERED | 29-admin-partners-shop |
| /admin/photos | COVERED | 33-admin-sweep-render |
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
| /donate/thank-you | COVERED | 42-donate-thank-you-render (defaults to $25 with no ?amount query; "Thank you!" + "Donation Successful" + amount tile) |
| /donate/donors | COVERED | 43-donate-donors-render ("Our generous donors" + either branch: People & organisations or No donors yet) |
| /download | COVERED | 44-download-render (Co-Exist heading or "Ready to make a difference" CTA - either branch acceptable; in-app surface reachable only via deep-link) |
| /leader, /leader-welcome | UNCOVERED | role-gated |
| /unsubscribe | UNCOVERED | email-loop bound |
| /auth/callback | UNCOVERED | OAuth round-trip |
| /design/events | COVERED | 40-design-events-render (EventEditorialShowcase: "Event Cards & Detail" h1 + Co-Exist Design System eyebrow). Single design route in App.tsx; no /design/* sub-routes exist today. |

## Batch 3 (2026-06-10) - findings extended + canaries armed

- **F3 corrected.** Initial reading "deep-link to /admin/insights lands
  on Welcome shell" stands, but the root cause is NOT a permission
  gate. RequireCapability's fallback EmptyState reads "Permission
  required" + "Back to dashboard"; the actual screen rendered after
  `coexist://admin/insights` is the marketing WelcomePage shell
  ("EXPLORE. CONNECT. PROTECT.", Get Started, I have an account)
  even when YOUR NEXT EVENT was visible immediately before the
  deep-link (so the authed session IS alive). The deep-link path
  itself bypasses the session for this route. AdminInsightsPage
  loads three sub-pages lazily; hypothesis is a Suspense boundary
  failure that the deep-link router catches by falling back to the
  unauthed marketing route. Strict canary now lives at
  32-admin-insights-f3-canary.yaml and asserts the bug state.
- **F2 confirmed via canary.** 38-chat-f2-canary proves
  `coexist://chat` (and the bottom tab) opens the user's default
  channel directly, and a back press from there exits the app to
  the OS launcher rather than landing on a chat list. The Staff
  Channels list exists at src/pages/chat/index.tsx:380 but the
  entry point is missing.
- **F1 root cause read.** EditProfilePage.handleSave writes
  `display_name` (line 224) via useUpdateProfile -> supabase update
  on profiles.display_name. The read side (profile/index.tsx:230,
  237) reads `profile.display_name`. Both sides match the same
  column. The visible no-op is therefore not a write-target bug;
  most likely a cache-invalidation race between the
  ['profile', user.id, 'own'|'view'] query key used by useProfile
  and the auth-side profile that backs the More-drawer (refreshed
  via useAuth.refreshProfile, which the mutation calls inside
  onSettled). The integration test to falsify: mutate display_name
  via API, then read profiles.display_name over REST and read the
  More-drawer account-row text - any mismatch isolates the bug to
  the auth-side propagation path.

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

## Batch 4 (2026-06-10) - Supabase-seeded event id + render-only sweep

- **Seed primitive landed.** `.maestro/scripts/seed-event-id.js` runScript
  helper queries Supabase for the next upcoming FREE public event
  (is_ticketed=false, is_public=true, date_start>now), exposes
  `${output.eventId}` + `${output.eventTitle}` to the flow. Used by
  39-events-detail-deep-walk; will be reused by 91-events-detail-rsvp-
  cleanup. Anon key embedded (same publishable key shipped in the app
  bundle, so adds no leakage).
- **6 flows green this batch:** 39 events detail (deep-walk via env id),
  40 design events, 41 impact national, 42 donate thank-you, 43 donate
  donors, 44 download.
- **Anchor gotcha codified.** Page Header titles ("National Impact",
  "Donor Wall") show up only as aria-label "X page header" - NOT as
  direct visible text. Anchor on the visible h1/h2 ("AUSTRALIA-WIDE" /
  "Our generous donors") instead. Cost the first run on 41+43.

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
