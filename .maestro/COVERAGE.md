# Maestro coverage map - Coexist (Capacitor, both stores)

Source of truth for "is the whole app mapped". Every route from
`src/App.tsx` (enumerated 2026-06-10, 124 path entries). A route is
COVERED only when a flow drives it and asserts dump-verified anchors;
PARTIAL when a flow reaches it but asserts thinly; UNCOVERED otherwise.
Update this file in the SAME commit as any flow change (lifecycle rule in
backend/patterns/maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10.md).

Status totals 2026-06-11 (after author batch 9): ~89 authored covered + 0
flows authored-but-unverifiable / ~5 partial / 0
BLOCKED-by-F4 (F4 resolver fix shipped 2026-06-11) /
0 BLOCKED-by-F6 (F6 RESOLVED 2026-06-11 - corrupted pnpm node_modules, not
a code regression; 47/48/49/58 verified GREEN this batch) /
~10 BLOCKED-substrate /
~13 uncovered + 4 open findings: F2 (canary armed in 38), F3 (corrected:
deep-link bypasses authed session; canary armed in 32), F4 (deep-link
resolver fix SHIPPED in batch 8 - src/hooks/use-deep-link.ts now forwards
the third path segment for both events and collectives branches), F5
(deep-link /shop/cart from /shop/checkout trips an ErrorBoundary,
reproducible - new in batch 6). F6 CLOSED (Batch 8 finding reclassified
ENVIRONMENTAL, not a code regression - see Batch 8 + Batch 9 sections
below). F1 reclassified FALSIFIED by 93-f1-display-name-cache-probe -
the sidebar tracks the latest display_name across both passes and
post-cleanup (see batch 4 notes). Batch 7 reclassified 10 rows from
UNCOVERED to BLOCKED-substrate after Supabase probes proved the gating
state (zero `dev_modules`, zero own-account `merch_orders`,
icon-only/aria-label-only collective-manage affordance, F4 on every
event sub-page including /check-in - see batch 7 notes).

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
| /chat/channel/:channelId | COVERED | 51-chat-channel-deep-link-render (seeds an authed `chat_channel_members` row via .maestro/scripts/seed-channel-id.js + auth-password REST, deep-links coexist://chat/channel/<id>; anchor: dynamic channel.name as the Header title because chat-room.tsx:807-810 uses cleanChannelName(channel.name) when isChannel=true). Closes the F2 entry-point gap from the deep-link side; the in-app affordance gap stands. |
| /profile | COVERED | 02-tabs-walk |
| /profile/edit | COVERED | 06-profile-edit-render (form fields + Save Changes) + 93-f1-display-name-cache-probe (two-pass display_name mutation + cleanup; sidebar propagation verified) |
| /profile/tickets | COVERED | 07-profile-tickets |
| /profile/privacy | COVERED | redirects to /settings/privacy (17-settings-subpages) |
| /profile/:userId | COVERED | 52-view-profile-deep-link-render (seeds a non-self profile id with display_name set via .maestro/scripts/seed-peer-user-id.js, deep-links coexist://profile/<id>; anchor: the peer's display_name appears as the Header title at view-profile.tsx:150). |
| /events | COVERED | 08-explore-walk (redirects to /explore) |
| /events/:id | COVERED | 39-events-detail-deep-walk (Supabase-seeded next-free-public event id via .maestro/scripts/seed-event-id.js runScript + coexist://events/<id> deep-link; asserts Share Event + a CTA branch from Register / Cancel Registration / Check In Now / Join Waitlist / You're registered). The unstable activity-type chip tap path is bypassed. RSVP create-assert-DELETE in 91-events-detail-rsvp-cleanup. |
| /events/:id/day | COVERED | 45-events-detail-day-render (LEADER ACTIONS rail tap from event detail - the deep-link prefix workaround for F4. Anchor: "Attendees" tab label visible only on the day-of dashboard). |
| /events/:id/impact | COVERED | 46-events-detail-log-impact-render (LEADER ACTIONS rail tap from event detail. Anchor: "Volunteer Hours" + "Participants" section labels, since the header text only renders as aria-label "Log Impact page header" per the batch 4 anchor gotcha). |
| /events/:id/survey | COVERED | 47-events-detail-survey-render (deep-links to /events/<id>/survey, asserts "Survey not available" EmptyState + "Back to Event" - the no-attendance branch at post-event-survey.tsx:241). Verified GREEN batch 9 post-F6 fix. Substrate unblock A (seed past event with attendance.status='attended') queued for full-flow coverage. |
| /events/:id/profile-survey | COVERED | 48-events-detail-profile-survey-render (deep-links /events/<id>/profile-survey, asserts "Welcome to your first event" / "Quick Profile Setup" / "Your Details" + Save Details / Skip for now footer). Verified GREEN batch 9 post-F6 fix. |
| /events/:id/ticket-confirmation | BLOCKED-paid-stripe | F4 fix SHIPPED + F6 RESOLVED 2026-06-11. Route still rides PAID ticket purchase only (free RSVPs do not create ticket rows per batch 4). Unblock B (deep-link resolver) is done; F6 is closed; Unblock A (paid Stripe checkout end-to-end with cleanup) is the only remaining blocker. |
| /events/:id/check-in | COVERED | 49-events-detail-check-in-render (deep-links /events/<id>/check-in, asserts "Enter Check-In Code" idle state OR Check-in Failed / Already Checked In either-branch). Verified GREEN batch 9 post-F6 fix. The SHEET-only in-app affordances + GPS-gated proximity banner + admin-debug button remain not-stable-test-surfaces, so the deep-link is the canonical entry. |
| /check-in/:token | BLOCKED-substrate | external QR scan only. The token routes to /Users/ecodia/.code/coexist/src/pages/public/check-in.tsx via `https://app.coexist.au/check-in/<token>` (event-day.tsx:982). No in-app entry point; reaching it from the test session requires a deep-link with a real public_check_in_token off a published event with public_check_in_enabled=true. Unblock: seed event with public_check_in_enabled and openLink the https URL. |
| /explore | COVERED | 08-explore-walk |
| /collectives | COVERED | 10-collectives-explore-tab (redirects to /explore?tab=collectives) |
| /collectives/:slug | COVERED | 36-collective-detail (Explore -> Collectives tab -> tap Sunshine Coast row -> assert About/Members/Upcoming/Join/Events anchor) |
| /collectives/:slug/manage | COVERED | 58-collective-manage-deep-link-render (deep-links coexist://collectives/sunshine-coast/manage, asserts either-branch - Access denied EmptyState since code@ is global admin but not Sunshine Coast leader, OR Manage Collective if the canManage gate flips). Verified GREEN batch 9 post-F6 fix. The aria-label icon-only affordance gap is a P2 concern - the deep-link is the canonical entry. |
| /notifications | COVERED | 09-notifications-walk |
| /settings | COVERED | 04-settings-walk |
| /settings/account | COVERED | 17-settings-subpages |
| /settings/notifications | COVERED | 17-settings-subpages |
| /settings/privacy | COVERED | 17-settings-subpages |
| /learn | COVERED | 15-learn-walk (My Learning empty-state) |
| /learn/module/:id, /learn/section/:id, /learn/quiz/:id, /learn/complete | BLOCKED-substrate | batch 7 anon+authed probe: `dev_modules`, `dev_sections`, `dev_quizzes` all return zero rows (PGRST205 redirected from `learn_modules` / `learning_modules` / `modules` hints to `public.dev_modules`). Without a published module the routes either bounce to /learn or render an EmptyState that has no path-discriminating anchor. Unblock: seed a dev_module + dev_section + dev_quiz triple (admin can INSERT via authed REST), or use /admin/development/modules/new to author one through the UI then reuse the id across /learn/module/:id and /learn/section/:id flows. |
| /shop | COVERED | 12-shop-walk + 50-shop-journey-render |
| /shop/cart | COVERED | 50-shop-journey-render |
| /shop/orders | COVERED | 50-shop-journey-render |
| /shop/order-confirmation | COVERED | 50-shop-journey-render (renders fallback when no session) |
| /shop/:slug | COVERED | 53-shop-product-detail-render (seeds an active merch_products row via .maestro/scripts/seed-product-slug.js + authed REST; merch_products RLS is TO authenticated so the anon key returns zero rows; anchor: product.name as the h1 at product-detail.tsx:540). |
| /shop/checkout | COVERED | 94-shop-checkout-with-cart-cleanup (PROD-WRITE: seed product, tap Cart on /shop/<slug>, deep-link /shop/checkout, assert "Secure checkout" hero + "Total" footer; cleanup relaunches the app then deep-links /shop/cart and taps aria-label "Remove <productName>". Cleanup must restart because the in-session deep-link /shop/checkout -> /shop/cart trips the ErrorBoundary, see F5). |
| /shop/orders/:id | BLOCKED-substrate | batch 7 authed probe: code@ecodia.au user_id 4cc11fa1-8aec-4a92-928d-3c8a304dd4db has ZERO `merch_orders` rows (the three live orders in the table belong to user 552763c5 - not the test session). useMyOrders returns empty so the /shop/orders list shows the empty-state and there is no row to tap into /shop/orders/:id. Unblock A: seed a merch_orders row owned by the test user (items array + shipping address + status='pending' is enough to render the order detail Header "Order #<id slice>" anchor). Unblock B: drive the existing 94-shop-checkout flow further to land on order-confirmation, capture the created order id, then read /shop/orders/<id> with cleanup. |
| /tasks | COVERED | 13-tasks-walk |
| /updates | COVERED | 14-updates-walk |
| /impact | COVERED | redirects to /profile (02-tabs-walk) |
| /impact/national | COVERED | 41-impact-national-render (render walk: AUSTRALIA-WIDE + TREES PLANTED + event attendances / volunteer hours stat-tile labels). Metric-vs-DB invariance asserts on the dynamic counts are queued for a paired flow following the 05-admin-metrics-invariance pattern. |
| /referral | COVERED | 16-referral-walk |
| /signup | COVERED | 99-auth-signed-out-sweep (signed-OUT clearState path, render-only) |
| /forgot-password, /reset-password, /verify-email | COVERED | 99-auth-signed-out-sweep (render-only) |
| /welcome | COVERED | 99-auth-signed-out-sweep (marketing landing) |
| /onboarding, /welcome-back, /accept-terms | BLOCKED-substrate | the test account is past these gates (onboarded + terms accepted long ago). Reaching them requires either a fresh auth.users row that has not seen the onboarding wizard (heavy seed: auth.users INSERT is service-role only, the test session cannot drive it) or temporarily mutating profiles.onboarding_completed=false / accepted_terms_at=null on the existing session user with cleanup - which logs the running session out mid-flow. Unblock A: spin up a sibling test account `code+onboarding@ecodia.au` reserved for these flows (substrate prep, not in-flow). Unblock B: register `/onboarding` etc. as fixed render targets driven by a service-role-backed seed harness outside Maestro. |
| /suspended | BLOCKED-substrate | requires profiles.suspended_at != null on the test session, which would lock the test account out of every other flow that runs after this one. Same dual-account unblock as /onboarding. |

## Admin (test account HAS admin role)

| Route | Status | Flow / note |
|---|---|---|
| /admin (home) | COVERED | 03-admin-walk (anchors: Collectives + App tabs; select VALUES are not hierarchy text) |
| /admin/events | COVERED | 31-admin-events-list (list + counters + BIGGEST EVENT) + 05-admin-metrics-invariance (UPCOMING / REGISTRATIONS / AVG ATTENDANCE vs DB truth). 2026-06-11 hardening: 05 was a false-green generator (no prehook existed; empty MAESTRO_EXPECT_* made the asserts vacuous, and its All Time anchor was the select-value trap, red-herringed run 115704Z). Now fails CLOSED on empty expectations; real prehook at ecodiaos backend/scripts/app-tests/prehooks/coexist.sh queries AS the test user (RLS-aligned). WATCH: prehook live truth 2026-06-11 = 24/745/17 vs the 2026-06-10 on-screen harvest 24/735/2; avg-attendance 2-vs-17 is unexplained until the next on-device run discriminates data-drift vs render bug |
| /admin/events/create | COVERED | 57-admin-events-create-render (deep-link coexist://admin/events/create renders the form under AdminLayout; anchor: "New Event" h1 + Publish Event / Save as Draft footer buttons + "Select Collectives" required-section heading. Header text itself is aria-label-only per the batch 4 codification - the visible h1 reads "New Event" not "Create Event") + 92-admin-events-create-cleanup (PROD-WRITE: authed-REST INSERT into events with sentinel title MAESTRO-92-PROBE-<ts> via .maestro/scripts/seed-admin-event.js -> deep-link /admin/events upcoming list -> scrollUntilVisible + assertVisible the sentinel title -> authed-REST DELETE by title prefix via .maestro/scripts/cleanup-admin-event.js -> stopApp + relaunch to clear the scrolled state -> deep-link /admin/events -> assertNotVisible the sentinel. Cleanup script also self-heals orphans on entry. Pattern: 91-events-detail-rsvp-cleanup applied to the admin substrate write path). |
| /admin/users | COVERED | 20-admin-users |
| /admin/collectives | COVERED | 21-admin-collectives |
| /admin/collectives/:id | COVERED | 35-admin-collective-detail (tap Sunshine Coast row -> assert Members/Manage/Leaders/Region/Active anchor; Permission required branch also accepted) |
| /admin/tasks | COVERED | 22-admin-tasks-workflows |
| /admin/surveys | COVERED | 23-admin-surveys |
| /admin/surveys/create | COVERED | 55-admin-surveys-create-render (deep-link, anchor: "Create Survey" h1 + "Details" + "Survey Purpose" section headers - the form's "Survey Title" label renders with a trailing asterisk so full-string-regex matchers anchor on the section headers instead). |
| /admin/surveys/:id/edit | COVERED | 56-admin-surveys-edit-render (seeds an existing surveys row via .maestro/scripts/seed-survey-id.js + authed REST; deep-link coexist://admin/surveys/<id>/edit; anchor: "Edit Survey" h1 + "Details" + "Save Changes" footer button). |
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
| /admin/development/{modules,sections,quizzes,results} detail (6 routes) | BLOCKED-substrate | same `dev_modules` / `dev_sections` / `dev_quizzes` zero-row gate as /learn (batch 7 probe). Unblock A: drive /admin/development/modules/new to author a real module through the UI then capture the id for the detail flows. Unblock B: authed-REST seed `dev_modules` row directly (admin RLS allows it) - cheaper than the UI authoring round-trip. |
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

## Batch 4 (2026-06-10) - Supabase-seeded event id + render sweep + F1 falsified + 91 RSVP cleanup

- **Seed primitive landed.** `.maestro/scripts/seed-event-id.js` runScript
  helper queries Supabase for the next upcoming FREE, non-external,
  public event (is_ticketed=false, external_registration_url=is.null,
  is_public=true, date_start>now), exposes `${output.eventId}` and
  `${output.eventTitle}` to the flow. Used by 39 + 91. Anon key
  embedded (same publishable key shipped in the app bundle, so adds
  no leakage; RLS gates everything on the server).
- **8 flows green this batch:** 39 events detail (deep-walk via env id),
  40 design events, 41 impact national, 42 donate thank-you, 43 donate
  donors, 44 download, 91 events-detail RSVP create-assert-DELETE
  (prod-write, full UI cleanup), 93 F1 display_name cache-probe
  (two-pass mutation + cleanup, all asserts green).
- **F1 falsified.** 93-f1-display-name-cache-probe ran two passes of
  /profile/edit Save Changes with markers Ecodia-A and Ecodia-B and
  screenshots of the More drawer after each. All three sidebar
  screenshots show the freshly-mutated value: pass1 = Ecodia-A,
  pass2 = Ecodia-B, post-cleanup = Ecodia. The auth-side cached
  profile that backs the sidebar IS refreshing on Save. The 2026-06-10
  finding (write-through no-op on display_name) does not reproduce on
  the coexist_aosp emulator with the current build; reclassified as
  resolved-or-unreproducible.
- **Free-RSVP != ticket** (anchor learning from 91): /profile/tickets
  shows the PAID ticket surface only; free RSVPs to non-ticketed
  events do not generate rows there (empty-state copy reads "When you
  PURCHASE tickets for events, they'll appear here"). The create-side
  proof for a free RSVP has to come from the event-detail page itself
  (Cancel Registration replaces Register for Event), not from a
  tickets-list check. /profile/tickets stays covered by 07.
- **Anchor gotcha codified.** Page Header titles ("National Impact",
  "Donor Wall") show up only as aria-label "X page header" - NOT as
  direct visible text. Anchor on the visible h1/h2 ("AUSTRALIA-WIDE" /
  "Our generous donors") instead. Cost the first run on 41+43.
- **Tab-tap regex matched the wrong surface** (authoring trap on 93):
  tapOn ".*Profile.*" from a More-drawer-back state landed on
  /admin/development. openLink "coexist://profile/edit" is the safer
  cross-phase nav primitive.

## Batch 5 (2026-06-11) - event sub-pages + F4 deep-link resolver finding

- **F4 new finding.** `src/hooks/use-deep-link.ts:18-37` resolves
  custom-scheme paths by reading only `[first, second]` of the URL
  segments. For `case 'events'` (line 25-26) the resolver returns
  `/events/${second || ''}` regardless of any third+ segment. So
  `coexist://events/<id>/day` (and /impact, /survey, /profile-survey,
  /ticket-confirmation, /check-in, /edit) silently lands on
  `/events/<id>`. The bug surfaced during batch 5: 45 + 46 false-passed
  initially because the LEADER ACTIONS rail on event-detail also
  contains "Event Day" and "Log Impact" button labels, so the
  assertion matched the wrong page. Same constraint applies to the
  `case 'collectives'` branch (line 27-28: `/collectives/<id>` only,
  no `<id>/manage`). One-line fix would be:
  `return third ? '/events/' + second + '/' + third : '/events/' + (second || '')`.
  Until the fix lands, sub-page routes have to be reached by UI tap
  from the parent surface (canonical entry path for upcoming-event
  leaders anyway).
- **2 flows green this batch:** 45 events-detail-day-render (LEADER
  ACTIONS scroll + tap "Event Day" -> "Attendees" tab label assert),
  46 events-detail-log-impact-render (LEADER ACTIONS scroll + tap
  "Log Impact" -> "Volunteer Hours" + "Participants" assert; header
  text is aria-label-only per the batch 4 codification).
- **3 routes marked BLOCKED-F4:** /events/:id/survey,
  /events/:id/profile-survey, /events/:id/ticket-confirmation. Each
  row in the table above carries the exact unblock pathway (extend
  the deep-link resolver, or build the substrate seed to satisfy
  the page-level gate).

## Batch 7 (2026-06-11) - admin events create-cleanup + BLOCKED-substrate triage

- **1 new flow green this batch:**
  - 92-admin-events-create-cleanup (PROD-WRITE: substrate INSERT + UI
    assert in /admin/events upcoming list + substrate DELETE + assert-
    gone after a stopApp+relaunch reset. The seed-admin-event.js +
    cleanup-admin-event.js pair are the canonical admin-write template
    for follow-on flows. 9x prefix because it mutates events).
- **Same-route post-mutation assertion needs an app restart.** After
  scrollUntilVisible drove the list deep enough to find the sentinel
  title, the second deep-link to `/admin/events` re-rendered against
  the still-scrolled state - the UPCOMING anchor was off-screen and
  the assertion failed despite the underlying data being clean. Fix:
  `stopApp` + `launchApp` between the mutation and the assert-gone
  step rather than relying on the same-route deep-link to remount the
  list. Codified in 92.
- **10 routes reclassified UNCOVERED -> BLOCKED-substrate** after
  Supabase probes (anon + authed-as-code@) proved the gating state.
  Probes used the auth-password REST flow with the in-bundle anon key.
  - **/learn/module + /learn/section + /learn/quiz + /learn/complete +
    /admin/development sub-routes:** `dev_modules`, `dev_sections`,
    `dev_quizzes` all return zero rows. PostgREST hints corrected the
    code-side assumption (table names ended up dev_*, NOT learn_*).
    Unblock pathways recorded per row.
  - **/shop/orders/:id:** code@ecodia.au has zero `merch_orders`. The
    three live orders in the table belong to a different user. Two
    unblock pathways recorded (seed an order; drive 94 further to
    capture a real one).
  - **/onboarding + /welcome-back + /accept-terms + /suspended:**
    reaching them mutates the test session's profiles row in ways
    that lock it out of every other batch. Unblock is a sibling test
    account dedicated to fresh-account flows.
  - **/collectives/:slug/manage:** dual gate. The in-app affordance
    is an icon-only Settings button with aria-label "Manage collective"
    and no visible text (anchor-gotcha hard rule). The deep-link is
    F4-stripped (collectives branch reads only `/<id>`, no `/<id>/manage`).
    Unblock A: extend F4 resolver. Unblock B: aria-id tap if the
    devtools hierarchy exposes it.
- **/events/:id/check-in reclassified UNCOVERED -> BLOCKED-F4.** Triple
  gate found by source read. (a) Deep-link is F4-stripped. (b) The two
  visible "check in" affordances on event-detail open SHEETS, not
  navigations: "Check In Now" -> setShowCheckInSheet (event-detail.tsx
  :728), "Check-in Code" -> setShowQrSheet (line 1173). Neither hits
  the /events/:id/check-in route. (c) The only in-app navigations are
  proximity-check-in-banner.tsx:78 (GPS-gated; not stable test
  surface) and /admin/dev-tools:1297 (admin debug button; not part of
  a normal user journey). Unblock A: F4 resolver fix. Unblock B: stub
  the proximity trigger for the test session.
- **/check-in/:token reclassified UNCOVERED -> BLOCKED-substrate.** The
  route is the QR-scan public landing only (event-day.tsx:982 builds
  the `https://app.coexist.au/check-in/<token>` URL embedded in the QR
  code). Reaching it requires an event with `public_check_in_enabled=
  true` and a real `public_check_in_token`. Unblock: seed those two
  fields then openLink the https URL.
- **Net coverage delta:** +1 covered (92), 10 routes reclassified to
  BLOCKED-substrate, 2 routes reclassified to BLOCKED-F4 (check-in
  and check-in/:token), no false-positive UNCOVERED rows remain.
- **Anchor reuse confirmed.** `${output.eventTitle}` survives a second
  runScript call (cleanup-admin-event.js) without being clobbered -
  Maestro only adds/updates output keys, it does not reset the dict.
  This is the assumption every multi-script flow now depends on.

## Batch 6 (2026-06-11) - chat-channel + view-profile + shop + admin sub-create routes

- **F5 new finding.** Deep-link to /shop/cart from a session that just
  navigated /shop/<slug> -> /shop/checkout reproducibly trips the
  ErrorBoundary "Something went wrong" fallback (one-shot screenshot
  reproducible during 94 cleanup authoring). Cold-launch -> deep-link
  /shop/cart renders normally. Likely a Stripe / reservation effect
  cleanup that throws when the route remounts mid-checkout-state.
  Workaround codified in 94: `stopApp` + `launchApp` before the cart
  deep-link, then remove via aria-label tap. Root-cause investigation
  queued (this is a finding, not a fix - same shape as F3 was at first
  observation).
- **3 new seed scripts.** .maestro/scripts/seed-channel-id.js,
  seed-peer-user-id.js, seed-survey-id.js, seed-product-slug.js. All
  four use the auth-password REST flow (POST /auth/v1/token with the
  env-injected MAESTRO_CX_EMAIL/PASSWORD, then GET against a single
  table with the access_token in the Authorization header). The
  channels/profiles/surveys/merch_products tables all have
  RLS-to-authenticated policies, so the anon-only seed-event-id
  approach does not work here. The channels table was a 2-step probe:
  the migration uses `chat_channel_members`, NOT the
  `staff_channel_memberships` view name the PostgREST 404 hint pointed
  at; codified in the seed script comment.
- **7 flows green this batch:**
  - 51 chat-channel-deep-link-render (closes F2 from the deep-link side)
  - 52 view-profile-deep-link-render
  - 53 shop-product-detail-render
  - 55 admin-surveys-create-render
  - 56 admin-surveys-edit-render
  - 57 admin-events-create-render
  - 94 shop-checkout-with-cart-cleanup (prod-write: cart-add +
    reservation, full UI cleanup, F5 documented as the cleanup pattern)
- **Anchor gotcha doubled down.** Input labels in this codebase
  render as "<Label>*" with a trailing asterisk on required fields
  (e.g. "Survey Title*", "Event Title*"). Maestro's `visible:`
  matcher treats the string as full-string-regex per the HARD RULES,
  so `visible: "Survey Title"` does not match `Survey Title*`.
  Anchor on the section header text (Details, Survey Purpose) or on
  the visible button labels instead.
- **Co-Exist Australia Stickers** is the currently-active product the
  seed-product-slug.js picks (sort by created_at desc, limit 1). If
  that product is hidden / sold out the seed silently picks the next
  newest; if the entire catalog is empty 53 and 94 fail with an
  explicit error.

## Batch 8 (2026-06-11) - F4 resolver fix SHIPPED + 4 flows authored + F6 new

- **F4 SHIPPED.** `src/hooks/use-deep-link.ts:25-32` now forwards the
  third path segment for `case 'events'` and `case 'collectives'`. One
  diff, no behaviour change for existing single-segment deep-links
  (`coexist://events/<id>` still maps to `/events/<id>`). New deep-links
  `coexist://events/<id>/{day,impact,survey,profile-survey,check-in,
  ticket-confirmation,edit}` and `coexist://collectives/<id>/manage`
  now resolve to their intended sub-routes. F4 is closed.
- **4 new flows authored** but unverifiable on this build because of F6:
  - 47-events-detail-survey-render (deep-link survey, no-attendance
    branch with "Survey not available" + "Back to Event" anchors)
  - 48-events-detail-profile-survey-render (deep-link profile-survey,
    Welcome to your first event + Save Details / Skip for now)
  - 49-events-detail-check-in-render (deep-link check-in, Enter
    Check-In Code idle state + either-branch error states)
  - 58-collective-manage-deep-link-render (deep-link collectives/<slug>/
    manage, either Access denied or Manage Collective branch)
  Each flow uses the canonical 01-style auth gate (Welcome back ->
  inputText pair -> Log In), then bypasses home via `openLink` (F6
  workaround: the route ErrorBoundary trips on home but the deep-link
  routes mount independently if F6 is fixed).
- **F6 new finding - catastrophic post-login global ErrorBoundary trip.**
  After `pm clear org.coexistaus.app` + fresh `gradlew installDebug` of
  the current main HEAD (92e1736) build on emulator-5554, cold launch
  shows the "Welcome back" sign-in screen as expected, sign-in via
  email/password completes (Welcome back becomes notVisible),
  navigation to "/" then ERRORS at the top-level ErrorBoundary
  (App.tsx:251) with "Something went wrong" + Reload. Every subsequent
  deep-link to ANY route (probed /admin/events explicitly + the 4 new
  sub-route flows) hits the same boundary. The visible failure mode
  matches what the batch 6 F5 finding describes as a one-shot recovery
  state, but here it is cold-launch and persistent across `pm clear`
  cycles.
  - **Root cause (from chromium Capacitor/Console at 2026-06-11
    10:12:33 UTC):**
    `Error: useLocation() may be used only in the context of a <Router>
    component. The above error occurred in the <dt> component. React
    will try to recreate this component tree from scratch using the
    error boundary you provided, F.`
    Logged at `https://localhost/assets/vendor-Bfw-n6Sb.js:112` with
    the ErrorBoundary catch reported by
    `https://localhost/assets/index-C4LPX0hK.js:3`. `<dt>` is a minified
    React component name - hunt the production-build symbol to identify
    it. The provider stack at main.tsx:209 puts BrowserRouter ABOVE
    AuthProvider/ToastProvider/SentryErrorBoundary/App, so every
    component below BrowserRouter should have Router context. Suspect
    surfaces:
      1. A non-Routes-wrapped use of useLocation by a component that
         mounts in a context where react-router's RouterContext is not
         set (Provider mismatch from a re-bundled dep, or an HOC that
         renders outside Routes).
      2. A duplicate react-router-dom in node_modules - the build has
         only one symlinked v7.17.0 + a `.ignored/react-router-dom`
         leaf from an upgrade, single copy on `node_modules/`. No
         duplicate so far probed.
      3. A regression introduced when a `useLocation` consumer was
         hoisted out of `<Routes>` between the last GREEN APK install
         and HEAD. The prior batch 7 build was almost certainly NOT
         rebuilt; batch 7 only touched .maestro/ YAML and seed scripts,
         so the GREEN emulator was running a stale APK from a much
         earlier build. The regression is therefore older than batch 7
         but invisible because nobody rebuilt the APK. Bisect candidate
         commits since the last known-rebuild are 4eadeb2 (test/maestro
         only, no app source), 92e1736 (insights.tsx Tailwind classes),
         d286071 (insights.tsx), 1008f03 (insights.tsx + copy-table.ts),
         6f7675b (test/maestro only), 4394cd3 (insights.tsx). Most are
         confined to insights.tsx so the suspect is the merge between
         insights changes and earlier branches; 7f82c80 (universal
         links, /unsubscribe route) is a strong starting probe.
  - **Verify gate:** chromium Capacitor/Console error at
    `vendor-Bfw-n6Sb.js:112` matches the literal string `useLocation()
    may be used only in the context of a <Router> component` and the
    minified component frame names `<dt>` - reproduce via
    `pm clear org.coexistaus.app && launchApp && Welcome back +
    sign in -> openLink coexist://admin/events` on emulator-5554 then
    `adb logcat -d | grep -E 'Capacitor/Console.*ERROR'` as opposed
    to the prior cached-APK GREEN state which never re-rendered the
    home tree on the same install.
  - **Unblock A:** identify the `<dt>` minified component (build with
    `sourcemap: true` in vite.config.ts temporarily, OR grep the
    production map for `dt =` referencing useLocation, OR grep the
    source for tiny one-line components that call useLocation and
    might be mounted as `<dt />` symbol).
  - **Unblock B:** revert to a known-good APK by checking out the
    commit before the regression entered (start at 7f82c80 backwards)
    and rebuilding.
  - **Unblock C:** the 4 new flows + every existing flow that does
    not survive an actual home / route mount will stay BLOCKED-F6
    until A or B lands. The next worker should NOT keep authoring new
    flows on this build - all production-build APK tests fail until
    F6 is closed.
  - **F6 RESOLVED 2026-06-11 ~10:25 AEST (root cause = corrupted local
    node_modules, NOT a code regression).** Hypothesis #2 was correct.
    A `pnpm install` had run against this repo at 09:53 (stray
    `pnpm-lock.yaml` + `pnpm-workspace.yaml` appeared, since quarantined),
    converting `node_modules/` to pnpm's symlinked `.pnpm` layout and
    shunting `react-router-dom` into `node_modules/.ignored/`. The build
    then resolved a hoisted `react-router` (v7) AND a second react-router
    instance, so `<Router>`/`BrowserRouter`'s context and the `useLocation`
    consumer came from different module instances -> "useLocation() may be
    used only in the context of a <Router> component". This is a LOCAL
    build artefact only; CI/Vercel run a clean `npm ci`, so the DEPLOYED
    app was never affected (Tate confirmed deployed works; the insights
    redesign was live and green on web throughout).
    - **Fix:** `rm -rf node_modules && npm ci` (this repo is npm, has
      `package-lock.json`, no `packageManager` field; do NOT `pnpm install`
      here). Verify: `find node_modules -maxdepth 2 -name react-router-dom`
      returns exactly `node_modules/react-router-dom` and there is no
      `node_modules/.ignored`.
    - **Proof F6 is environmental:** after `npm ci` + `npm run build`, a
      scripted Chromium login against `vite preview` reaches the authed
      home ("Good morning, Ecodia") with ZERO console errors as opposed to
      the "Something went wrong" ErrorBoundary on the pnpm tree; the native
      iOS build (Coexist-iPhone sim) then signed in and rendered Home +
      /admin/insights with no boundary trip.
    - **Action for the next worker:** F6 is NOT a bisect target. Do not
      hunt the `<dt>` symbol or revert commits. Just rebuild deps with
      `npm ci` and re-run; the 4 BLOCKED-F6 flows (47/48/49/58) should now
      mount. If F6 recurs, someone ran `pnpm install` again - re-quarantine
      the pnpm lockfiles and `npm ci`.

## Batch 9 (2026-06-11) - F6 verification + 4 BLOCKED rows flipped COVERED + regression GREEN

- **F6 confirmed RESOLVED post-`npm ci` + rebuild.** Sibling worker
  closed F6 at commit 012c305 (Batch 8 follow-up): root cause was a
  corrupted local node_modules from a stray `pnpm install` that shunted
  react-router-dom into `node_modules/.ignored` and produced two
  react-router module instances at bundle time. The deployed Vercel
  build was never affected (clean `npm ci` in CI). This batch verified
  the fix on emulator-5554 after `cap sync android` + `gradlew
  installDebug` against the post-fix tree.
- **Batch 8's 4 AUTHORED-BLOCKED-F6 flows now COVERED** (each verified
  GREEN on emulator-5554 this batch):
  - 47-events-detail-survey-render - GREEN ("Survey not available" +
    "Back to Event").
  - 48-events-detail-profile-survey-render - GREEN ("Welcome to your
    first event"/"Quick Profile Setup"/"Your Details" + Save Details
    / Skip for now).
  - 49-events-detail-check-in-render - GREEN ("Enter Check-In Code"
    idle state).
  - 58-collective-manage-deep-link-render - GREEN ("Access denied"
    EmptyState - the canManage gate is OFF for code@, anchor matches
    the deny branch).
- **Regression sweep GREEN.** 4-flow baseline confirmed no batch-8 or
  F6-fix collateral:
  - 01-signin-authed-feed - GREEN (Welcome back -> YOUR NEXT EVENT,
    Explore. Connect. Protect., Ecodia in sidebar).
  - 31-admin-events-list - GREEN (UPCOMING / REGISTRATIONS /
    AVG ATTENDANCE / Create New Event / BIGGEST EVENT).
  - 39-events-detail-deep-walk - GREEN (Share Event + a Register /
    Cancel Registration / Check In Now / Join Waitlist / You're
    registered CTA branch).
  - 92-admin-events-create-cleanup - GREEN (create -> scrollUntilVisible
    sentinel -> DELETE -> stopApp+launchApp -> assertNotVisible
    sentinel; cleanup self-heals orphans on entry).
- **Stale dist + APK confirmation step codified.** Before any
  verification run after a node_modules mutation, the rebuild order
  is: `node node_modules/vite/bin/vite.js build` ->
  `node node_modules/@capacitor/cli/bin/capacitor sync android` ->
  `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  ANDROID_SERIAL=emulator-5554 ./gradlew installDebug` -> `adb -s
  emulator-5554 shell pm clear org.coexistaus.app`. Skipping any step
  risks reverification against the stale cached APK that masked F6 in
  batches 6-7. probe: scripted run of 01 returns YOUR NEXT EVENT
  anchor after `pm clear` as opposed to the boundary "Something went
  wrong" that a stale cached APK would have shown.
- **Open original work order carried over to batch 10**: admin/development
  substrate seed (dev_modules + dev_sections + dev_quizzes triple) to
  unblock 6 detail routes + /learn/* journey; /shop/orders/:id seed for
  code@ user_id 4cc11fa1-8aec-4a92-928d-3c8a304dd4db OR drive 94 to
  order-confirmation; /impact/national metric invariance (extend 41 with
  useNationalImpact canonical math runScript); sibling test account for
  /onboarding + /welcome-back + /accept-terms + /suspended; F5
  root-cause investigation (deep-link /shop/cart from /shop/checkout
  ErrorBoundary).

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
