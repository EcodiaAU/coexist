import { useState } from 'react'
import { Ticket, Check, Users } from 'lucide-react'
import { Button } from '@/components/button'
import { cn } from '@/lib/utils'
import {
  useMyWaitlistState,
  useJoinWaitlist,
  useLeaveWaitlist,
} from '@/hooks/use-event-waitlist'

/**
 * The join-the-waitlist panel for a SOLD-OUT ticketed event.
 *
 * One component, two surfaces, because the sold-out dead end existed in both
 * places and fixing only one would leave the other half of the demand
 * unrecorded:
 *   - in the app (src/pages/events/event-detail.tsx), where the member is
 *     signed in and their email is already known, so joining is one tap;
 *   - on the public event page (src/pages/public/event.tsx), which has no auth
 *     context at all, so it collects a name and an email.
 *
 * Joining deliberately does NOT create an account. guest-ticket-checkout mints
 * a shell auth user at BUY time by design; doing it at INTEREST time would put
 * strangers into profiles, membership counts and collective rosters on the
 * strength of a form fill.
 */

interface WaitlistJoinProps {
  eventId: string
  /** Known email for a signed-in member. Absent renders the guest form. */
  authedEmail?: string | null
  authedName?: string | null
  ticketTypeId?: string | null
  /** 'app' or 'public', recorded on the row so demand can be attributed. */
  source?: 'app' | 'public'
  /** Compact treatment for the in-app card, roomier for the public page. */
  variant?: 'app' | 'public'
  /**
   * The host surface already renders its own "Sold out" heading and held-spot
   * note (the public event page does). Suppresses both here so the panel does
   * not say "Sold out" twice, one nested inside the other.
   */
  embedded?: boolean
  className?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function WaitlistJoin({
  eventId,
  authedEmail,
  authedName,
  ticketTypeId,
  source = 'app',
  variant = 'app',
  embedded = false,
  className,
}: WaitlistJoinProps) {
  // A guest's address only exists in this component's state, so remember what
  // they joined with; without it the page cannot show them their own place
  // after a refresh and would offer them the join form all over again.
  const [guestEmail, setGuestEmail] = useState('')
  const [guestName, setGuestName] = useState('')
  const [joinedEmail, setJoinedEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lookupEmail = authedEmail ?? joinedEmail
  const { data: state } = useMyWaitlistState(eventId, lookupEmail)
  const join = useJoinWaitlist()
  const leave = useLeaveWaitlist()

  const onJoin = async () => {
    setError(null)
    const email = (authedEmail ?? guestEmail).trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address')
      return
    }
    try {
      await join.mutateAsync({
        eventId,
        email,
        name: authedName ?? (guestName.trim() || null),
        ticketTypeId,
        source,
      })
      setJoinedEmail(email)
    } catch (e) {
      setError((e as Error).message || 'Could not join the waitlist')
    }
  }

  const onLeave = async () => {
    setError(null)
    try {
      await leave.mutateAsync({ eventId, email: lookupEmail })
      setJoinedEmail(null)
    } catch (e) {
      setError((e as Error).message || 'Could not leave the waitlist')
    }
  }

  const pad = variant === 'public' ? 'p-5' : 'px-5 py-4'

  /* -------- already waiting -------- */
  if (state?.waiting) {
    return (
      <div className={cn('rounded-md border border-primary-200 bg-primary-50', pad, className)}>
        <div className="flex items-center gap-2">
          <Check size={18} className="text-primary-600" />
          <p className="font-heading text-base font-semibold text-neutral-900">
            You're on the waitlist
          </p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">
          {state.position === 1
            ? "You're first in line. If a ticket comes back it is offered to you before anyone else."
            : `You're number ${state.position} in line.`}
          {' '}We will email you the moment a spot opens, and you get 24 hours to take it before it
          passes to the next person.
        </p>
        {state.notified_at && (
          <p className="mt-2 text-sm font-semibold leading-relaxed text-primary-700">
            A spot has been offered to you. Check your email for the link to buy it.
          </p>
        )}
        <button
          type="button"
          onClick={onLeave}
          disabled={leave.isPending}
          className="mt-3 text-xs font-semibold text-neutral-500 underline underline-offset-2 disabled:opacity-50"
        >
          {leave.isPending ? 'Leaving...' : 'Leave the waitlist'}
        </button>
        {error && <p className="mt-2 text-xs text-error-600">{error}</p>}
      </div>
    )
  }

  /* -------- join -------- */
  return (
    <div
      className={cn(
        embedded
          ? 'border-t border-neutral-200 pt-4'
          : cn('rounded-md border border-neutral-200 bg-neutral-50', pad),
        className,
      )}
    >
      {!embedded && (
        <div className="flex items-center gap-2">
          <Ticket size={18} className="text-neutral-400" />
          <p className="font-heading text-base font-semibold text-neutral-900">Sold out</p>
        </div>
      )}
      <p className={cn('text-sm leading-relaxed text-neutral-600', !embedded && 'mt-2')}>
        {embedded
          ? 'Join the waitlist and we will email you if a ticket comes back, in the order people joined.'
          : 'Every spot has been taken. Join the waitlist and we will email you if a ticket comes back, in the order people joined.'}
      </p>

      {!authedEmail && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            className="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          />
          <input
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Your email"
            className="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          />
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="mt-3"
        icon={<Users size={18} />}
        loading={join.isPending}
        onClick={onJoin}
      >
        Join the waitlist
      </Button>

      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}

      {!embedded && (
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Been told a spot is held for you? It still is, and this page says sold out either way
          because your spot is one of the ones counted here. Open the pay-to-confirm link from your
          email, or sign in and open this event, and you can pay for it there.
        </p>
      )}
    </div>
  )
}
