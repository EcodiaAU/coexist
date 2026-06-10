# Maestro coverage map - Coexist (Capacitor, both stores)

Source of truth for "is the whole app mapped". Every route from
`src/App.tsx` (enumerated 2026-06-10, 124 path entries). A route is
COVERED only when a flow drives it and asserts dump-verified anchors;
PARTIAL when a flow reaches it but asserts thinly; UNCOVERED otherwise.
Update this file in the SAME commit as any flow change (lifecycle rule in
backend/patterns/maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10.md).

Status totals 2026-06-10: 9 covered / 4 partial / ~111 uncovered.

## Customer core (the public-push gate set)

| Route | Status | Flow / note |
|---|---|---|
| / (authed home) | COVERED | 01-signin-authed-feed |
| /login | COVERED | 01 conditional block |
| / cold start | COVERED | 90-cold-start-render (strict canary, bug 1b1e718d) |
| /chat | PARTIAL | 02-tabs-walk asserts composer; no send/receive |
| /chat/:collectiveId | UNCOVERED | |
| /chat/channel/:channelId | UNCOVERED | |
| /profile | COVERED | 02-tabs-walk |
| /profile/edit | UNCOVERED | reached-able from covered Profile |
| /profile/tickets | UNCOVERED | |
| /profile/privacy | UNCOVERED | |
| /profile/:userId | UNCOVERED | |
| /events | PARTIAL | 02 asserts EVENTS header only |
| /events/:id | UNCOVERED | PRIORITY: detail + RSVP create-assert-DELETE (prod-write-with-cleanup) |
| /events/:id/day | UNCOVERED | |
| /events/:id/impact | UNCOVERED | |
| /events/:id/survey, /profile-survey | UNCOVERED | |
| /events/:id/ticket-confirmation | UNCOVERED | rides the RSVP flow |
| /events/:id/check-in, /check-in/:token | UNCOVERED | leader-side |
| /explore | UNCOVERED | |
| /collectives | UNCOVERED | drawer link asserted in 02 only |
| /collectives/:slug (+/collective/:slug) | UNCOVERED | |
| /collectives/:slug/manage | UNCOVERED | leader-side |
| /notifications | UNCOVERED | |
| /settings | COVERED | 04-settings-walk |
| /settings/account | UNCOVERED | link asserted only |
| /settings/notifications | UNCOVERED | |
| /settings/privacy | UNCOVERED | |
| /learn, /learn/module/:id, /learn/section/:id, /learn/quiz/:id, /learn/complete | UNCOVERED | full learn journey absent |
| /shop, /shop/:slug, /shop/cart, /shop/checkout, /shop/order-confirmation, /shop/orders, /shop/orders/:id | UNCOVERED | checkout needs prod-write-with-cleanup design |
| /tasks | UNCOVERED | |
| /updates | UNCOVERED | |
| /impact, /impact/national | UNCOVERED | metric surfaces: need DB-invariance asserts |
| /referral | UNCOVERED | |
| /signup | UNCOVERED | needs create-assert-DELETE account design |
| /forgot-password, /reset-password, /verify-email | UNCOVERED | email-loop bound; assert form render at minimum |
| /onboarding, /welcome, /welcome-back, /accept-terms | UNCOVERED | fresh-account path |
| /suspended | UNCOVERED | needs seeded state |

## Admin (test account HAS admin role)

| Route | Status | Flow / note |
|---|---|---|
| /admin (home) | COVERED | 03-admin-walk (anchors: Collectives + App tabs; select VALUES are not hierarchy text) |
| /admin/events | COVERED | 03 + 05-admin-metrics-invariance (UPCOMING / REGISTRATIONS / AVG ATTENDANCE vs DB truth) |
| /admin/events/create | UNCOVERED | create-assert-DELETE candidate |
| /admin/users | UNCOVERED | drawer link asserted in 02 only |
| /admin/collectives, collectives/:id | UNCOVERED | |
| /admin/tasks | UNCOVERED | |
| /admin/email | UNCOVERED | web audit running via CDP; mobile flow pending its findings |
| /admin/metrics, insights, impact, national-impact, reports, exports | UNCOVERED | metric surfaces: DB-invariance asserts required |
| /admin/applications, audit-log, challenges, contacts, create, dev-tools | UNCOVERED | |
| /admin/development/* (modules, quizzes, sections, results: 8 routes) | UNCOVERED | |
| /admin/moderation, partners, photos, shop, surveys (+create/edit), updates, legal-pages | UNCOVERED | |

## Auxiliary / legal / marketing (render checks only; low priority)

/about /accessibility /account-deletion /contact /cookies /data-deletion
/data-policy /disclaimer /donate /donate/donors /donate/thank-you
/download /lead-a-collective /leader /leader-welcome /leadership
/partners /privacy /privacy/settings /terms /unsubscribe /auth/callback
/design/events /* (404)
ALL UNCOVERED. Plan: one render-sweep flow asserting each page mounts
with its h1 (catches the white-screen class), not per-page journeys.

## Rules that bind authoring here

- androidWebViewHierarchy: devtools (Capacitor).
- Anchors from dumps/screenshots only; full-string regex; select VALUES never anchor.
- Prod writes allowed ONLY as create -> assert -> DELETE -> assert-gone (Tate 2026-06-10); cleanup failure is itself a finding.
- State-mutating flows get 90+ prefixes.
- Creds env-injected (MAESTRO_CX_EMAIL / MAESTRO_CX_PASSWORD).
