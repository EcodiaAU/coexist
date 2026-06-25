import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  CheckCircle2,
  Calendar,
  MapPin,
  Clock,
  Ticket,
} from 'lucide-react'
import { useEventDetail, formatEventDate, formatEventTime } from '@/hooks/use-events'
import { useMyEventTicket } from '@/hooks/use-event-tickets'
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
  const { data: ticket, isLoading: ticketLoading } = useMyEventTicket(eventId)

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

  if (!event || !ticket) {
    return (
      <Page swipeBack header={<Header title="Your Ticket" back />}>
        <EmptyState
          illustration="error"
          title="Ticket not found"
          description="We couldn't find your ticket. It may still be processing."
          action={{ label: 'Back to Event', onClick: () => navigate(`/events/${eventId}`) }}
        />
      </Page>
    )
  }

  const isPending = ticket.status === 'pending'

  return (
    <Page swipeBack header={<Header title="Your Ticket" back />}>
      <div className="p-6 space-y-6 pb-12">
        {/* Success animation */}
        {!isPending && (
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

        {isPending && (
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
          {!isPending && (
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
              <span className={cn(
                'text-sm font-semibold',
                ticket.status === 'confirmed' ? 'text-success-600'
                  : ticket.status === 'checked_in' ? 'text-success-600'
                  : ticket.status === 'pending' ? 'text-warning-600'
                  : 'text-error-600',
              )}>
                {ticket.status === 'confirmed' ? 'Confirmed'
                  : ticket.status === 'checked_in' ? 'Checked In'
                  : ticket.status === 'pending' ? 'Pending'
                  : ticket.status}
              </span>
            </div>
          </div>
        </motion.div>

        {/* What's next */}
        {!isPending && (
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
