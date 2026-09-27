import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  ticketReleaseState,
  RELEASE_STATE_COPY,
  MY_TICKETS_OR_FILTER,
} from '@/lib/ticket-release'
import { TICKET_TERMS, TICKET_TERMS_PENDING, TICKET_TERMS_PLACEHOLDER, ticketTermsCopy } from '@/lib/ticket-terms'
import {
  runResaleRefundSweep,
  type ResaleClaimRow,
  type ResaleSweepDeps,
} from '../../supabase/functions/_shared/resale-refunds'

/**
 * Release on resale (2026-09-27). Inside the refund cutoff a member releases
 * their ticket; the seat goes back on sale and they are refunded in full once
 * someone else buys a paid ticket. The PAIRING is SQL (claim_resale_refunds,
 * proven by a rolled-back DB battery). What is pinned here is everything around
 * it: what the member is shown, the exact terms wording, the money-moving sweep
 * and the hook that asks for a release.
 */

/* ------------------------------------------------------------------ */
/*  What the member sees about a released ticket                       */
/* ------------------------------------------------------------------ */

describe('ticketReleaseState', () => {
  const NOW = new Date('2026-10-01T00:00:00Z')
  const FUTURE = '2026-10-04T00:00:00Z'
  const PAST = '2026-09-28T00:00:00Z'

  it('is null for a ticket that was never released, whatever its status', () => {
    for (const status of ['confirmed', 'cancelled', 'refunded', 'checked_in', 'reserved', 'pending']) {
      expect(ticketReleaseState({ status, released_at: null, event_date: FUTURE }, NOW)).toBeNull()
    }
  })

  it('awaiting while the event is ahead and no refund has landed', () => {
    expect(ticketReleaseState({ status: 'cancelled', released_at: PAST, event_date: FUTURE }, NOW)).toBe('awaiting')
  })

  it('refunded once Stripe accepted it, or once the webhook flipped the status', () => {
    expect(ticketReleaseState(
      { status: 'cancelled', released_at: PAST, resale_refunded_at: PAST, event_date: FUTURE }, NOW,
    )).toBe('refunded')
    // The webhook can land before the sweep stamps resale_refunded_at.
    expect(ticketReleaseState({ status: 'refunded', released_at: PAST, event_date: FUTURE }, NOW)).toBe('refunded')
  })

  it('not_resold once the event started with nobody paired', () => {
    expect(ticketReleaseState({ status: 'cancelled', released_at: PAST, event_date: PAST }, NOW)).toBe('not_resold')
  })

  it('a pairing made before the event still reads as awaiting after it (refund in flight)', () => {
    expect(ticketReleaseState(
      { status: 'cancelled', released_at: PAST, resold_by_ticket_id: 'buyer', event_date: PAST }, NOW,
    )).toBe('awaiting')
  })

  it('the awaiting copy is the exact promised sentence', () => {
    expect(RELEASE_STATE_COPY.awaiting).toBe("Released. You'll be refunded when someone takes your spot.")
  })

  it('My Tickets asks for every live ticket plus any released one', () => {
    expect(MY_TICKETS_OR_FILTER).toBe('status.in.(confirmed,checked_in,reserved),released_at.not.is.null')
  })
})

/* ------------------------------------------------------------------ */
/*  Terms: supplied wording, still held back                            */
/* ------------------------------------------------------------------ */

describe('ticket terms', () => {
  it('carries the supplied wording verbatim', () => {
    expect(TICKET_TERMS.refund).toBe(
      "Can't make it? Refund your ticket in the app up to 7 days before the event. Inside 7 days you can release it instead: it goes back on sale, and you're refunded in full as soon as someone else buys it. If nobody does, it isn't refunded.",
    )
    expect(TICKET_TERMS.transfer).toBe(
      'You can pass your ticket to a friend any time before the event. They take your spot. Nothing is refunded, so sort payment between you.',
    )
    expect(TICKET_TERMS.heldSpot).toBe(
      "We've held a spot for you. Pay by the date shown to confirm it, or it goes to the next person on the waitlist.",
    )
  })

  it('is STILL PENDING: members see the placeholder until Tate says yes', () => {
    expect(TICKET_TERMS_PENDING).toBe(true)
    expect(ticketTermsCopy('refund')).toBe(TICKET_TERMS_PLACEHOLDER)
    expect(ticketTermsCopy('heldSpot')).toBe(TICKET_TERMS_PLACEHOLDER)
  })
})

/* ------------------------------------------------------------------ */
/*  The money-moving sweep                                              */
/* ------------------------------------------------------------------ */

const row = (id: string, pi: string | null = `pi_${id}`): ResaleClaimRow => ({
  ticket_id: id,
  stripe_payment_intent_id: pi,
  event_id: 'ev',
  user_id: `user_${id}`,
  resold_by_ticket_id: `buyer_${id}`,
  is_retry: false,
})

function deps(rows: ResaleClaimRow[], refund: ResaleSweepDeps['refund']) {
  const marked: string[] = []
  const released: string[] = []
  const d: ResaleSweepDeps = {
    claim: async () => ({ data: rows, error: null }),
    refund,
    markRefunded: async (id) => { marked.push(id); return { error: null } },
    releaseClaim: async (id) => { released.push(id); return { error: null } },
    now: () => '2026-10-01T00:00:00.000Z',
  }
  return { d, marked, released }
}

describe('runResaleRefundSweep', () => {
  it('refunds each paired release against its own intent and stamps it', async () => {
    const refund = vi.fn().mockResolvedValue({ id: 're_1' })
    const { d, marked, released } = deps([row('a'), row('b')], refund)
    const out = await runResaleRefundSweep(d)
    expect(refund.mock.calls.map((c) => c[0])).toEqual(['pi_a', 'pi_b'])
    expect(marked).toEqual(['a', 'b'])
    expect(released).toEqual([])
    expect(out).toMatchObject({ claimed: 2, refunded: 2, failed: 0 })
  })

  it('"already refunded" is success, never a retry loop', async () => {
    const refund = vi.fn().mockRejectedValue(new Error('Charge ch_1 has already been refunded.'))
    const { d, marked, released } = deps([row('a')], refund)
    const out = await runResaleRefundSweep(d)
    expect(marked).toEqual(['a'])
    expect(released).toEqual([])
    expect(out.refunded).toBe(1)
  })

  it('a Stripe failure gives the pairing back and never stamps it refunded', async () => {
    const refund = vi.fn()
      .mockRejectedValueOnce(new Error('card network down'))
      .mockResolvedValueOnce({ id: 're_2' })
    const { d, marked, released } = deps([row('a'), row('b')], refund)
    const out = await runResaleRefundSweep(d)
    // The failure does not stop the next row.
    expect(released).toEqual(['a'])
    expect(marked).toEqual(['b'])
    expect(out).toMatchObject({ claimed: 2, refunded: 1, failed: 1 })
    expect(out.errors.join(' ')).toMatch(/card network down/)
  })

  it('a row with no intent is given back, never refunded', async () => {
    const refund = vi.fn()
    const { d, marked, released } = deps([row('a', null)], refund)
    const out = await runResaleRefundSweep(d)
    expect(refund).not.toHaveBeenCalled()
    expect(marked).toEqual([])
    expect(released).toEqual(['a'])
    expect(out.failed).toBe(1)
  })

  it('a claim error moves no money', async () => {
    const refund = vi.fn()
    const out = await runResaleRefundSweep({
      claim: async () => ({ data: null, error: { message: 'permission denied' } }),
      refund,
      markRefunded: async () => ({ error: null }),
      releaseClaim: async () => ({ error: null }),
    })
    expect(refund).not.toHaveBeenCalled()
    expect(out).toMatchObject({ claimed: 0, refunded: 0 })
    expect(out.errors).toEqual(['claim: permission denied'])
  })

  it('a stamp failure after the money moved is reported, and not given back', async () => {
    // Giving it back would let a DIFFERENT buyer pair it. The 15-minute
    // re-offer retries the stamp instead, and Stripe answers "already refunded".
    const refund = vi.fn().mockResolvedValue({})
    const released: string[] = []
    const out = await runResaleRefundSweep({
      claim: async () => ({ data: [row('a')], error: null }),
      refund,
      markRefunded: async () => ({ error: { message: 'timeout' } }),
      releaseClaim: async (id) => { released.push(id); return { error: null } },
    })
    expect(released).toEqual([])
    expect(out.refunded).toBe(1)
    expect(out.errors).toEqual(['a: stamp timeout'])
  })
})

/* ------------------------------------------------------------------ */
/*  useReleaseMyTicket                                                  */
/* ------------------------------------------------------------------ */

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}))
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))

const { useReleaseMyTicket } = await import('@/hooks/use-event-tickets')

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

describe('useReleaseMyTicket', () => {
  beforeEach(() => invoke.mockReset())

  it('asks self-service-ticket for a release of exactly this ticket', async () => {
    invoke.mockResolvedValue({ data: { ok: true, action: 'released' }, error: null })
    const { result } = renderHook(() => useReleaseMyTicket(), { wrapper })
    const res = await result.current.mutateAsync({ ticketId: 't-1', eventId: 'e-1' })
    expect(invoke).toHaveBeenCalledWith('self-service-ticket', {
      body: { action: 'release', ticket_id: 't-1' },
    })
    expect(res?.action).toBe('released')
  })

  it("surfaces the server's own refusal, not a generic one", async () => {
    const ctx = new Response(JSON.stringify({ error: 'Releasing a ticket is not available for this event' }), { status: 400 })
    invoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context: ctx } })
    const { result } = renderHook(() => useReleaseMyTicket(), { wrapper })
    await expect(result.current.mutateAsync({ ticketId: 't-1' }))
      .rejects.toThrow('Releasing a ticket is not available for this event')
  })
})
