import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Filter, X, Calendar, ChevronLeft, User, ImagePlus, Loader2, Video as VideoIcon, Check, Download } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Dropdown } from '@/components/dropdown'
import { SearchBar } from '@/components/search-bar'
import { EmptyState } from '@/components/empty-state'
import { Avatar } from '@/components/avatar'
import { useCollectives } from '@/hooks/use-collective'
import { useAdminEventPhotos, useUploadEventPhoto, type AdminEventPhoto } from '@/hooks/use-event-photos'
import { PhotoCarouselLightbox, isVideoPath } from '@/components/event-photos-section'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/toast'
import { formatDate } from '@/lib/date-format'
import { formatActivityType } from '@/lib/activity-types'
import { cn } from '@/lib/cn'
import { downloadAsZip, saveToCameraRoll } from '@/lib/photo-download'

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadProg, setUploadProg] = useState({ done: 0, total: 0 })
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zipProg, setZipProg] = useState({ done: 0, total: 0 })
  const { user } = useAuth()
  const { toast } = useToast()

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
  const upload = useUploadEventPhoto(openedEventId ?? undefined)

  async function handleStaffAddMore() {
    if (!openedEventId) return
    fileInputRef.current?.click()
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllInGroup() {
    if (!openedGroup) return
    setSelectedIds(new Set(openedGroup.photos.map((p) => p.id)))
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function handleDownloadSelected() {
    if (!openedGroup) return
    const items = openedGroup.photos.filter((p) => selectedIds.has(p.id))
    if (items.length === 0) return
    if (items.length === 1) {
      await saveToCameraRoll(items[0].url ?? '', items[0].storage_path, items[0].caption ?? undefined)
      toast.success('Downloaded')
      exitSelectMode()
      return
    }
    setZipProg({ done: 0, total: items.length })
    try {
      const slug = openedGroup.event_title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'
      await downloadAsZip(
        items.map((p) => ({ url: p.url ?? '', storage_path: p.storage_path })),
        `coexist-${slug}-photos.zip`,
        (done, total) => setZipProg({ done, total }),
      )
      toast.success(`Downloaded ${items.length} items as zip`)
      exitSelectMode()
    } catch {
      toast.error('Could not build zip')
    } finally {
      setZipProg({ done: 0, total: 0 })
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-picking same files
    if (files.length === 0 || !openedEventId) return
    setUploadProg({ done: 0, total: files.length })
    let ok = 0
    let fail = 0
    for (const f of files) {
      try {
        await upload.mutateAsync({ blob: f })
        ok++
      } catch {
        fail++
      }
      setUploadProg((p) => ({ ...p, done: p.done + 1 }))
    }
    setUploadProg({ done: 0, total: 0 })
    if (ok > 0) toast.success(`Added ${ok} ${ok === 1 ? 'item' : 'items'}`)
    if (fail > 0) toast.error(`${fail} failed to upload`)
  }

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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/events/${openedGroup.event_id}`)}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                >
                  Open event →
                </button>
                {!selectMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectMode(true)}
                      className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform duration-150"
                    >
                      <Check size={13} /> Select
                    </button>
                    <button
                      type="button"
                      onClick={handleStaffAddMore}
                      disabled={upload.isPending}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform duration-150 disabled:opacity-60"
                    >
                      <ImagePlus size={13} /> Add more
                    </button>
                  </>
                ) : (
                  <>
                    <span className="ml-auto text-xs font-semibold text-neutral-600 tabular-nums">
                      {selectedIds.size} selected
                    </span>
                    <button
                      type="button"
                      onClick={selectAllInGroup}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform duration-150"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSelected}
                      disabled={selectedIds.size === 0 || zipProg.total > 0}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform duration-150 disabled:opacity-40"
                    >
                      <Download size={13} />
                      {selectedIds.size > 1 ? 'Download zip' : 'Download'}
                    </button>
                    <button
                      type="button"
                      onClick={exitSelectMode}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-neutral-100"
                      aria-label="Exit select mode"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
              {uploadProg.total > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-50 ring-1 ring-primary-100 p-2.5 text-xs font-semibold text-primary-700">
                  <Loader2 size={13} className="animate-spin" />
                  Uploading {uploadProg.done} of {uploadProg.total}…
                </div>
              )}
              {zipProg.total > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-50 ring-1 ring-primary-100 p-2.5 text-xs font-semibold text-primary-700">
                  <Loader2 size={13} className="animate-spin" />
                  Bundling {zipProg.done} of {zipProg.total}…
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={onFilePicked}
              className="hidden"
            />
            <PhotoLibraryGrid
              photos={openedGroup.photos}
              onPhotoClick={(i) => {
                if (selectMode) {
                  toggleSelected(openedGroup.photos[i].id)
                } else {
                  setLightboxIndex(i)
                }
              }}
              selectMode={selectMode}
              selectedIds={selectedIds}
            />
            <AnimatePresence>
              {lightboxIndex !== null && openedGroup.photos[lightboxIndex] && (
                <PhotoCarouselLightbox
                  photos={openedGroup.photos}
                  initialIndex={lightboxIndex}
                  eventTitle={openedGroup.event_title}
                  onClose={() => setLightboxIndex(null)}
                  currentUserId={user?.id ?? null}
                />
              )}
            </AnimatePresence>
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
                  <SearchBar value={search} onChange={setSearch} placeholder="Search events…" compact />
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

function PhotoLibraryGrid({
  photos,
  onPhotoClick,
  selectMode = false,
  selectedIds,
}: {
  photos: AdminEventPhoto[]
  onPhotoClick: (index: number) => void
  selectMode?: boolean
  selectedIds?: Set<string>
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
      {photos.map((p, i) => {
        const isVid = isVideoPath(p.storage_path)
        const isSelected = selectedIds?.has(p.id) ?? false
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPhotoClick(i)}
            className={cn(
              'group relative aspect-square rounded-xl overflow-hidden bg-neutral-100 ring-1 active:scale-[0.97] transition-transform duration-150',
              isSelected ? 'ring-2 ring-primary-500' : 'ring-neutral-200/60',
            )}
            aria-label={isVid ? 'View video' : 'View photo'}
          >
            {p.url && (
              isVid ? (
                <video
                  src={p.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <img
                  src={p.url}
                  alt={p.caption ?? ''}
                  loading="lazy"
                  decoding="async"
                  className={cn(
                    'absolute inset-0 w-full h-full object-cover transition-transform duration-300',
                    !selectMode && 'group-hover:scale-[1.03]',
                    isSelected && 'opacity-80',
                  )}
                />
              )
            )}
            {isVid && (
              <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white">
                <VideoIcon size={11} />
              </span>
            )}
            {selectMode && (
              <span
                className={cn(
                  'absolute top-1.5 left-1.5 flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors',
                  isSelected ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white/80 border-white/80 text-transparent',
                )}
              >
                <Check size={13} />
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
              <div className="flex items-center gap-1.5">
                <Avatar src={p.uploader_avatar_url ?? null} name={p.uploader_display_name ?? 'Member'} size="xs" />
                <span className="text-[10px] text-white truncate">{p.uploader_display_name ?? 'Member'}</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
