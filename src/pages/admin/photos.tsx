import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Image as ImageIcon, Filter, X, User, Calendar, MapPin, Tag } from 'lucide-react'
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
    case '7d':
      return { from: new Date(now.getTime() - 7 * 86400e3).toISOString(), to: null }
    case '30d':
      return { from: new Date(now.getTime() - 30 * 86400e3).toISOString(), to: null }
    case '90d':
      return { from: new Date(now.getTime() - 90 * 86400e3).toISOString(), to: null }
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: null }
    default:
      return { from: null, to: null }
  }
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

  const { from, to } = getDateRange(dateRange)

  const { data: photos = [], isLoading } = useAdminEventPhotos({
    collectiveId: collectiveId || null,
    activityType: activityType || null,
    fromDate: from,
    toDate: to,
    attendedByUserId: attendedByUserId || null,
    limit: 500,
  })

  const filtered = useMemo(() => {
    if (!search) return photos
    const q = search.toLowerCase()
    return photos.filter((p) =>
      (p.event_title ?? '').toLowerCase().includes(q) ||
      (p.collective_name ?? '').toLowerCase().includes(q) ||
      (p.uploader_display_name ?? '').toLowerCase().includes(q),
    )
  }, [photos, search])

  const totalPhotos = filtered.length
  const uniqueUploaders = new Set(filtered.map((p) => p.uploaded_by)).size
  const uniqueEvents = new Set(filtered.map((p) => p.event_id)).size

  function clearFilters() {
    setCollectiveId('')
    setDateRange('all')
    setActivityType('')
    setAttendedByUserId('')
    setSearch('')
  }
  const hasFilters = !!collectiveId || dateRange !== 'all' || !!activityType || !!attendedByUserId

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-24 max-w-7xl mx-auto">
      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-3 mb-6">
        <StatBox label="Photos" value={totalPhotos} />
        <StatBox label="Events" value={uniqueEvents} />
        <StatBox label="Uploaders" value={uniqueUploaders} />
      </motion.div>

      {/* Filter bar */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchBar value={search} onChange={setSearch} placeholder="Search event / collective / uploader…" compact />
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

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-neutral-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState illustration="empty" title="No photos match these filters" description="Clear filters or expand the date range." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <PhotoCard key={p.id} photo={p} onOpen={() => navigate(`/events/${p.event_id}`)} />
          ))}
        </div>
      )}
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

function PhotoCard({ photo, onOpen }: { photo: AdminEventPhoto; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square rounded-2xl overflow-hidden bg-neutral-100 ring-1 ring-neutral-200/60 active:scale-[0.98] transition-transform duration-150 text-left"
    >
      {photo.url && (
        <img
          src={photo.url}
          alt={photo.caption ?? ''}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
        <p className="text-[12px] font-bold line-clamp-2 leading-tight">{photo.event_title}</p>
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/85">
          <Calendar size={10} />
          <span className="truncate">{formatDate(photo.event_date_start)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-white/75">
          <MapPin size={10} />
          <span className="truncate">{photo.collective_name}</span>
        </div>
        {photo.event_activity_type && (
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-white/75">
            <Tag size={10} />
            <span className="truncate">{formatActivityType(photo.event_activity_type)}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <Avatar src={photo.uploader_avatar_url ?? null} name={photo.uploader_display_name ?? 'Member'} size="xs" />
          <span className="text-[10px] text-white/85 truncate">{photo.uploader_display_name ?? 'Member'}</span>
        </div>
      </div>
    </button>
  )
}
