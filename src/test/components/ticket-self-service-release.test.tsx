import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Release on resale, in the sheet (2026-09-27). Inside the refund cutoff the
 * server answers can_release instead of can_refund. The sheet must offer
 * "Release my ticket", say plainly what that means for the money BEFORE the
 * member commits, and only then call the release. The load-bearing case is
 * "opens without releasing": a test that only asserted the confirm button
 * existed would pass against a sheet that released on the first tap.
 */

type Policy = Record<string, unknown>
let policy: Policy
const releaseMutateAsync = vi.fn().mockResolvedValue({ ok: true, action: 'released' })
const refundMutateAsync = vi.fn()

vi.mock('@/hooks/use-event-tickets', () => ({
  useTicketSelfService: () => ({ data: policy, isLoading: false }),
  useMyTicketTransfers: () => ({ data: [] }),
  useSelfRefundTicket: () => ({ mutateAsync: refundMutateAsync, isPending: false }),
  useReleaseMyTicket: () => ({ mutateAsync: releaseMutateAsync, isPending: false }),
  useStartTicketTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelTicketTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

const toastSuccess = vi.fn()
vi.mock('@/components/toast', () => ({
  useToast: () => ({ toast: { success: toastSuccess, info: vi.fn(), error: vi.fn() } }),
}))

import { TicketSelfServiceSheet, blockedCopy } from '@/components/ticket-self-service-sheet'

const INSIDE_CUTOFF_PAID: Policy = {
  found: true, status: 'confirmed', is_paid: true, price_cents: 8000,
  can_refund: false, can_transfer: false, can_release: true,
  refund_enabled_for_event: true, blocked_reason: 'past_refund_cutoff',
}

const RELEASE = /release my ticket/i

/**
 * BottomSheet mounts its overlay at pointer-events:none and flips it on a
 * double rAF, so a tap in the same tick as the open is refused. Wait for the
 * whole ancestor chain to accept input, which is what a real finger does too.
 */
async function clickable(el: HTMLElement) {
  await waitFor(() => {
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      expect(window.getComputedStyle(n).pointerEvents).not.toBe('none')
    }
  })
  return el
}

async function openRelease(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await clickable(await screen.findByRole('button', { name: RELEASE })))
  return clickable(await screen.findByRole('button', { name: RELEASE }))
}

describe('TicketSelfServiceSheet: release on resale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    policy = { ...INSIDE_CUTOFF_PAID }
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
  })

  it('offers release, not refund, inside the cutoff, and does not call it a dead end', () => {
    render(<TicketSelfServiceSheet ticketId="t-1" eventId="e-1" open onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: RELEASE })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refund my ticket/i })).toBeNull()
    expect(screen.queryByText('The refund window for this event has closed.')).toBeNull()
    expect(screen.getByText(/you can release your ticket below/i)).toBeInTheDocument()
  })

  it('opens the confirmation and releases nothing on the first tap', async () => {
    const user = userEvent.setup()
    render(<TicketSelfServiceSheet ticketId="t-1" eventId="e-1" open onClose={vi.fn()} />)
    await openRelease(user)
    expect(screen.getByText(/goes back on sale/i)).toBeInTheDocument()
    expect(screen.getByText(/refunded in full, automatically/i)).toBeInTheDocument()
    expect(screen.getByText(/if nobody buys one before the event, you won't be refunded/i)).toBeInTheDocument()
    expect(releaseMutateAsync).not.toHaveBeenCalled()
  })

  it('releases on the confirm tap, for this ticket, and says what happens next', async () => {
    const user = userEvent.setup()
    render(<TicketSelfServiceSheet ticketId="t-1" eventId="e-1" open onClose={vi.fn()} />)
    const confirm = await openRelease(user)
    await user.click(confirm)
    expect(releaseMutateAsync).toHaveBeenCalledWith({ ticketId: 't-1', eventId: 'e-1' })
    expect(refundMutateAsync).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith("Released. You'll be refunded when someone takes your spot.")
  })

  it('never promises a refund on a $0 ticket', async () => {
    policy = { ...INSIDE_CUTOFF_PAID, is_paid: false, price_cents: 0 }
    const user = userEvent.setup()
    render(<TicketSelfServiceSheet ticketId="t-1" eventId="e-1" open onClose={vi.fn()} />)
    await openRelease(user)
    expect(screen.queryByText(/refunded/i)).toBeNull()
    expect(screen.getByText(/goes back on sale for someone else/i)).toBeInTheDocument()
  })

  it('shows no release when the server does not offer it (flag off)', () => {
    policy = { ...INSIDE_CUTOFF_PAID, can_release: false, refund_enabled_for_event: false, blocked_reason: null }
    render(<TicketSelfServiceSheet ticketId="t-1" eventId="e-1" open onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: RELEASE })).toBeNull()
    expect(screen.getByText(/handled by the organiser/i)).toBeInTheDocument()
  })

  it('shows the terms placeholder, not the real wording, while terms are pending', () => {
    render(<TicketSelfServiceSheet ticketId="t-1" eventId="e-1" open onClose={vi.fn()} />)
    expect(screen.getByText(/ticket terms are being finalised/i)).toBeInTheDocument()
    expect(screen.queryByText(/can't make it\?/i)).toBeNull()
  })
})

describe('blockedCopy', () => {
  it('keeps the old dead-end copy when release is not on offer', () => {
    expect(blockedCopy('past_refund_cutoff', true, false)).toBe('The refund window for this event has closed.')
  })
  it('points at release when it is', () => {
    expect(blockedCopy('past_refund_cutoff', true, true)).toMatch(/release your ticket below/)
  })
})
