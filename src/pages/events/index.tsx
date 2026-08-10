import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import {
  Calendar, MapPin, Users, Leaf, Filter,
  ArrowRight, ExternalLink, Search, X,
} from 'lucide-react'
import {
  useMyEvents,
  useDiscoverEvents,
  formatEventDate,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_OPTIONS,
  type DiscoverWhen,
} from '@/hooks/use-events'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { Database } from '@/types/database.types'
import { useCollectives, useMyCollectives } from '@/hooks/use-collective'
import {
  Page,
  Card,
  Badge, EmptyState, Dropdown, MultiSelect,
  WaveTransition, SegmentedControl,
} from '@/components'
import { useParallaxLayers } from '@/hooks/use-parallax-scroll'
import { cn } from '@/lib/cn'
import { activityToBadge, ACTIVITY_META } from '@/lib/activity-types'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { OfflineIndicator } from '@/components/offline-indicator'
import { PendingSyncBadge } from '@/components/pending-sync-badge'
import { CollectiveMap } from '@/components/collective-map'

type ActivityType = Database['public']['Enums']['activity_type']

const WHEN_OPTIONS: { value: DiscoverWhen; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'month', label: 'This month' },
]

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ title, count, action }: { title: string; count?: number; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-[15px] font-bold text-secondary-800 tracking-tight">
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500/15 text-[11px] font-bold text-primary-700 tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex items-center gap-1 text-xs font-semibold text-primary-500 min-h-11 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
        >
          {action.label} <ArrowRight size={12} />
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function ExploreHero({ rm }: { rm: boolean }) {
  const { bgRef, textRef } = useParallaxLayers({ textRange: 180, withScale: false })
  const [ready, setReady] = useState(false)

  // Decode the background before revealing the hero so it never flashes in.
  useEffect(() => {
    const bg = new Image()
    bg.src = '/img/explore-hero-bg.webp'
    bg.decode().catch(() => {}).then(() => setReady(true))
  }, [])

  return (
    <div className="relative">
      <div
        className="relative w-full h-[110vw] min-h-[480px] sm:h-auto overflow-hidden transition-opacity duration-300"
        style={{ opacity: ready ? 1 : 0 }}
      >
        <div ref={rm ? undefined : bgRef} className="h-full will-change-transform">
          <img
            src="/img/explore-hero-bg.webp"
            alt="Conservation landscape"
            className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
            loading="eager"
            fetchPriority="high"
          />
        </div>

        <div
          ref={rm ? undefined : textRef}
          className="absolute inset-x-0 top-[35%] sm:top-[22%] z-[2] flex flex-col items-center px-6 will-change-transform"
        >
          <span role="heading" aria-level={1} className="font-heading text-[2.5rem] sm:text-[3.5rem] lg:text-[5rem] font-bold uppercase text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] leading-[0.85] block">
            Explore
          </span>
        </div>
      </div>

      <WaveTransition />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function EventListSkeleton() {
  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rounded-md bg-white ring-1 ring-primary-100 shadow-md overflow-hidden animate-pulse">
          <div className="bg-neutral-100" style={{ aspectRatio: '2/1' }} />
          <div className="p-4 space-y-3">
            <div className="h-4 bg-neutral-100 rounded-sm w-3/4" />
            <div className="h-3 bg-neutral-100 rounded-sm w-1/2" />
            <div className="h-3 bg-neutral-50 rounded-sm w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab type                                                           */
/* ------------------------------------------------------------------ */

type ExploreTab = 'events' | 'collectives'

/* ------------------------------------------------------------------ */
/*  Main Explore Page                                                  */
/* ------------------------------------------------------------------ */

export default function ExplorePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const initialTab = searchParams.get('tab') === 'collectives' ? 'collectives' : 'events'
  const [activeTab, setActiveTab] = useState<ExploreTab>(initialTab)

  const [activityFilter, setActivityFilter] = useState<ActivityType | ''>('')
  const [collectiveIds, setCollectiveIds] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [whenFilter, setWhenFilter] = useState<DiscoverWhen>('any')
  const [stateFilter, setStateFilter] = useState('')

  // Debounce the free-text search and the collective multi-select so a
  // keystroke / a rapid series of toggles does not refetch on every change
  // (backlog F2: the collective filter flashed + refetched on every toggle).
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const debouncedCollectiveIds = useDebouncedValue(collectiveIds, 250)

  const { data: myUpcoming, isError: upcomingError, dataUpdatedAt, isFetching } = useMyEvents('upcoming')

  const {
    data: discoverData,
    isLoading: discoverLoading,
    isError: discoverError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDiscoverEvents({
    activityType: activityFilter,
    collectiveIds: debouncedCollectiveIds,
    search: debouncedSearch,
    state: stateFilter,
    when: whenFilter,
  })
  const discoverEvents = discoverData?.pages.flat()
  const discoverShowLoading = useDelayedLoading(discoverLoading)

  const { data: allCollectives = [] } = useCollectives()
  const { data: myCollectives } = useMyCollectives()

  // Collectives-tab search + state filter (over the already-loaded list, so
  // finding one by name is a query, not a scrub of the horizontal chip strip).
  const [collectiveSearch, setCollectiveSearch] = useState('')
  const [collectiveStateFilter, setCollectiveStateFilter] = useState('')
  const collectiveStates = useMemo(
    () => [...new Set(allCollectives.map((c) => c.state).filter(Boolean))].sort() as string[],
    [allCollectives],
  )
  const filteredCollectives = useMemo(() => {
    const q = collectiveSearch.trim().toLowerCase()
    return allCollectives.filter((c) =>
      (!q || c.name.toLowerCase().includes(q)) &&
      (!collectiveStateFilter || c.state === collectiveStateFilter),
    )
  }, [allCollectives, collectiveSearch, collectiveStateFilter])
  const collectiveFilterActive = !!collectiveSearch.trim() || !!collectiveStateFilter


  const collectiveOptions = (allCollectives).map((c) => ({ value: c.id, label: c.name }))

  // Distinct AU states present among collectives, for the state quick-filter.
  const stateOptions = Array.from(
    new Set(
      (allCollectives as { state?: string | null }[])
        .map((c) => c.state)
        .filter((s): s is string => !!s),
    ),
  ).sort()

  const hasActiveFilters =
    !!activityFilter ||
    collectiveIds.length > 0 ||
    !!searchInput.trim() ||
    !!stateFilter ||
    whenFilter !== 'any'

  const clearFilters = useCallback(() => {
    setActivityFilter('')
    setCollectiveIds([])
    setSearchInput('')
    setStateFilter('')
    setWhenFilter('any')
  }, [])

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-events'] }),
      queryClient.invalidateQueries({ queryKey: ['discover-events'] }),
      queryClient.invalidateQueries({ queryKey: ['collectives'] }),
      queryClient.invalidateQueries({ queryKey: ['my-collectives'] }),
    ])
  }, [queryClient])

  return (
    <Page noBackground className="!px-0 bg-primary-50/50" onRefresh={handleRefresh}>
      <div className="relative min-h-full">

        {/* ============================================================ */}
        {/*  Hero                                                         */}
        {/* ============================================================ */}
        <ExploreHero rm={!!shouldReduceMotion} />

        {/* ============================================================ */}
        {/*  Content on tinted bg                                         */}
        {/* ============================================================ */}
        <div className="relative z-10 -mt-1 bg-neutral-50">

          {/* Status bar */}
          <div className="flex items-center justify-end gap-1.5 px-4 lg:px-6 pt-1 pb-1">
            <OfflineIndicator dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} className="text-neutral-500" />
            <PendingSyncBadge />
          </div>

          {/* ── Tab toggle ── */}
          <div className="px-4 lg:px-6 mb-5">
            <SegmentedControl
              segments={[
                { id: 'events' as const, label: 'Events', icon: <Calendar size={15} /> },
                { id: 'collectives' as const, label: 'Collectives', icon: <Users size={15} /> },
              ]}
              value={activeTab}
              onChange={setActiveTab}
              variant="pill"
              aria-label="Browse events or collectives"
            />
          </div>

            <AnimatePresence mode="wait">

              {/* ======================================================== */}
              {/*  EVENTS TAB                                               */}
              {/* ======================================================== */}
              {activeTab === 'events' && (
                <motion.div
                  key="events-tab"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-7 pb-8"
                >
                  {upcomingError && discoverError && (
                    <div className="px-4 lg:px-6">
                      <EmptyState illustration="error" title="Something went wrong" description="We couldn't load events." action={{ label: 'Try again', onClick: handleRefresh }} />
                    </div>
                  )}

                  {/* ── Discover Events ── */}
                  <motion.section
                    className="px-4 lg:px-6"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.14 }}
                  >
                    <SectionHeader
                      title="Discover Events"
                      count={myUpcoming?.length}
                      action={{ label: 'My Events', onClick: () => navigate('/events/mine') }}
                    />

                    {/* Keyword search */}
                    <div className="relative mb-3">
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="search"
                        inputMode="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search events by name or place"
                        aria-label="Search events"
                        className="w-full h-11 rounded-full bg-white ring-1 ring-neutral-200 pl-9 pr-9 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                      />
                      {searchInput && (
                        <button
                          type="button"
                          onClick={() => setSearchInput('')}
                          aria-label="Clear search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 cursor-pointer select-none"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    {/* When quick-filter chips */}
                    <div className="flex gap-1.5 mb-3 overflow-x-auto hide-scrollbar -mx-1 px-1">
                      {WHEN_OPTIONS.map((opt) => {
                        const chipActive = whenFilter === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setWhenFilter(opt.value)}
                            aria-pressed={chipActive}
                            className={cn(
                              'shrink-0 min-h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer select-none',
                              chipActive
                                ? 'bg-primary-600 text-white shadow-sm'
                                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50',
                            )}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* Type / state / collective filters */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Filter size={14} className="text-neutral-400 shrink-0" />
                      <Dropdown
                        value={activityFilter}
                        onChange={(v) => setActivityFilter(v as ActivityType | '')}
                        options={[{ value: '', label: 'All types' }, ...ACTIVITY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]}
                        placeholder="Filter by type"
                        className="flex-1 min-w-[8rem]"
                      />
                      {stateOptions.length > 0 && (
                        <Dropdown
                          value={stateFilter}
                          onChange={(v) => setStateFilter(v as string)}
                          options={[{ value: '', label: 'All states' }, ...stateOptions.map((s) => ({ value: s, label: s }))]}
                          placeholder="State"
                          className="flex-1 min-w-[7rem]"
                        />
                      )}
                      <MultiSelect
                        value={collectiveIds}
                        onChange={setCollectiveIds}
                        options={collectiveOptions}
                        allLabel="All collectives"
                        countLabel={(n) => `${n} collectives`}
                        className="flex-1 min-w-[9rem]"
                      />
                    </div>

                    {discoverShowLoading ? (
                      <EventListSkeleton />
                    ) : discoverError ? (
                      <EmptyState illustration="error" title="Couldn't load events" description="Pull down to try again." />
                    ) : !discoverEvents || discoverEvents.length === 0 ? (
                      <EmptyState
                        illustration="empty"
                        title="No events found"
                        description={hasActiveFilters ? 'Try different filters or check back soon.' : 'No upcoming events right now. Check back soon!'}
                        action={hasActiveFilters
                          ? { label: 'Clear filters', onClick: clearFilters }
                          : { label: 'Browse collectives', onClick: () => setActiveTab('collectives') }
                        }
                      />
                    ) : (
                      <>
                      <motion.div variants={shouldReduceMotion ? undefined : stagger} initial="hidden" animate="visible" className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                        {discoverEvents.map((event) => {
                          const meta = ACTIVITY_META[event.activity_type]
                          return (
                            <motion.div key={event.id} variants={shouldReduceMotion ? undefined : fadeUp}>
                              <Card
                                variant="event"
                                watermark={event.activity_type}
                                onClick={() => navigate(`/events/${event.id}`)}
                                aria-label={event.title}
                                className="bg-white shadow-md ring-1 ring-primary-100 rounded-md"
                              >
                                <div className="relative">
                                  {event.cover_image_url ? (
                                    <Card.Image
                                      src={event.cover_image_url}
                                      alt={event.title}
                                      aspectRatio="2/1"
                                      positionX={event.cover_image_position_x}
                                      positionY={event.cover_image_position_y}
                                    />
                                  ) : (
                                    <div className="relative w-full overflow-hidden" style={{ aspectRatio: '2/1' }}>
                                      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-10', meta?.gradient ?? 'from-primary-400 to-moss-500')} />
                                      <div className="absolute inset-0 bg-neutral-50 flex items-center justify-center">
                                        <div className="w-12 h-12 rounded-md bg-white shadow-sm flex items-center justify-center">
                                          <Leaf size={22} strokeWidth={2} className="text-neutral-300" />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  <Card.Badge position="top-left">
                                    <Badge variant="activity" activity={activityToBadge[event.activity_type] ?? 'other'} size="sm">
                                      {ACTIVITY_TYPE_LABELS[event.activity_type] ?? event.activity_type}
                                    </Badge>
                                  </Card.Badge>
                                </div>
                                <Card.Content>
                                  <Card.Title className="text-neutral-900">
                                    {event.title}
                                    {event.is_external_collaboration && (
                                      <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-md bg-bark-100 text-bark-600 text-[10px] font-semibold align-middle">
                                        <ExternalLink size={10} />
                                        Collab
                                      </span>
                                    )}
                                  </Card.Title>
                                  <Card.Meta className="text-neutral-500">
                                    <span className="flex items-center gap-1.5">
                                      <Calendar size={13} className="shrink-0 text-neutral-400" />
                                      <span className="font-semibold text-neutral-600">{formatEventDate(event.date_start, (event as { timezone?: string | null }).timezone ?? (event as { collectives?: { timezone?: string | null } | null }).collectives?.timezone ?? undefined)}</span>
                                    </span>
                                  </Card.Meta>
                                  {event.collectives && (
                                    <Card.Meta className="text-neutral-500">
                                      <span className="flex items-center gap-1.5">
                                        <Users size={13} className="shrink-0 text-neutral-400" />
                                        <span>{event.collectives.name}</span>
                                      </span>
                                    </Card.Meta>
                                  )}
                                  {event.address && (
                                    <Card.Meta className="text-neutral-500">
                                      <span className="flex items-center gap-1.5">
                                        <MapPin size={13} className="shrink-0 text-neutral-400" />
                                        <span className="line-clamp-1">{event.address}</span>
                                      </span>
                                    </Card.Meta>
                                  )}
                                </Card.Content>
                              </Card>
                            </motion.div>
                          )
                        })}
                      </motion.div>
                      {hasNextPage && (
                        <div className="flex justify-center pt-4">
                          <button
                            type="button"
                            onClick={() => fetchNextPage()}
                            disabled={isFetchingNextPage}
                            className="text-sm font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 px-5 py-2.5 rounded-full transition-colors disabled:opacity-50 cursor-pointer select-none"
                          >
                            {isFetchingNextPage ? 'Loading...' : 'Load more events'}
                          </button>
                        </div>
                      )}
                      </>
                    )}
                  </motion.section>
                </motion.div>
              )}

              {/* ======================================================== */}
              {/*  COLLECTIVES TAB                                          */}
              {/* ======================================================== */}
              {activeTab === 'collectives' && (
                <motion.div
                  key="collectives-tab"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-7 pb-24"
                >
                  {/* ── Your Collectives ── */}
                  {myCollectives && myCollectives.length > 0 && (
                    <section className="px-4 lg:px-6">
                      <SectionHeader title="Your Collectives" count={myCollectives.length} />
                      <div className="flex gap-3.5 overflow-x-auto pretty-scrollbar -mx-4 px-4 lg:-mx-6 lg:px-6 pb-2">
                        {myCollectives.map((m, idx) => {
                          const c = m.collectives
                          if (!c) return null
                          return (
                            <motion.div
                              key={m.collective_id}
                              className="w-[220px] shrink-0"
                              initial={shouldReduceMotion ? false : { opacity: 0, x: 16 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.06, duration: 0.25 }}
                            >
                              <button
                                type="button"
                                onClick={() => navigate(`/collectives/${c.slug}`)}
                                className={cn(
                                  'w-full rounded-md bg-white overflow-hidden text-left',
                                  'shadow-sm',
                                  'border border-neutral-100',
                                  'active:scale-[0.98] transition-all duration-150 cursor-pointer select-none',
                                  '',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                                )}
                              >
                                <div className="h-24 w-full relative overflow-hidden">
                                  {c.cover_image_url ? (
                                    <img src={c.cover_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="absolute inset-0 bg-primary-50 flex items-center justify-center">
                                      <Users size={28} className="text-primary-200" />
                                    </div>
                                  )}
                                  {/* Scrim for role badge */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                                  <div className="absolute bottom-2 left-2.5">
                                    <span className="px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-[10px] font-bold text-primary-700 uppercase tracking-wide shadow-sm">
                                      {m.role?.replace(/_/g, ' ') ?? 'member'}
                                    </span>
                                  </div>
                                </div>
                                <div className="p-3.5">
                                  <p className="text-sm font-semibold text-neutral-900 truncate">{c.name}</p>
                                  <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                                    <MapPin size={10} />
                                    {[c.region, c.state].filter(Boolean).join(', ')}
                                  </p>
                                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-50 text-xs font-semibold text-primary-600">
                                    <Users size={11} /> {c.member_count ?? 0} members
                                  </div>
                                </div>
                              </button>
                            </motion.div>
                          )
                        })}
                      </div>
                    </section>
                  )}

                  {/* ── Find a Collective ── */}
                  <section className="px-4 lg:px-6">
                    <SectionHeader title="Find a Collective" />

                    {/* Search + state filter over the loaded collectives. The
                        map below stays for spatial browse; this makes finding a
                        collective by name a single query, not a scrub of the
                        horizontal chip strip. */}
                    <div className="mb-3 space-y-2.5">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input
                          type="text"
                          value={collectiveSearch}
                          onChange={(e) => setCollectiveSearch(e.target.value)}
                          placeholder="Search collectives by name..."
                          aria-label="Search collectives by name"
                          className="w-full pl-9 pr-3 py-2.5 rounded-sm bg-white border border-neutral-200 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                      </div>
                      {collectiveStates.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pretty-scrollbar -mx-4 px-4 lg:-mx-6 lg:px-6 pb-1">
                          <button
                            type="button"
                            onClick={() => setCollectiveStateFilter('')}
                            className={cn(
                              'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none',
                              !collectiveStateFilter ? 'bg-primary-600 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50',
                            )}
                          >
                            All states
                          </button>
                          {collectiveStates.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setCollectiveStateFilter(s === collectiveStateFilter ? '' : s)}
                              className={cn(
                                'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none',
                                collectiveStateFilter === s ? 'bg-primary-600 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50',
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {collectiveFilterActive && (
                      <div className="mb-4 space-y-2">
                        {filteredCollectives.length === 0 ? (
                          <p className="text-sm text-neutral-500 py-4 text-center">No collectives match your search.</p>
                        ) : (
                          filteredCollectives.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => navigate(`/collectives/${c.slug}`)}
                              className="w-full flex items-center gap-3 p-3 rounded-md bg-white border border-neutral-100 shadow-sm text-left hover:border-neutral-200 active:scale-[0.99] transition-all duration-150 cursor-pointer select-none"
                            >
                              <div className="w-11 h-11 rounded-sm overflow-hidden bg-primary-50 shrink-0 flex items-center justify-center">
                                {c.cover_image_url ? (
                                  <img src={c.cover_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <Users size={18} className="text-primary-200" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-neutral-900 truncate">{c.name}</p>
                                <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                                  <MapPin size={10} />
                                  {[c.region, c.state].filter(Boolean).join(', ') || 'Australia'}
                                </p>
                              </div>
                              <ArrowRight size={16} className="text-neutral-300 shrink-0" />
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    <div className="rounded-md overflow-hidden border border-neutral-100 shadow-sm">
                      <CollectiveMap className="h-[75vh] min-h-[500px]" />
                    </div>
                  </section>


                </motion.div>
              )}
            </AnimatePresence>
        </div>
      </div>

    </Page>
  )
}
