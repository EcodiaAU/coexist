import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Filter, X, Calendar, MapPin, Tag, ChevronLeft, User } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Dropdown } from '@/components/dropdown'
import { SearchBar } from '@/components/search-bar'
import { EmptyState } from '@/components/empty-state'
import { Avatar } from '@/components/avatar'
import { useCollectives } from '@/hooks/use-collective'
import { useAdminEventPhotos, type AdminEventPhoto } from '@/hooks/use-event-photos'
import { formatDate } from '@/lib/date-format'
import { formatActivityType } from '@/lib/activity-types'
import { cn } from '@/lib/cn'

const ACTIVITY_OPTIONS = [
  { value: '', label: 'All activity types' },
  { value: 'clean_up', label: 'Clean Up' },
  { value: 'tree_planting', label: 'Tree Planting' },
  { value: 'ecosystem_restoration', label: 'Ecosystem Restoration' },
  { value: 'nature_hike', label: 'Nature Hike' },
  { value: 'camp_out', label: 'Camp Out' },
  { value: 'spotlighting', label: 'Spotlighting' },
  { value: 'other', label: 'Other' },
]

const DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
]

function getDateRange(range: string): { from: string | null; to: string | null } {
  const now = new Date()
  switch (range) {
    case '7d':      return { from: new Date(now.getTime() - 7 * 86400e3).toISOString(), to: null }
    case '30d':     return { from: new Date(now.getTime() - 30 * 86400e3).toISOString(), to: null }
    case '90d':     return { from: new Date(now.getTime() - 90 * 86400e3).toISOString(), to: null }
    case 'this_year': return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: null }
    default:        return { from: null, to: null }
  }
}

interface EventGroup {
  event_id: string
  event_title: string
  event_date_start: string
  event_activity_type: string | null
  collective_name: string
  photos: AdminEventPhoto[]
  uploaderCount: number
}

function groupByEvent(photos: AdminEventPhoto[]): EventGroup[] {
  const map = new Map<string, EventGroup>()
  for (const p of photos) {
    if (!map.has(p.event_id)) {
      map.set(p.event_id, {
        event_id: p.event_id,
        event_title: p.event_title,
        event_date_start: p.event_date_start,
        event_activity_type: p.event_activity_type,
        collective_name: p.collective_name,
        photos: [],
        uploaderCount: 0,
      })
    }
    map.get(p.event_id)!.photos.push(p)
  }
  // Compute uploaderCount + sort photos within each by newest first.
  for (const g of map.values()) {
    g.photos.sort((a, b) => b.created_at.localeCompare(a.created_at))
    g.uploaderCount = new Set(g.photos.map((p) => p.uploaded_by)).size
  }
  // Sort events by most recent
  return Array.from(map.values()).sort((a, b) => b.event_date_start.localeCompare(a.event_date_start))
}

export default function AdminPhotosPage() {
  useAdminHeader('Photos', { fullBleed: false })
  const navigate = useNavigate()

  const { data: collectivesData } = useCollectives({ includeNational: false })
  const collectiveOptions = useMemo(
    () => [{ value: '', label: 'All collectives' }, ...(collectivesData ?? []).map((c) => ({ value: c.id, label: c.name }))],
    [collectivesData],
  )

  const [collectiveId, setCollectiveId] = useState('')
  const [dateRange, setDateRange] = useState('all')
  const [activityType, setActivityType] = useState('')
  const [attendedByUserId, setAttendedByUserId] = useState('')
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openedEventId, setOpenedEventId] = useState<string | null>(null)

  const { from, to } = getDateRange(dateRange)
  const { data: photos = [], isLoading } = useAdminEventPhotos({
    collectiveId: collectiveId || null,
    activityType: activityType || null,
    fromDate: from,
    toDate: to,
    attendedByUserId: attendedByUserId || null,
    limit: 1000,
  })

  const groups = useMemo(() => {
    const allGroups = groupByEvent(photos)
    if (!search) return allGroups
    const q = search.toLowerCase()
    return allGroups.filter((g) =>
      g.event_title.toLowerCase().includes(q) ||
      g.collective_name.toLowerCase().includes(q),
    )
  }, [photos, search])

  const totalPhotos = photos.length
  const uniqueEvents = groups.length
  const uniqueUploaders = new Set(photos.map((p) => p.uploaded_by)).size

  const openedGroup = openedEventId ? groups.find((g) => g.event_id === openedEventId) : null

  function clearFilters() {
    setCollectiveId(''); setDateRange('all'); setActivityType(''); setAttendedByUserId(''); setSearch('')
  }
  const hasFilters = !!collectiveId || dateRange !== 'all' || !!activityType || !!attendedByUserId

  return (
    <div className="px-2 sm:px-4 lg:px-6 pt-6 pb-24 max-w-7xl mx-auto">
      <AnimatePresence mode="wait">
        {openedGroup ? (
          /* --- LIBRARY VIEW: photos from a single event --- */
          <motion.div
            key={`lib-${openedGroup.event_id}`}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              onClick={() => setOpenedEventId(null)}
              className="flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-700 mb-3 ml-1"
            >
              <ChevronLeft size={14} /> Back to all events
            </button>
            <div className="rounded-2xl bg-white border border-neutral-100 shadow-sm p-4 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                {openedGroup.collective_name}
                {openedGroup.event_activity_type && ` · ${formatActivityType(openedGroup.event_activity_type)}`}
              </p>
              <h2 className="font-heading text-xl font-bold text-neutral-900 mt-0.5 leading-tight">
                {openedGroup.event_title}
              </h2>
              <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1"><Calendar size={12} />{formatDate(openedGroup.event_date_start)}</span>
                <span className="inline-flex items-center gap-1"><User size={12} />{openedGroup.uploaderCount} {openedGroup.uploaderCount === 1 ? 'contributor' : 'contributors'}</span>
                <span className="text-neutral-400">{openedGroup.photos.length} {openedGroup.photos.length === 1 ? 'photo' : 'photos'}</span>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/events/${openedGroup.event_id}`)}
                className="mt-3 text-xs font-semibold text-primary-600 hover:text-primary-700"
              >
                Open event →
              </button>
            </div>
            <PhotoLibraryGrid photos={openedGroup.photos} />
          </motion.div>
        ) : (
          /* --- EVENT LIST VIEW --- */
          <motion.div
            key="events"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-5 px-2">
              <StatBox label="Photos" value={totalPhotos} />
              <StatBox label="Events" value={uniqueEvents} />
              <StatBox label="Uploaders" value={uniqueUploaders} />
            </div>

            {/* Filter bar */}
            <div className="mb-4 space-y-2 px-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SearchBar value={search} onChange={setSearch} placeholder="Search event / collective…" compact />
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 h-10 text-xs font-semibold transition-colors shrink-0',
                    hasFilters || filtersOpen ? 'bg-primary-50 text-primary-700' : 'bg-neutral-50 text-neutral-600',
                  )}
                >
                  <Filter size={13} />
                  Filters
                </button>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-700 shrink-0"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
              </div>

              {filtersOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
                >
                  <Dropdown options={collectiveOptions} value={collectiveId} onChange={setCollectiveId} />
                  <Dropdown options={DATE_RANGES} value={dateRange} onChange={setDateRange} />
                  <Dropdown options={ACTIVITY_OPTIONS} value={activityType} onChange={setActivityType} />
                  <input
                    type="text"
                    placeholder="Attended-by user UUID (optional)"
                    value={attendedByUserId}
                    onChange={(e) => setAttendedByUserId(e.target.value.trim())}
                    className="w-full rounded-full border border-neutral-200 bg-white px-4 h-10 text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                  />
                </motion.div>
              )}
            </div>

            {/* Event cards - each is a thumbnail strip of that event's photos */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 rounded-2xl bg-neutral-100 animate-pulse" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <EmptyState illustration="empty" title="No photos match these filters" description="Clear filters or expand the date range." />
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <EventGroupCard key={g.event_id} group={g} onOpen={() => setOpenedEventId(g.event_id)} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white border border-neutral-100 shadow-sm p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{label}</p>
      <p className="font-heading text-2xl font-bold text-neutral-900 tabular-nums mt-0.5">{value.toLocaleString()}</p>
    </div>
  )
}

function EventGroupCard({ group, onOpen }: { group: EventGroup; onOpen: () => void }) {
  const preview = group.photos.slice(0, 4)
  const extra = Math.max(0, group.photos.length - 4)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-left rounded-2xl bg-white border border-neutral-100 shadow-sm overflow-hidden active:scale-[0.99] transition-transform duration-150 hover:border-neutral-200"
    >
      {/* Photo strip */}
      <div className="grid grid-cols-4 gap-0.5 bg-neutral-100">
        {preview.map((p, i) => (
          <div key={p.id} className="relative aspect-square bg-neutral-200 overflow-hidden">
            {p.url && (
              <img
                src={p.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {i === preview.length - 1 && extra > 0 && (
              <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                <span className="text-white font-heading font-bold text-lg">+{extra}</span>
              </div>
            )}
          </div>
        ))}
        {/* Fill empty slots if fewer than 4 */}
        {Array.from({ length: Math.max(0, 4 - preview.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square bg-neutral-100" />
        ))}
      </div>

      {/* Meta */}
      <div className="p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
          {group.collective_name}
          {group.event_activity_type && ` · ${formatActivityType(group.event_activity_type)}`}
        </p>
        <p className="font-heading text-base font-bold text-neutral-900 mt-0.5 line-clamp-2 leading-tight">
          {group.event_title}
        </p>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1"><Calendar size={11} />{formatDate(group.event_date_start)}</span>
          <span>{group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'}</span>
          <span>{group.uploaderCount} {group.uploaderCount === 1 ? 'contributor' : 'contributors'}</span>
        </div>
      </div>
    </button>
  )
}

function PhotoLibraryGrid({ photos }: { photos: AdminEventPhoto[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
      {photos.map((p) => (
        <div key={p.id} className="group relative aspect-square rounded-xl overflow-hidden bg-neutral-100 ring-1 ring-neutral-200/60">
          {p.url && (
            <img
              src={p.url}
              alt={p.caption ?? ''}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center gap-1.5">
              <Avatar src={p.uploader_avatar_url ?? null} name={p.uploader_display_name ?? 'Member'} size="xs" />
              <span className="text-[10px] text-white truncate">{p.uploader_display_name ?? 'Member'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
