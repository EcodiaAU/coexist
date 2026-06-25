import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Ticket, Calendar, MapPin, ChevronRight } from 'lucide-react'
import { useMyTickets, type EventTicket } from '@/hooks/use-event-tickets'
import { formatEventDate, formatEventTime } from '@/hooks/use-events'
import {
  Page,
  Header,
  Skeleton,
  EmptyState,
} from '@/components'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'

function TicketCard({ ticket }: { ticket: EventTicket }) {
  const navigate = useNavigate()
  const isPast = ticket.event_date ? new Date(ticket.event_date) < new Date() : false

  return (
    <StaggeredItem
      className={cn(
        'rounded-md overflow-hidden transition-all',
        isPast ? 'bg-neutral-50 opacity-70' : 'bg-white shadow-sm',
      )}
    >
      <button
        type="button"
        onClick={() => navigate(`/events/${ticket.event_id}/ticket-confirmation?ticket_id=${ticket.id}`)}
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
          <div className="w-20 shrink-0 bg-sprout-500 flex items-center justify-center">
            <Ticket size={24} className="text-white/60" />
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

          <div className="flex items-center gap-2 mt-2">
            {ticket.ticket_type_name && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-500 uppercase tracking-wide">
                {ticket.ticket_type_name}
              </span>
            )}
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide',
              ticket.status === 'confirmed' ? 'bg-success-100 text-success-700'
                : ticket.status === 'checked_in' ? 'bg-success-100 text-success-700'
                : 'bg-warning-100 text-warning-700',
            )}>
              {ticket.status === 'checked_in' ? 'Checked In' : ticket.status}
            </span>
            {ticket.ticket_code && (
              <span className="font-mono text-[10px] text-neutral-400">{ticket.ticket_code}</span>
            )}
          </div>
        </div>

        <div className="flex items-center pr-3 shrink-0">
          <ChevronRight size={16} className="text-neutral-300" />
        </div>
      </button>
    </StaggeredItem>
  )
}

export default function MyTicketsPage() {
  const { data: tickets, isLoading } = useMyTickets()
  const showLoading = useDelayedLoading(isLoading)
  const shouldReduceMotion = useReducedMotion()

  const upcoming = (tickets ?? []).filter((t) => t.event_date && new Date(t.event_date) >= new Date())
  const past = (tickets ?? []).filter((t) => t.event_date && new Date(t.event_date) < new Date())

  return (
    <Page swipeBack header={<Header title="My Tickets" back />}>
      <div className="p-4 space-y-6 pb-12">
        {showLoading ? (
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
                    <TicketCard key={ticket.id} ticket={ticket} />
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
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))}
                </StaggeredList>
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
