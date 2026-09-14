import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isExternallyBooked } from '@/lib/event-capacity'

/* An event carrying `external_registration_url` is one PHYSICAL event whose
   seats are sold by a partner. The app used to run a second, blind booking
   channel beside it: Riverfest (Jess, 17 Oct 2026, capacity 45, Humanitix)
   read 45/45 filled with 37 waitlisted in-app against roughly 20 real partner
   bookings, having invented about 25 seats and hidden the real ones behind a
   "full" banner.

   The server half is enforced in Postgres and cannot be exercised from vitest,
   so the migration clauses are pinned here as a drift guard. The predicate and
   the client entry points ARE checkable, and the entry points are the half
   that actually regressed: the bug survived a previous fix because a fourth
   door existed in another file. */

const root = (p: string) => resolve(__dirname, '../..', p)
const read = (p: string) => readFileSync(root(p), 'utf8')

const MIGRATION = read('supabase/migrations/20260914140000_external_booking_url_owns_capacity.sql')

describe('isExternallyBooked predicate', () => {
  it('is true only for a non-empty url', () => {
    expect(isExternallyBooked({ external_registration_url: 'https://events.humanitix.com/x' })).toBe(true)
    expect(isExternallyBooked({ external_registration_url: null })).toBe(false)
    expect(isExternallyBooked({ external_registration_url: '' })).toBe(false)
    expect(isExternallyBooked(null)).toBe(false)
    expect(isExternallyBooked(undefined)).toBe(false)
  })

  /* The negative control that matters commercially. `is_external_collaboration`
     means "run with another org" and is true of 25 events that take their
     bookings in-app perfectly correctly. Keying off the flag instead of the URL
     would have broken normal RSVP on all of them. */
  it('ignores is_external_collaboration entirely', () => {
    const flaggedButAppBooked = {
      is_external_collaboration: true,
      external_registration_url: null,
    } as { is_external_collaboration: boolean; external_registration_url: string | null }
    expect(isExternallyBooked(flaggedButAppBooked)).toBe(false)
  })

  it('treats a whitespace-only url as no url', () => {
    expect(isExternallyBooked({ external_registration_url: '   ' })).toBe(false)
  })
})

describe('every client entry point into a seat claim is gated', () => {
  /* The shared mutation. Gating here covers event-detail's branches AND the
     home fallback-event card in one place, and it is the only guard an older
     installed bundle reaching the new database will not have. */
  it('useRegisterForEvent refuses an externally-booked event', () => {
    const hook = read('src/hooks/use-events.ts')
    expect(hook).toContain('isExternallyBooked')
    expect(hook).toMatch(/select\('is_ticketed, external_registration_url'\)/)
    expect(hook).toMatch(/if \(isExternallyBooked\(evt\)\) \{\s*\n\s*throw new Error/)
  })

  /* The door that oversold Riverfest. The invitation branch renders
     "Accept & Register" and used to run ABOVE the external-link branch, so an
     invited member never saw the partner link at all and 500 invited rows fed
     45 phantom seats. Order is the fix, so order is what is asserted. */
  it('event-detail puts the external branch above the invited branch', () => {
    const page = read('src/pages/events/event-detail.tsx')
    const external = page.indexOf('if (externallyBooked && !isTicketed) {')
    const invited = page.indexOf("if (userStatus === 'invited' && !isTicketed) {")
    expect(external).toBeGreaterThan(-1)
    expect(invited).toBeGreaterThan(-1)
    expect(external).toBeLessThan(invited)
  })

  /* The removed control. Any button that creates a seat on these events
     reintroduces the bug, whatever it is labelled. */
  it('event-detail offers no in-app register or waitlist on an external event', () => {
    const page = read('src/pages/events/event-detail.tsx')
    expect(page).not.toContain('Also Register In-App')
  })

  /* The fourth door, in another file, which bypasses the guarded hook by
     upserting event_registrations directly. The 2026-09-06 safety fix funnelled
     three entry points and missed this one; the same miss would resurrect this
     bug, so it is pinned separately. */
  it('the chat Going button routes an external event to the event page', () => {
    const chat = read('src/pages/chat/chat-message-list.tsx')
    expect(chat).toContain("import { isExternallyBooked } from '@/lib/event-capacity'")
    expect(chat).toMatch(/if \(isExternallyBooked\(eventDetail\)\) \{/)
    // and it must return before reaching the raw upsert below
    const guard = chat.indexOf('if (isExternallyBooked(eventDetail)) {')
    const upsert = chat.indexOf("from('event_registrations')")
    expect(guard).toBeLessThan(upsert)
  })
})

describe('the capacity meter stops quoting a number the app does not own', () => {
  it('suppresses at-capacity and the percent bar for external events', () => {
    const page = read('src/pages/events/event-detail.tsx')
    expect(page).toMatch(/const externallyBooked = isExternallyBooked\(event\)/)
    expect(page).toMatch(/const isAtCapacity = !externallyBooked && event\?\.capacity/)
    expect(page).toMatch(/if \(externallyBooked\) return 0/)
  })
})

describe('server-side guard migration', () => {
  /* A native bundle keeps running old client code for days while Capgo catches
     up, and RLS permits a bare PostgREST upsert, so the client guard alone is
     not the fix. */
  it('demotes a new going-set claim on an externally-booked event', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION public.handle_event_registration()')
    expect(MIGRATION).toMatch(/IF v_external IS NOT NULL THEN[\s\S]*?NEW\.status := 'waitlisted';/)
  })

  /* Staff exemption. A leader checking in somebody who booked on Humanitix and
     physically turned up is ground truth and outranks a booking policy. */
  it('exempts leaders, staff and service_role so walk-in check-in still works', () => {
    const block = MIGRATION.slice(
      MIGRATION.indexOf('IF v_external IS NOT NULL THEN'),
      MIGRATION.indexOf('-- Registrations frozen.'),
    )
    expect(block).toContain("auth.role() = 'service_role'")
    expect(block).toContain('public.is_collective_leader_or_above')
    expect(block).toContain('public.is_admin_or_staff')
  })

  /* Rows already registered or attended must never be re-litigated: the 45 on
     Riverfest keep their status, their leader visibility and their cancel. */
  it('never demotes a row that already holds its seat', () => {
    expect(MIGRATION).toContain("IF TG_OP = 'UPDATE' AND OLD.status IN ('registered', 'attended') THEN")
  })

  /* The clause that keeps 37 people from being emailed. The sweep runs
     privileged, so the trigger would NOT demote its flips: this filter is the
     only thing stopping it. */
  it('excludes external events from the emailing promotion sweep', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION public.promote_free_event_waitlist')
    expect(MIGRATION).toMatch(
      /AND NULLIF\(btrim\(COALESCE\(e\.external_registration_url, ''\)\), ''\) IS NULL/,
    )
  })

  it('stops the cancel-backfill promoting on external events', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION public.handle_registration_cancel()')
    expect(MIGRATION).toMatch(/IF v_closed IS TRUE OR v_external IS NOT NULL THEN\s*\n\s*RETURN NEW;/)
  })

  /* CREATE OR REPLACE on a function whose body was last changed by a LATER
     migration than the one it was defined in would silently revert that change.
     The queue-priority block landed 2026-09-06, after the file this body was
     copied from, so its presence is the proof the replacement was built from
     the live definition. */
  it('carries the 2026-09-06 queue-priority block forward', () => {
    expect(MIGRATION).toContain('QUEUE PRIORITY (2026-09-06)')
  })

  it('leaves the existing rows alone', () => {
    expect(MIGRATION).not.toMatch(/\bDELETE FROM event_registrations\b/)
    expect(MIGRATION).not.toMatch(/\bUPDATE events\b/)
  })
})
