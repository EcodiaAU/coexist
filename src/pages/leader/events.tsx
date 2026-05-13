import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    CalendarDays,
    MapPin,
    Users,
    Clock,
    ChevronRight,
    Search,
    UserCheck,
    AlertTriangle,
} from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useLeaderHeader, useLeaderContext } from '@/components/leader-layout'
import { useLeaderCollectiveScope } from '@/hooks/use-leader-collective-scope'
import { Dropdown } from '@/components/dropdown'
import { Header } from '@/components/header'
import { SearchBar } from '@/components/search-bar'
import { Badge } from '@/components/badge'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/cn'
import {
    ACTIVITY_TYPE_LABELS,
    formatEventDate,
} from '@/hooks/use-events'
import { useLeaderCollectiveEvents as useCollectiveEvents, useLeaderEventStats as useEventStats } from '@/hooks/use-leader-events'
import { activityToBadge } from '@/lib/activity-types'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

const statusStyles: Record<string, string> = {
  draft: 'bg-primary-100 text-primary-600',
  live: 'bg-success-100 text-success-700',
  cancelled: 'bg-error-100 text-error-700',
  completed: 'bg-primary-50 text-primary-400',
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'draft', label: 'Drafts' },
  { id: 'all', label: 'All' },
] as const


export default function LeaderEventsPage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { collectiveId } = useLeaderContext()
  const scopeCtx = useLeaderCollectiveScope()
  const [filter, setFilter] = useState<string>('upcoming')
  const [searchQuery, setSearchQuery] = useState('')

  useLeaderHeader('Events', { fullBleed: true })

  const collectiveScopeOptions = useMemo(() =>
    scopeCtx.availableCollectives.map((c) => ({
      value: c.id,
      label: c.name.replace(/\s+Collective$/i, '') + (c.state ? ` (${c.state})` : ''),
    })),
    [scopeCtx.availableCollectives],
  )

  const { data: allEvents, isLoading, isError } = useCollectiveEvents(collectiveId, filter)

  const events = useMemo(() => {
    if (!allEvents || !searchQuery.trim()) return allEvents
    const q = searchQuery.toLowerCase()
    return allEvents.filter((e) => e.title.toLowerCase().includes(q))
  }, [allEvents, searchQuery])
  const showLoading = useDelayedLoading(isLoading)
  const { data: stats } = useEventStats(collectiveId)

  /* Loading skeleton */
  if (showLoading) {
    return (
      <div className="relative min-h-dvh overflow-x-hidden bg-white">
        <Header title="Events" back transparent className="absolute left-0 right-0 z-30" />
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-14 space-y-6">
          <div className="flex flex-col items-center gap-2 pb-2">
            <div className="h-3 w-16 rounded-full bg-moss-200/40 animate-pulse" />
            <div className="h-8 w-40 rounded-lg bg-moss-200/30 animate-pulse" />
          </div>
          <div className="flex justify-center gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 w-24 rounded-2xl bg-white shadow-sm animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="h-10 rounded-xl bg-white/80 shadow-sm animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white shadow-sm animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        illustration="error"
        title="Couldn't load events"
        description="Something went wrong loading your events. Check your connection and try again."
        action={{ label: 'Retry', onClick: () => window.location.reload() }}
      />
    )
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* ── Bright airy background ── */}
      <div className="absolute inset-0 bg-white" />
      <Header title="Events" back transparent className="absolute left-0 right-0 z-30" />


      {/* ── Content ── */}
      <motion.div
        className="relative z-10 px-4 sm:px-6 lg:px-8 pt-14 space-y-5 pb-20"
        variants={rm ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* ── Hero title ── */}
        <motion.div
          variants={rm ? undefined : fadeUp}
          className="flex flex-col items-center justify-center text-center pb-2"
        >
          <p className="text-[11px] font-semibold text-moss-500 uppercase tracking-[0.2em]">
            {FILTERS.find((f) => f.id === filter)?.label ?? 'Events'}
          </p>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold text-neutral-900 mt-1.5">
            {(() => {
              const selectedCollective = scopeCtx.availableCollectives.find(
                (c) => c.id === scopeCtx.selectedCollectiveId,
              )
              const collectiveName = selectedCollective
                ? selectedCollective.name.replace(/\s+Collective$/i, '')
                : null
              return collectiveName ? `${collectiveName} Events` : 'Events'
            })()}
          </h1>
          {scopeCtx.showCollectiveSelector && collectiveScopeOptions.length > 1 && (
            <div className="mt-3">
              <Dropdown
                options={collectiveScopeOptions}
                value={scopeCtx.selectedCollectiveId ?? ''}
                onChange={scopeCtx.setSelectedCollectiveId}
                className="w-52"
              />
            </div>
          )}
        </motion.div>

        {/* ── Stat pills ── */}
        <motion.div variants={rm ? undefined : fadeUp} className="flex justify-center gap-3">
          {[
            { value: stats?.upcoming ?? 0, label: 'Upcoming', color: 'text-moss-700' },
            { value: stats?.past ?? 0, label: 'Past', color: 'text-neutral-900' },
            { value: stats?.drafts ?? 0, label: 'Drafts', color: 'text-neutral-500' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center rounded-2xl bg-white shadow-sm border border-neutral-100 px-5 py-3 min-w-[80px]">
              <span className={cn('font-heading text-2xl font-extrabold tabular-nums', s.color)}>{s.value}</span>
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mt-0.5">{s.label}</span>
            </div>
          ))}
        </motion.div>

        {/* ── Filter bar ── */}
        <motion.div variants={rm ? undefined : fadeUp}>
          <div className="flex gap-1 rounded-xl bg-white shadow-sm border border-neutral-100 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer select-none whitespace-nowrap',
                  filter === f.id
                    ? 'bg-moss-600 text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Search ── */}
        <motion.div variants={rm ? undefined : fadeUp}>
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search events..." compact />
        </motion.div>

        {/* ── Event list ── */}
        <AnimatePresence mode="wait" initial={false}>
        {!events || events.length === 0 ? (
          <motion.div
            key="empty"
            variants={rm ? undefined : fadeUp}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="flex flex-col items-center justify-center text-center py-16 rounded-2xl bg-white shadow-sm border border-neutral-100"
          >
            <div className="w-14 h-14 rounded-2xl bg-moss-50 flex items-center justify-center mb-4">
              <Search size={24} className="text-moss-400" />
            </div>
            <p className="font-heading text-base font-bold text-neutral-900 mb-1">
              {filter === 'upcoming' ? 'No upcoming events' : 'No events found'}
            </p>
            <p className="text-xs text-neutral-500 max-w-[240px]">
              Create your first conservation event and rally your collective.
            </p>
          </motion.div>
        ) : (
          <motion.div key="list" layout className="space-y-3">
            {events.map((event, idx) => {
              const regCount = event.event_registrations?.[0]?.count ?? 0
              const checkedIn = event.checked_in_count ?? 0
              const isPast = event.date_start && new Date(event.date_start) < new Date()
              const attendanceRate = isPast && regCount > 0 ? Math.round((checkedIn / regCount) * 100) : null
              const lowAttendance = attendanceRate !== null && attendanceRate < 50

              return (
                <motion.div
                  key={event.id}
                  variants={rm ? undefined : fadeUp}
                  custom={idx}
                >
                  <Link
                    to={`/events/${event.id}`}
                    className={cn(
                      'flex items-center gap-4 p-4 rounded-2xl bg-white shadow-sm border hover:shadow-md active:scale-[0.99] transition-[border-color,transform] duration-200',
                      lowAttendance ? 'border-warning-200' : 'border-neutral-100 hover:border-neutral-200',
                    )}
                  >
                    {/* Cover thumbnail */}
                    {event.cover_image_url ? (
                      <img
                        src={event.cover_image_url}
                        alt=""
                        className="w-16 h-16 rounded-xl object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-moss-50 to-moss-100 flex items-center justify-center shrink-0">
                        <CalendarDays size={24} className="text-moss-400" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-heading text-sm font-bold text-neutral-900 truncate">
                          {event.title}
                        </p>
                        {event.status && event.status !== 'published' && (
                          <span className={cn(
                            'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0',
                            statusStyles[event.status] ?? statusStyles.draft,
                          )}>
                            {event.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-moss-600 font-medium flex items-center gap-1">
                        <Clock size={11} className="shrink-0" />
                        {formatEventDate(event.date_start, event.timezone ?? undefined)}
                      </p>
                      {event.address && (
                        <p className="text-[11px] text-neutral-400 truncate flex items-center gap-1 mt-0.5">
                          <MapPin size={10} className="shrink-0" />
                          {event.address}
                        </p>
                      )}
                      {event.cohost_names.length > 0 && (
                        <p className="text-[11px] text-sprout-600 font-medium truncate flex items-center gap-1 mt-0.5">
                          <Users size={10} className="shrink-0" />
                          Co-hosted with {event.cohost_names.join(', ')}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                          <Users size={11} />
                          {regCount} registered
                        </span>
                        {(isPast || checkedIn > 0) && (
                          <span className={cn(
                            'text-[11px] font-semibold flex items-center gap-1',
                            lowAttendance ? 'text-warning-600' : 'text-moss-500',
                          )}>
                            <UserCheck size={11} />
                            {checkedIn} checked in
                            {attendanceRate !== null && (
                              <span className="ml-0.5">({attendanceRate}%)</span>
                            )}
                            {lowAttendance && <AlertTriangle size={10} className="ml-0.5" />}
                          </span>
                        )}
                        {event.activity_type && (
                          <Badge
                            variant="activity"
                            activity={activityToBadge[event.activity_type] ?? 'other'}
                            size="sm"
                          >
                            {ACTIVITY_TYPE_LABELS[event.activity_type] ?? event.activity_type}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <ChevronRight size={16} className="text-primary-200 group-hover:text-moss-500 shrink-0 transition-colors" />
                  </Link>
                </motion.div>
              )
            })}
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
