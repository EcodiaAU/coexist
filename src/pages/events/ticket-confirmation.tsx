import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { DIETARY_GATE_QUERY_KEY } from '@/lib/dietary'
import {
  CheckCircle2,
  Calendar,
  MapPin,
  Clock,
  Loader2,
  Ticket,
} from 'lucide-react'
import { useEventDetail, formatEventDate, formatEventTime } from '@/hooks/use-events'
import { useMyEventTicket } from '@/hooks/use-event-tickets'
import { isResolvingTicketStatus, ticketStatusText } from '@/lib/event-capacity'
import {
  Page,
  Header,
  Skeleton,
  EmptyState,
  WhatsNext,
} from '@/components'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'

export default function TicketConfirmationPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const { data: event, isLoading: eventLoading } = useEventDetail(eventId)
  // Bound the webhook-race poll window: keep polling for ~90s, then settle on
  // the real state (confirmed ticket, stuck-pending, or genuinely not found).
  const [windowExpired, setWindowExpired] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setWindowExpired(true), 90_000)
    return () => clearTimeout(t)
  }, [])
  const { data: ticket, isLoading: ticketLoading } = useMyEventTicket(eventId, {
    poll: !windowExpired,
  })
  const queryClient = useQueryClient()

  // Landing here means a ticket purchase or claim just completed (Stripe
  // redirect return or free claim). Re-run the dietary-gate eligibility
  // check so the gate fires immediately for buyers with no dietary answer
  // on file, instead of waiting for the next app open.
  useEffect(() => {
    if (ticket) {
      queryClient.invalidateQueries({ queryKey: DIETARY_GATE_QUERY_KEY })
    }
  }, [ticket, queryClient])

  const isLoading = eventLoading || ticketLoading
  const showLoading = useDelayedLoading(isLoading)

  if (showLoading) {
    return (
      <Page swipeBack header={<Header title="Your Ticket" back />}>
        <div className="p-6 space-y-6">
          <Skeleton className="h-48 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </div>
      </Page>
    )
  }

  // Webhook race: the ticket row may not exist yet. While the poll window is
  // open, show a neutral confirming spinner instead of a scary error.
  if (!ticket && !windowExpired) {
    return (
      <Page swipeBack header={<Header title="Your Ticket" back />}>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="w-10 h-10 text-neutral-400 animate-spin" />
          <p className="mt-4 text-sm font-medium text-neutral-600">Confirming your ticket...</p>
          <p className="mt-1 text-xs text-neutral-400">This can take a few seconds after payment.</p>
        </div>
      </Page>
    )
  }

  // Window elapsed and still nothing (or event missing): the genuine miss.
  if (!event || !ticket) {
    return (
      <Page swipeBack header={<Header title="Your Ticket" back />}>
        <EmptyState
          illustration="error"
          title="Ticket not found"
          description="We couldn't find your ticket. If you just paid, give it a moment and refresh, or contact us if it doesn't appear."
          action={{ label: 'Back to Event', onClick: () => navigate(`/events/${eventId}`) }}
        />
      </Page>
    )
  }

  // Still moving toward a final state: the webhook has not settled the row yet.
  // Read from the canonical resolving set, NOT `status === 'pending'`, so a
  // member who paid for an organiser hold (status `reserved` until the webhook
  // flips it) gets the same confirming treatment instead of a success animation
  // announcing a ticket they have not been given yet.
  const isResolving = isResolvingTicketStatus(ticket.status)
  const statusLine = ticketStatusText(ticket.status)

  return (
    <Page swipeBack header={<Header title="Your Ticket" back />}>
      <div className="p-6 space-y-6 pb-12">
        {/* Success animation */}
        {!isResolving && (
          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <motion.div
              initial={shouldReduceMotion ? undefined : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.1, type: 'spring', stiffness: 200 }}
              className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle2 size={32} className="text-success-600" />
            </motion.div>
            <h2 className="font-heading text-xl font-bold text-neutral-900">You're going!</h2>
            <p className="text-sm text-neutral-500 mt-1">Your ticket for {event.title} is confirmed.</p>
          </motion.div>
        )}

        {isResolving && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-warning-50 border border-warning-200/40">
            <Clock size={18} className="text-warning-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-warning-700">Payment processing</p>
              <p className="text-xs text-warning-600 mt-0.5">Your ticket will be confirmed once payment completes.</p>
            </div>
          </div>
        )}

        {/* Ticket card */}
        <motion.div
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-md bg-white border border-neutral-100 shadow-sm overflow-hidden"
        >
          {/* Event info header */}
          <div className="bg-neutral-50 p-5 border-b border-neutral-100">
            <h3 className="font-heading text-base font-bold text-neutral-900">{event.title}</h3>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {formatEventDate(event.date_start)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatEventTime(event.date_start)}
              </span>
              {event.address && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} />
                  <span className="truncate max-w-[200px]">{event.address}</span>
                </span>
              )}
            </div>
          </div>

          {/* On the day, your collective leader checks you in - the QR and
              check-in code are a leader-side tool, not shown to attendees. */}
          {!isResolving && (
            <div className="flex flex-col items-center text-center py-6 px-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-success-50">
                <CheckCircle2 size={24} className="text-success-600" />
              </div>
              <p className="text-sm font-semibold text-neutral-900 mt-3">You're all set</p>
              <p className="text-[12px] text-neutral-500 mt-1 max-w-[260px] leading-relaxed">
                Just turn up on the day - your collective leader will check you in. No need to show anything.
              </p>
            </div>
          )}

          {/* Ticket details */}
          <div className="px-5 pb-5 space-y-2">
            {ticket.ticket_type_name && (
              <div className="flex items-center justify-between py-2 border-t border-neutral-100">
                <span className="text-xs text-neutral-500">Ticket type</span>
                <span className="text-sm font-medium text-neutral-900">{ticket.ticket_type_name}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-2 border-t border-neutral-100">
              <span className="text-xs text-neutral-500">Quantity</span>
              <span className="text-sm font-medium text-neutral-900">{ticket.quantity}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-neutral-100">
              <span className="text-xs text-neutral-500">Total paid</span>
              <span className="text-sm font-bold text-neutral-900">
                ${(ticket.price_cents / 100).toFixed(2)} AUD
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-neutral-100">
              <span className="text-xs text-neutral-500">Status</span>
              <span className={cn('text-sm font-semibold', statusLine.className)}>
                {statusLine.label}
              </span>
            </div>
          </div>
        </motion.div>

        {/* What's next */}
        {!isResolving && (
          <WhatsNext
            suggestions={[
              {
                label: 'View Event',
                description: 'See full event details',
                icon: <Calendar size={18} />,
                to: `/events/${event.id}`,
              },
              {
                label: 'My Tickets',
                description: 'View all your tickets',
                icon: <Ticket size={18} />,
                to: '/profile/tickets',
              },
            ]}
          />
        )}
      </div>
    </Page>
  )
}
