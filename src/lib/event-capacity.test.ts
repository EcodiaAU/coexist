import { describe, it, expect } from 'vitest'
import {
  ticketSpotsTaken,
  ticketInventoryHeld,
  computeSpotsTaken,
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
    expect(SPOT_TAKING_TICKET_STATUSES).toEqual(['confirmed', 'checked_in'])
    expect(INVENTORY_HOLD_TICKET_STATUSES).toEqual(['pending', 'confirmed', 'checked_in'])
    expect(GOING_REGISTRATION_STATUSES).toEqual(['registered', 'attended'])
  })

  it('ticketSpotsTaken counts confirmed + checked_in, excludes cancelled/refunded/pending', () => {
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
