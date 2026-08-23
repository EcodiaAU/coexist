import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { Ticket, Calendar, MapPin, ChevronRight, Clock, Settings2 } from 'lucide-react'
import { useMyTickets, type EventTicket } from '@/hooks/use-event-tickets'
import { TicketSelfServiceSheet } from '@/components/ticket-self-service-sheet'
import { formatEventDate, formatEventTime } from '@/hooks/use-events'
import {
  Page,
  Header,
  Skeleton,
  EmptyState,
} from '@/components'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { cn } from '@/lib/cn'

function TicketCard({ ticket, onManage }: { ticket: EventTicket; onManage: (t: EventTicket) => void }) {
  const navigate = useNavigate()
  const isPast = ticket.event_date ? new Date(ticket.event_date) < new Date() : false
  // A held spot is not a ticket yet: an organiser has reserved the seat and the
  // holder still has to pay. It must not read like a confirmed ticket.
  const isHeld = ticket.status === 'reserved'

  return (
    <StaggeredItem
      className={cn(
        'rounded-md overflow-hidden transition-all',
        isPast ? 'bg-neutral-50 opacity-70' : 'bg-white shadow-sm',
        isHeld && !isPast && 'ring-1 ring-warning-300/70',
      )}
    >
      <button
        type="button"
        onClick={() => navigate(
          isHeld
            ? `/events/${ticket.event_id}?pay_ticket=${ticket.id}`
            : `/events/${ticket.event_id}/ticket-confirmation?ticket_id=${ticket.id}`,
        )}
        className="w-full flex items-stretch text-left cursor-pointer active:scale-[0.98] transition-transform duration-150"
      >
        {/* Cover image strip */}
        {ticket.event_cover_image ? (
          <div className="w-20 shrink-0">
            <img
              src={ticket.event_cover_image}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className={cn(
            'w-20 shrink-0 flex items-center justify-center',
            isHeld ? 'bg-warning-500' : 'bg-sprout-500',
          )}>
            {isHeld
              ? <Clock size={24} className="text-white/70" />
              : <Ticket size={24} className="text-white/60" />}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 p-4">
          <p className="text-sm font-semibold text-neutral-900 truncate">
            {ticket.event_title ?? 'Event'}
          </p>

          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-neutral-500">
            {ticket.event_date && (
              <span className="flex items-center gap-1">
                <Calendar size={10} />
                {formatEventDate(ticket.event_date)}
              </span>
            )}
            {ticket.event_address && (
              <span className="flex items-center gap-1 truncate">
                <MapPin size={10} />
                {ticket.event_address}
              </span>
            )}
          </div>

          {isHeld && (
            <p className="mt-1.5 text-[11px] font-medium text-warning-700">
              Spot held for you. Pay ${(ticket.price_cents / 100).toFixed(2)} to confirm.
            </p>
          )}

          <div className="flex items-center gap-2 mt-2">
            {ticket.ticket_type_name && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-500 uppercase tracking-wide">
                {ticket.ticket_type_name}
              </span>
            )}
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide',
              ticket.status === 'confirmed' || ticket.status === 'checked_in'
                ? 'bg-success-100 text-success-700'
                : 'bg-warning-100 text-warning-700',
            )}>
              {ticket.status === 'checked_in' ? 'Checked In'
                : isHeld ? 'Spot held'
                : ticket.status}
            </span>
            {ticket.ticket_code && !isHeld && (
              <span className="font-mono text-[10px] text-neutral-400">{ticket.ticket_code}</span>
            )}
          </div>
        </div>

        <div className="flex items-center pr-3 shrink-0">
          <ChevronRight size={16} className="text-neutral-300" />
        </div>
      </button>

      {/* Self-service lives on the card, not buried in the event page: the whole
          point is that a holder can act without chasing an organiser. Only for a
          live confirmed ticket on an upcoming event. */}
      {!isPast && ticket.status === 'confirmed' && (
        <div className="px-4 pb-3 -mt-1">
          <button
            type="button"
            onClick={() => onManage(ticket)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-700 hover:text-primary-900 py-1"
          >
            <Settings2 size={12} />
            Manage ticket
          </button>
        </div>
      )}
    </StaggeredItem>
  )
}

export default function MyTicketsPage() {
  const { data: tickets, isLoading } = useMyTickets()
  useReducedMotion()
  const [managing, setManaging] = useState<EventTicket | null>(null)

  const upcoming = (tickets ?? []).filter((t) => t.event_date && new Date(t.event_date) >= new Date())
  const past = (tickets ?? []).filter((t) => t.event_date && new Date(t.event_date) < new Date())

  return (
    <Page swipeBack header={<Header title="My Tickets" back />}>
      <div className="p-4 space-y-6 pb-12">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-md" />
            <Skeleton className="h-24 rounded-md" />
            <Skeleton className="h-24 rounded-md" />
          </div>
        ) : !tickets?.length ? (
          <EmptyState
            illustration="empty"
            title="No tickets yet"
            description="When you purchase tickets for events, they'll appear here."
            action={{ label: 'Explore Events', to: '/explore' }}
          />
        ) : (
          <>
            {upcoming.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3 px-1">
                  Upcoming
                </h3>
                <StaggeredList className="space-y-2">
                  {upcoming.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} onManage={setManaging} />
                  ))}
                </StaggeredList>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-1">
                  Past
                </h3>
                <StaggeredList className="space-y-2">
                  {past.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} onManage={setManaging} />
                  ))}
                </StaggeredList>
              </div>
            )}
          </>
        )}
      </div>

      {managing && (
        <TicketSelfServiceSheet
          ticketId={managing.id}
          eventId={managing.event_id}
          open={!!managing}
          onClose={() => setManaging(null)}
        />
      )}
    </Page>
  )
}
