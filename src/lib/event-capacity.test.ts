import { describe, it, expect } from 'vitest'
import {
  ticketSpotsTaken,
  ticketSpotsPaid,
  ticketSpotsHeld,
  ticketInventoryHeld,
  computeSpotsTaken,
  summariseTicketSales,
  SPOT_TAKING_TICKET_STATUSES,
  INVENTORY_HOLD_TICKET_STATUSES,
  GOING_REGISTRATION_STATUSES,
} from '@/lib/event-capacity'

/**
 * Fixture = the real event_tickets rows for the Myall Park campout
 * (event cfbe0ce1), the event Angelica reported as "25/30 banner vs 20 sold".
 * Probed live 2026-08-12: confirmed 22 (8 free price=0, 4 comp, 10 paid),
 * cancelled 8, refunded 1, checked_in 0. Registrations going = 25.
 */
const myallTickets = [
  ...Array.from({ length: 8 }, () => ({ status: 'confirmed', quantity: 1 })), // free
  ...Array.from({ length: 4 }, () => ({ status: 'confirmed', quantity: 1 })), // comp ($0 charged)
  ...Array.from({ length: 10 }, () => ({ status: 'confirmed', quantity: 1 })), // paid $80
  ...Array.from({ length: 8 }, () => ({ status: 'cancelled', quantity: 1 })),
  { status: 'refunded', quantity: 1 },
]

describe('event-capacity canonical count', () => {
  it('status sets are the agreed vocabulary', () => {
    expect(SPOT_TAKING_TICKET_STATUSES).toEqual(['confirmed', 'checked_in', 'reserved'])
    expect(INVENTORY_HOLD_TICKET_STATUSES).toEqual(['pending', 'confirmed', 'checked_in', 'reserved'])
    expect(GOING_REGISTRATION_STATUSES).toEqual(['registered', 'attended'])
  })

  it('ticketSpotsTaken counts confirmed + checked_in + reserved, excludes cancelled/refunded/pending', () => {
    // Myall: 22 confirmed occupy seats; the 8 cancelled + 1 refunded do not.
    expect(ticketSpotsTaken(myallTickets)).toBe(22)
  })

  it('ticketSpotsTaken counts free and comp tickets as occupied seats (occupancy != revenue)', () => {
    const rows = [
      { status: 'confirmed', quantity: 1 }, // free
      { status: 'confirmed', quantity: 1 }, // comp
    ]
    expect(ticketSpotsTaken(rows)).toBe(2)
  })

  it('ticketSpotsTaken sums quantity, not row count', () => {
    expect(ticketSpotsTaken([{ status: 'confirmed', quantity: 3 }])).toBe(3)
  })

  it('ticketSpotsTaken defaults a null quantity to 1', () => {
    expect(ticketSpotsTaken([{ status: 'confirmed', quantity: null }])).toBe(1)
  })

  it('checked_in still occupies a seat', () => {
    expect(ticketSpotsTaken([{ status: 'checked_in', quantity: 1 }])).toBe(1)
  })

  it('ticketInventoryHeld includes pending (checkout hold) but display count does not', () => {
    const rows = [
      { status: 'confirmed', quantity: 1 },
      { status: 'pending', quantity: 1 },
    ]
    expect(ticketInventoryHeld(rows)).toBe(2) // holds inventory during checkout
    expect(ticketSpotsTaken(rows)).toBe(1) // but only 1 seat is actually filled
  })

  it('empty / null input is 0, never throws', () => {
    expect(ticketSpotsTaken([])).toBe(0)
    expect(ticketSpotsTaken(null)).toBe(0)
    expect(ticketSpotsTaken(undefined)).toBe(0)
    expect(ticketInventoryHeld(null)).toBe(0)
  })

  it('computeSpotsTaken picks tickets for a ticketed event (Myall: 22, NOT the 25 RSVP count)', () => {
    expect(
      computeSpotsTaken({ isTicketed: true, ticketSpotsTaken: 22, registrationsGoing: 25 }),
    ).toBe(22)
  })

  it('computeSpotsTaken picks going registrations for a non-ticketed event', () => {
    expect(
      computeSpotsTaken({ isTicketed: false, ticketSpotsTaken: 0, registrationsGoing: 25 }),
    ).toBe(25)
  })

  it('the banner and the sales panel derive the SAME ticketed number (invariance)', () => {
    // Both surfaces feed ticketSpotsTaken(rows) for the buying layer, so a
    // ticketed event can never show one number on the banner and another in
    // the sales panel.
    const bannerNumber = computeSpotsTaken({
      isTicketed: true,
      ticketSpotsTaken: ticketSpotsTaken(myallTickets),
      registrationsGoing: 25,
    })
    const salesPanelSold = ticketSpotsTaken(myallTickets)
    expect(bannerNumber).toBe(salesPanelSold)
    expect(bannerNumber).toBe(22)
  })
})

/**
 * Organiser holds (status='reserved') - Angelica 2026-08-24.
 *
 * A held spot is a TAKEN seat (nobody else may buy it) but it is NOT paid
 * revenue. These two facts pulling apart is exactly what made the old
 * "comp = free ticket" model wrong, so they get pinned separately here.
 */
describe('reserved holds', () => {
  it('a hold occupies a seat', () => {
    expect(ticketSpotsTaken([{ status: 'reserved', quantity: 1 }])).toBe(1)
  })

  it('a hold is NOT counted as paid', () => {
    expect(ticketSpotsPaid([{ status: 'reserved', quantity: 1 }])).toBe(0)
    expect(ticketSpotsPaid([{ status: 'confirmed', quantity: 2 }])).toBe(2)
  })

  it('ticketSpotsHeld isolates unpaid holds', () => {
    const rows = [
      { status: 'confirmed', quantity: 3 },
      { status: 'reserved', quantity: 2 },
      { status: 'cancelled', quantity: 5 },
    ]
    expect(ticketSpotsHeld(rows)).toBe(2)
    expect(ticketSpotsTaken(rows)).toBe(5)
    expect(ticketSpotsPaid(rows)).toBe(3)
  })

  it('a hold holds inventory so it cannot be resold', () => {
    expect(ticketInventoryHeld([{ status: 'reserved', quantity: 1 }])).toBe(1)
  })

  it('taken always equals paid plus held', () => {
    const rows = [
      { status: 'confirmed', quantity: 4 },
      { status: 'checked_in', quantity: 1 },
      { status: 'reserved', quantity: 3 },
      { status: 'refunded', quantity: 2 },
      { status: 'pending', quantity: 1 },
    ]
    expect(ticketSpotsTaken(rows)).toBe(ticketSpotsPaid(rows) + ticketSpotsHeld(rows))
  })
})

/**
 * The leader sales panel reports SOLD and REVENUE off the same rows. They are
 * different questions: a held seat is occupied but unpaid. Summing price_cents
 * over the spot-taking set (rather than the paid set) silently told an organiser
 * they had earned the full price of every outstanding hold. Pinned here so the
 * money question can never quietly re-adopt the occupancy set.
 */
describe('summariseTicketSales', () => {
  const rows = [
    { status: 'confirmed', quantity: 1, price_cents: 8000, ticket_type_id: 'std' },
    { status: 'checked_in', quantity: 1, price_cents: 8000, ticket_type_id: 'std' },
    { status: 'reserved', quantity: 1, price_cents: 8000, ticket_type_id: 'std' },
    { status: 'cancelled', quantity: 1, price_cents: 8000, ticket_type_id: 'std' },
    { status: 'pending', quantity: 1, price_cents: 8000, ticket_type_id: 'std' },
  ]

  it('excludes the unpaid hold from revenue but counts its seat', () => {
    const s = summariseTicketSales(rows)
    expect(s.totalRevenue).toBe(16000)
    expect(s.totalSold).toBe(3)
    expect(s.totalHeld).toBe(1)
    expect(s.totalCheckedIn).toBe(1)
  })

  it('applies the same split per ticket type', () => {
    const s = summariseTicketSales(rows)
    expect(s.byType.std).toEqual({ sold: 3, revenue: 16000 })
  })

  it('totalSold matches the canonical ticketSpotsTaken helper', () => {
    expect(summariseTicketSales(rows).totalSold).toBe(ticketSpotsTaken(rows))
  })

  it('revenue matches paid seats, never taken seats', () => {
    const s = summariseTicketSales(rows)
    expect(s.totalRevenue).toBe(ticketSpotsPaid(rows) * 8000)
    expect(s.totalRevenue).not.toBe(ticketSpotsTaken(rows) * 8000)
  })

  it('handles no rows', () => {
    expect(summariseTicketSales([])).toEqual({
      totalRevenue: 0, totalSold: 0, totalHeld: 0, totalCheckedIn: 0, byType: {},
    })
    expect(summariseTicketSales(null)).toEqual({
      totalRevenue: 0, totalSold: 0, totalHeld: 0, totalCheckedIn: 0, byType: {},
    })
  })
})
