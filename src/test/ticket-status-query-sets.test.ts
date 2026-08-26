import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  TICKET_STATUSES,
  TERMINAL_GONE_TICKET_STATUSES,
  RESOLVING_TICKET_STATUSES,
  UNSETTLED_TICKET_STATUSES,
  LIVE_TICKET_STATUSES,
  SPOT_TAKING_TICKET_STATUSES,
  PAID_TICKET_STATUSES,
} from '@/lib/event-capacity'
import * as edge from '../../supabase/functions/_shared/ticket-status'

/**
 * The OTHER half of the `reserved` status class: status SETS inside queries.
 *
 * `src/test/ticket-status-class.test.ts` locks the RENDER half, where a total
 * `Record<TicketStatus, ...>` makes a missing status a compile error. No type
 * can do that for `.in('status', ['pending', 'confirmed', 'checked_in'])`, so
 * that literal was copied to seven sites and every copy went silently wrong the
 * day a sixth status existed. Three were HIGH:
 *
 *   F1 claim-event-ticket  a member holding a `reserved` spot did not match the
 *                          idempotency lookup, so a SECOND comp row was inserted
 *                          and they occupied two seats.
 *   F2 grant-event-ticket  same shape, triggered by an organiser comp.
 *   F3 cancel-event        cancelling an event swept only the three old
 *                          statuses, so holds survived the cancellation: still
 *                          counted against capacity, never reconciled, and My
 *                          Tickets kept reading "Spot held for you. Pay $X to
 *                          confirm." for an event that no longer exists.
 *
 * These tests hold the class three ways: the sets agree with the DATABASE, the
 * Deno twin agrees with the TypeScript side, and no audited call site is
 * allowed to go back to spelling a status list out inline.
 */

const repo = (rel: string) => path.resolve(__dirname, '../..', rel)
const read = (rel: string) => readFileSync(repo(rel), 'utf-8')

/** Strip comments so a check reads CODE. Doctrine comments name the old literal. */
const stripComments = (body: string) =>
  body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const EDGE_SITES = [
  'supabase/functions/claim-event-ticket/index.ts',
  'supabase/functions/grant-event-ticket/index.ts',
  'supabase/functions/cancel-event/index.ts',
] as const

/* ------------------------------------------------------------------ */

describe('ticket status sets: the database is the ground truth', () => {
  it('TICKET_STATUSES is exactly the event_tickets_status_check constraint', () => {
    const sql = read('supabase/migrations/20260824000000_ticket_selfservice_and_reserved_holds.sql')
    const m = sql.match(/ADD CONSTRAINT event_tickets_status_check\s*CHECK \(status = ANY \(ARRAY\[([\s\S]*?)\]\)\)/)
    expect(m, 'could not find the status check constraint in the migration').toBeTruthy()
    const fromDb = Array.from(m![1].matchAll(/'([a-z_]+)'::text/g), (x) => x[1])
    expect(fromDb.length).toBeGreaterThan(0)
    // Order matters: both are declared in schema order, and a mismatch means one
    // side gained a status the other has never heard of.
    expect(fromDb).toEqual([...TICKET_STATUSES])
  })
})

describe('ticket status sets: the Deno twin cannot drift from the TypeScript side', () => {
  // The edge functions cannot import src/lib (they bundle from supabase/functions),
  // so the sets are duplicated on purpose. This is what makes that safe.
  const pairs: ReadonlyArray<[string, readonly string[], readonly string[]]> = [
    ['TICKET_STATUSES', TICKET_STATUSES, edge.TICKET_STATUSES],
    ['TERMINAL_GONE_TICKET_STATUSES', TERMINAL_GONE_TICKET_STATUSES, edge.TERMINAL_GONE_TICKET_STATUSES],
    ['UNSETTLED_TICKET_STATUSES', UNSETTLED_TICKET_STATUSES, edge.UNSETTLED_TICKET_STATUSES],
    ['LIVE_TICKET_STATUSES', LIVE_TICKET_STATUSES, edge.LIVE_TICKET_STATUSES],
    ['SPOT_TAKING_TICKET_STATUSES', SPOT_TAKING_TICKET_STATUSES, edge.SPOT_TAKING_TICKET_STATUSES],
    ['PAID_TICKET_STATUSES', PAID_TICKET_STATUSES, edge.PAID_TICKET_STATUSES],
  ]

  for (const [name, ts, deno] of pairs) {
    it(`${name} is identical on both sides`, () => {
      expect([...deno], `${name} drifted between src/lib and the Deno twin`).toEqual([...ts])
    })
  }

  it('UNSETTLED and RESOLVING are the same set under two readings', () => {
    expect([...UNSETTLED_TICKET_STATUSES]).toEqual([...RESOLVING_TICKET_STATUSES])
  })
})

describe('ticket status sets: LIVE is derived, so a new status is live by default', () => {
  it('LIVE is exactly the non-terminal statuses', () => {
    const gone = new Set<string>(TERMINAL_GONE_TICKET_STATUSES)
    expect([...LIVE_TICKET_STATUSES]).toEqual(TICKET_STATUSES.filter((s) => !gone.has(s)))
  })

  it('LIVE contains reserved: THE bug, stated as an assertion', () => {
    // Every one of F1, F2 and F3 was one missing member of this set.
    expect(LIVE_TICKET_STATUSES).toContain('reserved')
  })

  it('an unpaid hold is live but NOT settled and NOT paid', () => {
    expect(LIVE_TICKET_STATUSES).toContain('reserved')
    expect(UNSETTLED_TICKET_STATUSES).toContain('reserved')
    expect(SPOT_TAKING_TICKET_STATUSES).toContain('reserved')
    expect(PAID_TICKET_STATUSES).not.toContain('reserved')
  })

  it('a terminal status is never live', () => {
    for (const gone of TERMINAL_GONE_TICKET_STATUSES) {
      expect(LIVE_TICKET_STATUSES).not.toContain(gone)
    }
  })
})

/* ------------------------------------------------------------------ */
/*  The defect, executable: what a `.in('status', [...])` actually matches */
/* ------------------------------------------------------------------ */

/** Simulate PostgREST `.in('status', statuses)` over a set of rows. */
const matchIn = <T extends { status: string }>(rows: readonly T[], statuses: readonly string[]) =>
  rows.filter((r) => statuses.includes(r.status))

/** The literal that was inline at all three sites before this fix. */
const THE_OLD_LITERAL = ['pending', 'confirmed', 'checked_in'] as const

describe('the idempotency lookup (F1, F2): a held seat must be FOUND', () => {
  const hold = { id: 'hold', status: 'reserved' }

  it('the old inline literal misses a reserved hold, which is how two seats happened', () => {
    // Not a hypothetical: this is the exact expression that shipped.
    expect(matchIn([hold], THE_OLD_LITERAL)).toHaveLength(0)
  })

  it('LIVE finds it, so the comp reuses the row instead of inserting a second seat', () => {
    expect(matchIn([hold], LIVE_TICKET_STATUSES)).toEqual([hold])
  })

  it('a cancelled ticket is still correctly ignored, so a comp can re-issue', () => {
    expect(matchIn([{ id: 'x', status: 'cancelled' }], LIVE_TICKET_STATUSES)).toHaveLength(0)
    expect(matchIn([{ id: 'x', status: 'refunded' }], LIVE_TICKET_STATUSES)).toHaveLength(0)
  })
})

describe('the cancel sweep (F3): a held seat must be SWEPT', () => {
  it('the old inline literal leaves the hold on a cancelled event', () => {
    expect(matchIn([{ id: 'h', status: 'reserved' }], THE_OLD_LITERAL)).toHaveLength(0)
  })

  it('LIVE sweeps it, and the optimistic-lock guard matches it too', () => {
    // Both must contain reserved. Widening only the fetch would make the UPDATE
    // guard silently match zero rows: the sweep would look like it ran and change
    // nothing, which is a worse failure than the bug it replaced.
    expect(matchIn([{ id: 'h', status: 'reserved' }], LIVE_TICKET_STATUSES)).toHaveLength(1)
  })

  it('a hold routes to CANCEL, never to a refund, because it carries no payment', () => {
    // Mirrors the isPaid predicate in cancel-event. A `reserved` row cannot hold
    // a payment intent: the intent is written by the same update that flips the
    // row off `reserved`. Probed on production 2026-08-26, 4 of 4 reserved rows
    // priced at $70 with zero intents.
    const isPaid = (t: { status: string; price_cents: number; stripe_payment_intent_id: string | null }) =>
      !!t.stripe_payment_intent_id && t.price_cents > 0 &&
      (t.status === 'confirmed' || t.status === 'checked_in')

    expect(isPaid({ status: 'reserved', price_cents: 7000, stripe_payment_intent_id: null })).toBe(false)
    expect(isPaid({ status: 'confirmed', price_cents: 7000, stripe_payment_intent_id: 'pi_1' })).toBe(true)
  })
})

describe('choosing among live rows: heal a duplicate, never compound it', () => {
  it('prefers a settled seat, so a comp cannot overwrite a paid ticket', () => {
    const rows = [
      { id: 'hold', status: 'reserved' },
      { id: 'paid', status: 'confirmed' },
    ]
    expect(edge.pickTicketToReuse(rows)?.id).toBe('paid')
    expect(edge.pickTicketToReuse([...rows].reverse())?.id).toBe('paid')
  })

  it('checked_in outranks everything', () => {
    expect(edge.pickTicketToReuse([
      { id: 'a', status: 'confirmed' },
      { id: 'b', status: 'checked_in' },
    ])?.id).toBe('b')
  })

  it('returns a row for an unrecognised live status rather than null', () => {
    // Returning null would fall through to INSERT, which is the double seat.
    expect(edge.pickTicketToReuse([{ id: 'future', status: 'some_new_status' }])?.id).toBe('future')
  })

  it('returns null only when there is genuinely nothing to reuse', () => {
    expect(edge.pickTicketToReuse([])).toBeNull()
    expect(edge.pickTicketToReuse(null)).toBeNull()
    expect(edge.pickTicketToReuse(undefined)).toBeNull()
  })
})

describe('promotion: a comp settles an unpaid seat and nothing else', () => {
  it('promotes both unpaid states, and no settled one', () => {
    expect(edge.isUnsettledTicketStatus('pending')).toBe(true)
    expect(edge.isUnsettledTicketStatus('reserved')).toBe(true)
    expect(edge.isUnsettledTicketStatus('confirmed')).toBe(false)
    expect(edge.isUnsettledTicketStatus('checked_in')).toBe(false)
    expect(edge.isUnsettledTicketStatus('cancelled')).toBe(false)
    expect(edge.isUnsettledTicketStatus(null)).toBe(false)
    expect(edge.isUnsettledTicketStatus(undefined)).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  Bind the shipped sources, because a tested helper nobody calls is  */
/*  exactly how this class survived three static passes.               */
/* ------------------------------------------------------------------ */

describe('the audited edge functions name their status sets', () => {
  for (const site of EDGE_SITES) {
    it(`${site} spells no ticket-status list inline`, () => {
      const body = stripComments(read(site))
      const inline = Array.from(body.matchAll(/\.in\(\s*'status'\s*,\s*\[/g))
      expect(
        inline.length,
        `${site} filters event_tickets by a literal status array again. Use a named set ` +
        `from supabase/functions/_shared/ticket-status.ts, or the next status added to the ` +
        `enum is silently wrong here exactly as reserved was.`,
      ).toBe(0)
    })

    it(`${site} imports the shared sets`, () => {
      const body = stripComments(read(site))
      expect(body, `${site} must import from _shared/ticket-status.ts`)
        .toMatch(/from '\.\.\/_shared\/ticket-status\.ts'/)
      expect(body).toMatch(/LIVE_TICKET_STATUSES/)
    })
  }

  it('the comp sites promote via the UNSETTLED set, under an optimistic lock', () => {
    for (const site of EDGE_SITES.slice(0, 2)) {
      const body = stripComments(read(site))
      expect(body, `${site} must gate promotion on isUnsettledTicketStatus`)
        .toMatch(/isUnsettledTicketStatus\(existing\.status\)/)
      // The guard on the UPDATE is what stops a just-paid ticket being rewritten
      // to price_cents 0 by a comp that raced the Stripe webhook.
      expect(body, `${site} promotion must carry the optimistic lock`)
        .toMatch(/\.in\('status', UNSETTLED_TICKET_STATUSES\)/)
    }
  })

  it('neither comp site uses maybeSingle on the idempotency lookup', () => {
    // maybeSingle returns an ERROR rather than a row when two match; both sites
    // dropped that error and fell through to INSERT, adding a third seat.
    for (const site of EDGE_SITES.slice(0, 2)) {
      const body = stripComments(read(site))
      const lookup = body.match(/\.in\('status', LIVE_TICKET_STATUSES\)([\s\S]{0,120})/)
      expect(lookup, `${site} has no LIVE idempotency lookup`).toBeTruthy()
      expect(lookup![1], `${site} still narrows the live-ticket lookup with maybeSingle`)
        .not.toMatch(/maybeSingle/)
      expect(body).toMatch(/pickTicketToReuse\(/)
    }
  })

  it('cancel-event sweeps the LIVE set at the fetch AND both update guards', () => {
    const body = stripComments(read('supabase/functions/cancel-event/index.ts'))
    const uses = Array.from(body.matchAll(/\.in\('status', LIVE_TICKET_STATUSES\)/g))
    // One fetch + two optimistic locks. Widening the fetch alone would make the
    // updates match nothing and the sweep would silently change zero rows.
    expect(uses.length, 'expected the fetch and both update guards to use LIVE').toBe(3)
  })
})
