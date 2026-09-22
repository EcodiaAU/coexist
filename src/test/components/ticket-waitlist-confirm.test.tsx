import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The organiser's "Email everyone waiting" button used to fire the blast on the
 * first click. One accidental tap emailed the whole queue, and nothing recalls
 * an email that has already left. These cases pin the gate that now sits in
 * front of it.
 *
 * The load-bearing case is "opens without sending": a test that only asserted
 * "Cancel does not send" would pass just as happily against a button that was
 * dead, so the open has to be asserted as an open AND as a non-send.
 */

// framer-motion is deliberately NOT mocked. At 375px BottomSheet takes its
// MobileSheet path, which is plain CSS, and Button renders a real motion.button
// that a blanket `motion` mock would replace with undefined (framer exports
// `motion` as a proxy, so spreading `actual.motion` yields no keys).

const notifyMutateAsync = vi.fn().mockResolvedValue({ ok: true, notified: 3 })
const removeMutate = vi.fn()
let waiting = 3

vi.mock('@/hooks/use-event-waitlist', () => ({
  useWaitlistSummary: () => ({
    data: { waiting, demand: waiting, converted: 0, notified: 0 },
  }),
  useWaitlistPeople: () => ({
    data: Array.from({ length: waiting }, (_, i) => ({
      id: `w${i}`,
      name: `Person ${i}`,
      email: `person${i}@example.com`,
      quantity: 1,
      notified_at: null,
    })),
  }),
  useRemoveFromWaitlist: () => ({ mutate: removeMutate }),
  useNotifyWaitlist: () => ({ mutateAsync: notifyMutateAsync, isPending: false }),
}))

vi.mock('@/components/toast', () => ({
  useToast: () => ({
    toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
  }),
}))

import { TicketWaitlistPanel } from '@/components/ticket-waitlist-panel'

const EVENT_ID = 'evt-1'
const TRIGGER = /email everyone waiting/i
const CONFIRM = /send the email/i

/**
 * BottomSheet mounts its overlay at pointer-events:none and flips it on a
 * double rAF, so a click fired in the same tick as the open is refused. Wait
 * for the sheet to accept input, which is what a real finger does too.
 */
async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: TRIGGER }))
  const confirm = await screen.findByRole('button', { name: CONFIRM })
  await waitFor(() => {
    // Walk the whole ancestor chain, which is what user-event does. Checking
    // one hand-picked node passes vacuously: closest('div.fixed') matches the
    // sheet panel, and the node that actually holds pointer-events:none is the
    // overlay above it.
    for (let el: HTMLElement | null = confirm; el; el = el.parentElement) {
      expect(window.getComputedStyle(el).pointerEvents).not.toBe('none')
    }
  })
  return confirm
}

describe('TicketWaitlistPanel: the waitlist blast asks first', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    waiting = 3
    Object.defineProperty(window, 'innerWidth', {
      writable: true, configurable: true, value: 375,
    })
  })

  it('opens the confirmation and sends nothing on the first click', async () => {
    const user = userEvent.setup()
    render(<TicketWaitlistPanel eventId={EVENT_ID} />)

    await user.click(screen.getByRole('button', { name: TRIGGER }))

    // The gate is open...
    expect(screen.getByText('Email 3 people?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CONFIRM })).toBeInTheDocument()
    // ...and nothing has been emailed.
    expect(notifyMutateAsync).not.toHaveBeenCalled()
  })

  it('names the real count so the organiser knows the blast radius', async () => {
    const user = userEvent.setup()
    render(<TicketWaitlistPanel eventId={EVENT_ID} />)
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    expect(screen.getByText(/all 3 people still waiting/i)).toBeInTheDocument()
  })

  it('says person, not people, when one is waiting', async () => {
    waiting = 1
    const user = userEvent.setup()
    render(<TicketWaitlistPanel eventId={EVENT_ID} />)
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    expect(screen.getByText('Email 1 person?')).toBeInTheDocument()
  })

  it('cancel dismisses the confirmation and still sends nothing', async () => {
    const user = userEvent.setup()
    render(<TicketWaitlistPanel eventId={EVENT_ID} />)

    await openConfirm(user)
    expect(screen.getByText('Email 3 people?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    // The sheet unmounts on its exit transition, which jsdom runs on a timer
    // rather than instantly, so this waits rather than asserting in the same tick.
    await waitFor(() =>
      expect(screen.queryByText('Email 3 people?')).not.toBeInTheDocument(),
    )
    expect(notifyMutateAsync).not.toHaveBeenCalled()
  })

  it('confirm is the only thing that sends, and it sends once', async () => {
    const user = userEvent.setup()
    render(<TicketWaitlistPanel eventId={EVENT_ID} />)

    const confirm = await openConfirm(user)
    await user.click(confirm)

    expect(notifyMutateAsync).toHaveBeenCalledTimes(1)
    expect(notifyMutateAsync).toHaveBeenCalledWith({ eventId: EVENT_ID })
  })

  it('closes after confirming, so a second send needs the gate again', async () => {
    const user = userEvent.setup()
    render(<TicketWaitlistPanel eventId={EVENT_ID} />)

    const confirm = await openConfirm(user)
    await user.click(confirm)

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: CONFIRM })).not.toBeInTheDocument(),
    )
    expect(notifyMutateAsync).toHaveBeenCalledTimes(1)
  })
})
