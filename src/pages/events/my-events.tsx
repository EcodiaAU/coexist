import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Calendar, Users, MapPin, Leaf } from 'lucide-react'
import {
  Page,
  Header,
  SegmentedControl,
  EmptyState,
  Badge,
} from '@/components'
import {
  useMyEvents,
  formatEventDate,
  ACTIVITY_TYPE_LABELS,
  type MyEventItem,
} from '@/hooks/use-events'
import { activityToBadge } from '@/lib/activity-types'
import { fadeUp, adminStagger as stagger } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

type Tab = 'upcoming' | 'invited' | 'past'

const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'invited', label: 'Invited' },
  { id: 'past', label: 'Past' },
]

const EMPTY_COPY: Record<Tab, { title: string; description: string }> = {
  upcoming: {
    title: 'No upcoming events',
    description: 'Events you register for show up here.',
  },
  invited: {
    title: 'No invitations',
    description: 'When a collective invites you to an event, it lands here.',
  },
  past: {
    title: 'No past events',
    description: 'Events you have attended show up here.',
  },
}

/* ------------------------------------------------------------------ */
/*  Row                                                                */
/* ------------------------------------------------------------------ */

function EventRow({ ev, onOpen }: { ev: MyEventItem; onOpen: () => void }) {
  const showStatus =
    ev.registration_status === 'invited' || ev.registration_status === 'waitlisted'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ev.title}
      className="w-full flex items-center gap-3 p-2.5 rounded-md bg-white ring-1 ring-primary-100 shadow-sm text-left active:scale-[0.99] transition-transform duration-150 cursor-pointer select-none"
    >
      <div className="w-16 h-16 rounded-sm overflow-hidden shrink-0 bg-neutral-50">
        {ev.cover_image_url ? (
          <img src={ev.cover_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Leaf size={20} className="text-neutral-300" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant="activity" activity={activityToBadge[ev.activity_type] ?? 'other'} size="sm">
            {ACTIVITY_TYPE_LABELS[ev.activity_type] ?? ev.activity_type}
          </Badge>
          {showStatus && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary-600">
              {ev.registration_status === 'invited' ? 'Invited' : 'Waitlisted'}
            </span>
          )}
        </div>
        <p className="text-sm font-bold text-neutral-900 truncate">{ev.title}</p>
        <p className="text-[12px] text-neutral-500 flex items-center gap-1.5 mt-0.5">
          <Calendar size={12} className="shrink-0 text-neutral-400" />
          <span className="truncate">{formatEventDate(ev.date_start, ev.timezone ?? undefined)}</span>
        </p>
        {ev.collectives && (
          <p className="text-[12px] text-neutral-500 flex items-center gap-1.5">
            <Users size={12} className="shrink-0 text-neutral-400" />
            <span className="truncate">{ev.collectives.name}</span>
          </p>
        )}
        {ev.address && (
          <p className="text-[12px] text-neutral-500 flex items-center gap-1.5">
            <MapPin size={12} className="shrink-0 text-neutral-400" />
            <span className="truncate">{ev.address}</span>
          </p>
        )}
      </div>
    </button>
  )
}

function RowSkeleton() {
  return (
    <div className="w-full flex items-center gap-3 p-2.5 rounded-md bg-white ring-1 ring-primary-100 shadow-sm animate-pulse">
      <div className="w-16 h-16 rounded-sm bg-neutral-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-neutral-100 rounded-sm w-1/3" />
        <div className="h-3.5 bg-neutral-100 rounded-sm w-3/4" />
        <div className="h-3 bg-neutral-50 rounded-sm w-1/2" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MyEventsPage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const [tab, setTab] = useState<Tab>('upcoming')

  const { data: events, isLoading, isError } = useMyEvents(tab)

  return (
    <Page noBackground header={<Header title="My Events" back showTitle />}>
      <div className="pt-2 pb-8 space-y-4">
        <SegmentedControl
          segments={TABS}
          value={tab}
          onChange={setTab}
          variant="pill"
          aria-label="Filter my events"
        />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            illustration="error"
            title="Couldn't load your events"
            description="Please try again in a moment."
          />
        ) : !events || events.length === 0 ? (
          <EmptyState
            illustration="empty"
            title={EMPTY_COPY[tab].title}
            description={EMPTY_COPY[tab].description}
            action={{ label: 'Discover events', onClick: () => navigate('/explore') }}
          />
        ) : (
          <motion.div
            variants={shouldReduceMotion ? undefined : stagger}
            initial="hidden"
            animate="visible"
            className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0"
          >
            {events.map((ev) => (
              <motion.div key={`${ev.id}-${ev.registration_status}`} variants={shouldReduceMotion ? undefined : fadeUp}>
                <EventRow ev={ev} onOpen={() => navigate(`/events/${ev.id}`)} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </Page>
  )
}
