# Mobile Padding Audit

**Branch:** fix/mobile-padding-audit
**Date:** 2026-04-23
**Scope:** All routes under `src/pages/` plus shared layout components

---

## Design System Standard

| Location | Mobile default | Scale up |
|---|---|---|
| Page horizontal (via `Page` component) | `px-4` (16px) | `lg:px-6` |
| Admin layout content | `p-4` (16px) | `sm:p-6 lg:p-8` |
| Leader layout content | `p-4` (16px) | `sm:p-6 lg:p-8` |
| Card internal | `p-4` or `p-5` | - |
| Centered empty states / hero overlays | `px-6` acceptable | - |
| Auth/onboarding bare-shell forms | `px-4` to `px-6` acceptable | - |

---

## Shared Layout Components (High Impact)

### `src/components/leader-layout.tsx`

**CHANGED.** The content wrapper div used a flat `p-6` with no responsive scaling. On a 375px phone this wasted 48px of horizontal space (24px each side) leaving only 327px for all leader section content.

| Before | After |
|---|---|
| `p-6` | `p-4 sm:p-6 lg:p-8` |

**Impact:** Fixes all leader pages (Dashboard, Events, Tasks, Reports, Create Event) in one change.

### `src/components/admin-layout.tsx`

**No change needed.** Already uses `p-4 sm:p-6 lg:p-8` (responsive and correct).

### `src/components/page.tsx`

**No change needed.** Already uses `px-4 lg:px-6` as the mobile default, with `fullBleed ? 'px-0'` escape hatch.

### `src/components/app-shell.tsx`

**No change needed.** Shell chrome only - no content padding.

---

## Admin Development Pages (Sticky Footer Bleed Fix)

These pages rendered a sticky bottom bar using `-mx-6 -mb-6 px-6` to bleed edge-to-edge from the admin layout container. Since the admin layout was already correctly `p-4 sm:p-6 lg:p-8`, the bleed values needed to match at every breakpoint.

All 6 files changed from the same pattern to a responsive equivalent:

| Before | After |
|---|---|
| `-mx-6 -mb-6 px-6` | `-mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8` |

**Files changed:**
- `src/pages/admin/development/create-module.tsx`
- `src/pages/admin/development/create-quiz.tsx`
- `src/pages/admin/development/create-section.tsx`
- `src/pages/admin/development/edit-module.tsx`
- `src/pages/admin/development/edit-quiz.tsx`
- `src/pages/admin/development/edit-section.tsx`

---

## Page-Level Fixes

### `src/pages/home.tsx`

Page uses `fullBleed` so it owns its own horizontal padding. Two content containers had `px-6` where `px-4` is correct.

| Location | Before | After |
|---|---|---|
| Greeting section (line 1080) | `px-6 pt-6 mb-2` | `px-4 pt-6 mb-2` |
| Error fallback section (line 1101) | `px-6 py-8` | `px-4 py-8` |

Note: `flex gap-3 px-6` on lines 489 and 691 are horizontal carousel overflow bleed patterns (paired with `-mx-6`) - deliberate, left unchanged.

### `src/pages/events/event-day.tsx`

The check-in code display card used `px-8 py-6` - 32px horizontal padding on a card at 375px width.

| Before | After |
|---|---|
| `px-8 py-6 rounded-2xl bg-white shadow-md` | `px-5 py-5 rounded-2xl bg-white shadow-md` |

### `src/pages/leader/events.tsx`

The loading skeleton used `px-6 pt-14` (no responsive scaling) while the real content already used `px-4 sm:px-6 lg:px-8`. Aligned the skeleton to match.

| Before | After |
|---|---|
| `px-6 pt-14 space-y-6` | `px-4 sm:px-6 lg:px-8 pt-14 space-y-6` |

### `src/pages/shop/checkout.tsx`

Page overrides to `!px-0` so it controls its own padding. The hero section div used `px-6 pb-5`.

| Before | After |
|---|---|
| `px-6 pb-5 flex items-center gap-4` | `px-4 pb-5 flex items-center gap-4` |

### `src/pages/onboarding/welcome-back.tsx`

Bottom CTA action area used `px-6 py-6`.

| Before | After |
|---|---|
| `px-6 py-6` | `px-4 py-4` |

safe-area paddingBottom: `max(1.5rem, ...)` reduced to `max(1rem, ...)` to match.

### `src/pages/onboarding/leader-welcome.tsx`

Same bottom CTA pattern as welcome-back.

| Before | After |
|---|---|
| `px-6 py-6` | `px-4 py-4` |

### Onboarding Step Files (6 files)

All onboarding step content containers used `px-6 pt-8` or `px-6 pt-8 min-h-0`.

| Before | After |
|---|---|
| `px-6 pt-8` | `px-4 pt-8` |
| `px-6 pt-8 min-h-0` | `px-4 pt-8 min-h-0` |

**Files changed:**
- `src/pages/onboarding/steps/step-profile-photo.tsx`
- `src/pages/onboarding/steps/step-location.tsx`
- `src/pages/onboarding/steps/step-interests.tsx`
- `src/pages/onboarding/steps/step-name-handle.tsx`
- `src/pages/onboarding/steps/step-collective.tsx`
- `src/pages/onboarding/steps/step-first-event.tsx`

---

## Routes Audited - Full List

All 137 page files across `src/pages/` were checked.

| Route / Page | Status | Notes |
|---|---|---|
| `src/pages/admin/applications.tsx` | OK | Uses admin layout (p-4+) |
| `src/pages/admin/audit-log.tsx` | OK | Uses admin layout |
| `src/pages/admin/challenges.tsx` | OK | Uses admin layout |
| `src/pages/admin/collective-detail.tsx` | OK | fullBleed, own padding |
| `src/pages/admin/collectives.tsx` | OK | fullBleed |
| `src/pages/admin/contacts.tsx` | OK | Uses admin layout |
| `src/pages/admin/create-survey.tsx` | OK | `px-4 sm:px-6` on toolbar |
| `src/pages/admin/create.tsx` | OK | Uses admin layout |
| `src/pages/admin/development/create-module.tsx` | FIXED | Sticky footer bleed |
| `src/pages/admin/development/create-quiz.tsx` | FIXED | Sticky footer bleed |
| `src/pages/admin/development/create-section.tsx` | FIXED | Sticky footer bleed |
| `src/pages/admin/development/edit-module.tsx` | FIXED | Sticky footer bleed |
| `src/pages/admin/development/edit-quiz.tsx` | FIXED | Sticky footer bleed |
| `src/pages/admin/development/edit-section.tsx` | FIXED | Sticky footer bleed |
| `src/pages/admin/development/index.tsx` | OK | Uses admin layout |
| `src/pages/admin/development/module-detail.tsx` | OK | Uses admin layout |
| `src/pages/admin/development/results.tsx` | OK | Uses admin layout |
| `src/pages/admin/dev-tools.tsx` | OK | Uses admin layout |
| `src/pages/admin/email/` (all tabs) | OK | Uses admin layout |
| `src/pages/admin/events.tsx` | OK | Uses admin layout |
| `src/pages/admin/exports.tsx` | OK | Uses admin layout |
| `src/pages/admin/impact.tsx` | OK | Uses admin layout, `px-4 sm:px-6 lg:px-8` inside |
| `src/pages/admin/index.tsx` | OK | fullBleed, `px-4 sm:px-6 lg:px-8` on content |
| `src/pages/admin/legal-pages.tsx` | OK | Uses admin layout |
| `src/pages/admin/merch/` (all tabs) | OK | inventory-tab `px-6` is button padding, not page padding |
| `src/pages/admin/moderation/index.tsx` | OK | Uses admin layout |
| `src/pages/admin/partners.tsx` | OK | Uses admin layout |
| `src/pages/admin/surveys.tsx` | OK | Uses admin layout |
| `src/pages/admin/updates.tsx` | OK | Uses admin layout |
| `src/pages/admin/users.tsx` | OK | Uses admin layout |
| `src/pages/admin/workflows.tsx` | OK | Uses admin layout |
| `src/pages/auth/accept-terms.tsx` | OK | Bare shell auth page, px-6 intentional |
| `src/pages/auth/auth-callback.tsx` | OK | Centered full-screen state |
| `src/pages/auth/email-verification.tsx` | OK | Centered full-screen state |
| `src/pages/auth/forgot-password.tsx` | OK | Bare shell auth form |
| `src/pages/auth/login.tsx` | OK | Bare shell auth form |
| `src/pages/auth/reset-password.tsx` | OK | Bare shell auth form |
| `src/pages/auth/sign-up.tsx` | OK | Bare shell auth form |
| `src/pages/auth/suspended-account.tsx` | OK | Centered full-screen state |
| `src/pages/auth/welcome.tsx` | OK | Bare shell, px-4 sm:px-6 on content |
| `src/pages/chat/chat-leader-panel.tsx` | OK | No page-level padding violations |
| `src/pages/chat/chat-message-list.tsx` | OK | No page-level padding violations |
| `src/pages/chat/chat-room.tsx` | OK | fullBleed style |
| `src/pages/chat/chat-search.tsx` | OK | Uses Page wrapper |
| `src/pages/chat/index.tsx` | OK | `px-4 lg:px-6` throughout |
| `src/pages/collectives/collective-detail.tsx` | OK | Uses Page wrapper |
| `src/pages/collectives/manage.tsx` | OK | Uses Page wrapper |
| `src/pages/contact.tsx` | OK | px-4 sm:px-6 lg:px-8 on content |
| `src/pages/design/event-editorial.tsx` | OK | Internal design page, intentional px-6 |
| `src/pages/donate/donor-wall.tsx` | OK | No violations |
| `src/pages/donate/index.tsx` | OK | Hero overlay centering, px-5 lg:px-6 on content |
| `src/pages/donate/thank-you.tsx` | OK | Hero overlay and px-5 lg:px-6 on content |
| `src/pages/events/check-in.tsx` | OK | px-6 on centered empty states only |
| `src/pages/events/components/event-form-fields.tsx` | OK | Component, no page-level padding |
| `src/pages/events/create-event.tsx` | OK | Uses Page wrapper |
| `src/pages/events/edit-event.tsx` | OK | Uses Page wrapper |
| `src/pages/events/event-actions.tsx` | OK | No violations |
| `src/pages/events/event-attendees.tsx` | OK | Uses Page wrapper |
| `src/pages/events/event-day.tsx` | FIXED | Card px-8 reduced to px-5 |
| `src/pages/events/event-detail.tsx` | OK | fullBleed style |
| `src/pages/events/event-hero.tsx` | OK | Hero component |
| `src/pages/events/index.tsx` | OK | px-4 lg:px-6 throughout |
| `src/pages/events/log-impact.tsx` | OK | px-6 on centered empty state only |
| `src/pages/events/my-tickets.tsx` | OK | Uses Page wrapper |
| `src/pages/events/post-event-survey.tsx` | OK | No violations |
| `src/pages/events/profile-survey.tsx` | OK | No violations |
| `src/pages/events/ticket-confirmation.tsx` | OK | No violations |
| `src/pages/home.tsx` | FIXED | Two px-6 content containers |
| `src/pages/impact/index.tsx` | OK | !px-0 then px-4 lg:px-6 internally |
| `src/pages/impact/national.tsx` | OK | Uses Page wrapper |
| `src/pages/lead-a-collective.tsx` | OK | px-4 sm:px-6 lg:px-8 throughout |
| `src/pages/leader/events.tsx` | FIXED | Skeleton loading skeleton aligned |
| `src/pages/leader/index.tsx` | OK | fullBleed, px-4 sm:px-6 lg:px-8 on content |
| `src/pages/leader/reports.tsx` | OK | Uses leader layout |
| `src/pages/leader/tasks.tsx` | OK | px-4 sm:px-6 lg:px-8 on content |
| `src/pages/leadership.tsx` | OK | px-4 sm:px-6 lg:px-8 on content |
| `src/pages/learn/complete.tsx` | OK | px-6 on centered hero max-w-md section |
| `src/pages/learn/index.tsx` | OK | px-4 sm:px-6 lg:px-8 throughout |
| `src/pages/learn/module.tsx` | OK | px-5 sm:px-6 on fullBleed-style page |
| `src/pages/learn/quiz.tsx` | OK | No violations |
| `src/pages/learn/section.tsx` | OK | px-4 sm:px-6 lg:px-8 throughout |
| `src/pages/legal/` (all) | OK | Uses legal-page-shell |
| `src/pages/map.tsx` | OK | fullBleed map, no content padding issues |
| `src/pages/more.tsx` | OK | Uses Page wrapper |
| `src/pages/notifications/index.tsx` | OK | px-6 on empty state only |
| `src/pages/onboarding/leader-welcome.tsx` | FIXED | Bottom CTA px-6 reduced |
| `src/pages/onboarding/onboarding.tsx` | OK | px-6 on progress dots only |
| `src/pages/onboarding/steps/step-celebration.tsx` | OK | Centered celebration screen |
| `src/pages/onboarding/steps/step-collective.tsx` | FIXED | px-6 to px-4 |
| `src/pages/onboarding/steps/step-first-event.tsx` | FIXED | px-6 to px-4 |
| `src/pages/onboarding/steps/step-interests.tsx` | FIXED | px-6 to px-4 |
| `src/pages/onboarding/steps/step-location.tsx` | FIXED | px-6 to px-4 |
| `src/pages/onboarding/steps/step-name-handle.tsx` | FIXED | px-6 to px-4 |
| `src/pages/onboarding/steps/step-profile-photo.tsx` | FIXED | px-6 to px-4 |
| `src/pages/onboarding/welcome-back.tsx` | FIXED | Bottom CTA px-6 reduced |
| `src/pages/partners.tsx` | OK | px-4 sm:px-6 lg:px-8 on content |
| `src/pages/profile/edit-profile.tsx` | OK | No page-level violations |
| `src/pages/profile/index.tsx` | OK | Uses Page wrapper |
| `src/pages/profile/view-profile.tsx` | OK | Uses Page wrapper, px-4 inside |
| `src/pages/public/account-deletion.tsx` | OK | Public page |
| `src/pages/public/collective.tsx` | OK | Public page, px-5 sm:px-8 intentional |
| `src/pages/public/data-deletion.tsx` | OK | Public page |
| `src/pages/public/download.tsx` | OK | Public marketing page |
| `src/pages/public/event.tsx` | OK | px-4 py-6 sm:px-6 on content |
| `src/pages/referral/index.tsx` | OK | No violations |
| `src/pages/reports/index.tsx` | OK | Uses Page wrapper |
| `src/pages/settings/account.tsx` | OK | Uses Page wrapper |
| `src/pages/settings/index.tsx` | OK | Uses Page wrapper |
| `src/pages/settings/notifications.tsx` | OK | Uses Page wrapper |
| `src/pages/settings/privacy.tsx` | OK | Uses Page wrapper |
| `src/pages/shop/cart.tsx` | OK | px-4 sm:px-6 lg:px-8 on content |
| `src/pages/shop/checkout.tsx` | FIXED | Hero section px-6 to px-4 |
| `src/pages/shop/index.tsx` | OK | px-5 lg:px-6 (borderline but consistent) |
| `src/pages/shop/order-confirmation.tsx` | OK | px-6 on centered celebration hero |
| `src/pages/shop/order-detail.tsx` | OK | No violations |
| `src/pages/shop/orders.tsx` | OK | No violations |
| `src/pages/shop/product-detail.tsx` | OK | No violations |
| `src/pages/splash.tsx` | OK | Splash screen, no content padding |
| `src/pages/tasks/index.tsx` | OK | Uses Page wrapper |
| `src/pages/updates/create.tsx` | OK | px-6 on button only |
| `src/pages/updates/index.tsx` | OK | px-4 lg:px-6 throughout |

---

## Routes Flagged as Outside Scope but Needing Attention

- **`src/pages/admin/development/` all pages**: Cards inside use `p-5 sm:p-6` which is fine, but the responsive sticky footer fix introduced responsive Tailwind classes - verify on real device that the bleed aligns correctly at each breakpoint.
- **`src/pages/shop/index.tsx`**: Uses `px-5 lg:px-6` consistently (20px mobile). Borderline but consistent throughout the file - left as-is per "px-5 is borderline, use judgement" instruction.
- **`src/pages/learn/module.tsx`**: Uses `px-5 sm:px-6` throughout for a reading-optimised layout. Left as-is since it reads intentionally narrower for prose consumption.
- **`src/pages/public/collective.tsx`**: Public marketing page uses `px-5 sm:px-8` - intentional marketing spacing. Left alone.
- **Admin hero pages** (`admin/index.tsx`, `leader/index.tsx`): Full-bleed hero pages control their own padding. All already use `px-4 sm:px-6 lg:px-8` on content sections.

---

## Summary

- **137 page files audited**
- **18 files changed** (1 shared layout + 17 page files)
- **Shared layout change** (leader-layout.tsx): single fix that improves all leader section pages
- **Build status:** passing (tsc + vite build clean)
