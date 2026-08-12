import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { PlaceAutocomplete } from '@/components/place-autocomplete'
import {
  MapPin,
  Users,
  CalendarDays,
  Plus,
  Archive,
  RotateCcw,
  Crown,
  Leaf,
  X,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { SearchBar } from '@/components/search-bar'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { OptimizedImage } from '@/components/optimized-image'
import { useToast } from '@/components/toast'
import { coverImagePositionStyle } from '@/lib/cover-image'
import { cn } from '@/lib/cn'
import {
  useAdminCollectives,
  useCreateCollective,
  useArchiveCollective,
  type AdminCollective,
} from '@/hooks/use-admin-collectives'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type StatusFilter = 'all' | 'active' | 'archived'

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Create collective modal                                            */
/* ------------------------------------------------------------------ */

function CreateCollectiveModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const createCollective = useCreateCollective()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('')
  const [state, setState] = useState('')
  // Coords captured from the Region autocomplete. Written to the collective's
  // location_point so it pins on the explore map. Null until a place is picked.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const handleCreate = async () => {
    try {
      await createCollective.mutateAsync({
        name,
        description: description || undefined,
        region: region || undefined,
        state: state || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
      })
      toast.success('Collective created')
      setName('')
      setDescription('')
      setRegion('')
      setState('')
      setCoords(null)
      onClose()
    } catch {
      toast.error('Failed to create collective')
    }
  }

  return (
    <BottomSheet data-eos-id="src/pages/admin/collectives.tsx#0" data-eos-v="2" open={open} onClose={onClose}>
      {/* Header */}
      <div data-eos-id="src/pages/admin/collectives.tsx#1" className="flex items-center justify-between mb-4">
        <h2 data-eos-id="src/pages/admin/collectives.tsx#2" className="font-heading text-lg font-semibold text-neutral-900">Create Collective</h2>
        <button data-eos-id="src/pages/admin/collectives.tsx#3"
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X data-eos-id="src/pages/admin/collectives.tsx#4" size={20} />
        </button>
      </div>
      <div data-eos-id="src/pages/admin/collectives.tsx#5" className="space-y-4">
        <Input data-eos-id="src/pages/admin/collectives.tsx#6"
          label="Collective Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Byron Bay Collective"
        />
        <Input data-eos-id="src/pages/admin/collectives.tsx#7"
          type="textarea"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this collective focus on?"
          rows={3}
        />
        <PlaceAutocomplete data-eos-id="src/pages/admin/collectives.tsx#8"
          label="Region"
          value={region}
          onChange={(val, place) => {
            setRegion(val)
            if (place) {
              // Capture the picked place's coords so the collective pins on the map.
              setCoords({ lat: place.lat, lng: place.lng })
              const stateMatch = place.short_name.split(',').pop()?.trim()
              const matched = (['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const).find((s) => stateMatch?.includes(s))
              if (matched) setState(matched)
            } else {
              // Free-typing / cleared: drop stale coords so we don't attach a
              // pin from a previously-selected place to a different region.
              setCoords(null)
            }
          }}
          placeholder="e.g. Byron Bay"
        />
        <Dropdown data-eos-id="src/pages/admin/collectives.tsx#9"
          label="State"
          placeholder="Select state..."
          options={[
            { value: 'NSW', label: 'NSW' },
            { value: 'VIC', label: 'VIC' },
            { value: 'QLD', label: 'QLD' },
            { value: 'WA', label: 'WA' },
            { value: 'SA', label: 'SA' },
            { value: 'TAS', label: 'TAS' },
            { value: 'ACT', label: 'ACT' },
            { value: 'NT', label: 'NT' },
          ]}
          value={state}
          onChange={setState}
        />
        <Button data-eos-id="src/pages/admin/collectives.tsx#10"
          variant="primary"
          fullWidth
          onClick={handleCreate}
          loading={createCollective.isPending}
          disabled={!name.trim()}
        >
          Create Collective
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminCollectivesPage() {
  const shouldReduceMotion = useReducedMotion()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [showCreate, setShowCreate] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<AdminCollective | null>(null)
  const { toast } = useToast()

  const { data: collectives, isLoading } = useAdminCollectives({
    search,
    status: statusFilter,
  })
  const showLoading = useDelayedLoading(isLoading)
  const archiveMutation = useArchiveCollective()

  const heroActions = useMemo(() => (
    <Button data-eos-id="src/pages/admin/collectives.tsx#11"
      variant="primary"
      size="sm"
      icon={<Plus data-eos-id="src/pages/admin/collectives.tsx#12" size={16} />}
      onClick={() => setShowCreate(true)}
    >
      Create
    </Button>
  ), [])

  const handleArchiveToggle = async () => {
    if (!archiveTarget) return
    const isCurrentlyActive = archiveTarget.is_active
    try {
      await archiveMutation.mutateAsync({
        collectiveId: archiveTarget.id,
        archive: isCurrentlyActive ?? false,
      })
      toast.success(isCurrentlyActive ? 'Collective archived' : 'Collective restored')
    } catch {
      toast.error('Failed to update collective')
    }
    setArchiveTarget(null)
  }

  useAdminHeader('Collectives', { actions: heroActions })

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <div data-eos-id="src/pages/admin/collectives.tsx#13">
        <motion.div data-eos-id="src/pages/admin/collectives.tsx#14" variants={stagger} initial="hidden" animate="visible">
          {/* Filters */}
          <motion.div data-eos-id="src/pages/admin/collectives.tsx#15" variants={fadeUp} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <SearchBar data-eos-id="src/pages/admin/collectives.tsx#16"
              value={search}
              onChange={setSearch}
              placeholder="Search collectives..."
              compact
              className="flex-1"
            />
            <div data-eos-id="src/pages/admin/collectives.tsx#17" className="flex items-center gap-0.5 rounded-sm shadow-sm bg-white p-0.5">
              {(['active', 'archived', 'all'] as const).map((s) => (
                <button data-eos-id="src/pages/admin/collectives.tsx#18"
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-3.5 min-h-11 rounded-sm text-sm font-semibold capitalize',
                    'transition-colors duration-150 cursor-pointer select-none',
                    statusFilter === s
                      ? 'bg-neutral-100 text-neutral-900'
                      : 'text-neutral-400 hover:text-neutral-600',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>

          {/* List */}
          <motion.div data-eos-id="src/pages/admin/collectives.tsx#19" variants={fadeUp}>
          {showLoading ? (
            <div data-eos-id="src/pages/admin/collectives.tsx#20" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-[4/3] rounded-md bg-neutral-100 animate-pulse" />
              ))}
            </div>
          ) : !collectives?.length ? (
            <EmptyState data-eos-id="src/pages/admin/collectives.tsx#21"
              illustration="empty"
              title="No collectives found"
              description={search ? 'Try a different search term' : 'Create your first collective'}
              action={
                !search
                  ? { label: 'Create Collective', onClick: () => setShowCreate(true) }
                  : undefined
              }
            />
          ) : (
            <motion.div data-eos-id="src/pages/admin/collectives.tsx#22" layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {collectives.map((c) => {
                return (
                  <motion.div data-eos-id="src/pages/admin/collectives.tsx#23"
                    key={c.id}
                    layout="position"
                  >
                    {/* Full-bleed image tile - same imagery-first composition as
                        the homepage cards and chat-list tiles. Cover fills the
                        card; name + meta overlay a dark bottom-up gradient. */}
                    <Link data-eos-id="src/pages/admin/collectives.tsx#24"
                      to={`/admin/collectives/${c.id}`}
                      aria-label={c.name}
                      className={cn(
                        'group relative block overflow-hidden rounded-md shadow-sm',
                        'aspect-[4/3] active:scale-[0.99] transition-transform duration-150',
                        !c.is_active && 'opacity-60',
                      )}
                    >
                      {/* Cover imagery (or a nature gradient + leaf watermark) */}
                      {c.cover_image_url ? (
                        <OptimizedImage data-eos-id="src/pages/admin/collectives.tsx#25"
                          src={c.cover_image_url}
                          alt=""
                          aspectRatio="4/3"
                          wrapperClassName="absolute inset-0"
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          className="absolute inset-0"
                          imgStyle={coverImagePositionStyle(c.cover_image_position_x, c.cover_image_position_y)}
                        />
                      ) : (
                        <>
                          <div data-eos-id="src/pages/admin/collectives.tsx#26" className="absolute inset-0 bg-gradient-to-br from-primary-600 to-moss-700" aria-hidden="true" />
                          <div data-eos-id="src/pages/admin/collectives.tsx#27" className="absolute -right-3 -top-3 text-white/10 pointer-events-none [&_svg]:w-32 [&_svg]:h-32" aria-hidden="true">
                            <Leaf data-eos-id="src/pages/admin/collectives.tsx#28" strokeWidth={1} />
                          </div>
                        </>
                      )}

                      {/* Legibility gradient */}
                      <div data-eos-id="src/pages/admin/collectives.tsx#28b" className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" aria-hidden="true" />

                      {/* Top-right: archived badge + archive/restore action */}
                      <div data-eos-id="src/pages/admin/collectives.tsx#44" className="absolute top-3 right-3 flex items-center gap-1.5">
                        {!c.is_active && (
                          <span data-eos-id="src/pages/admin/collectives.tsx#32" className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white shrink-0">
                            Archived
                          </span>
                        )}
                        <button data-eos-id="src/pages/admin/collectives.tsx#45"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setArchiveTarget(c)
                          }}
                          className="flex items-center justify-center min-w-9 min-h-9 rounded-md bg-white/15 backdrop-blur-sm text-white hover:bg-white/25 cursor-pointer active:scale-[0.95] transition-[colors,transform]"
                          aria-label={c.is_active ? `Archive ${c.name}` : `Restore ${c.name}`}
                        >
                          {c.is_active ? <Archive data-eos-id="src/pages/admin/collectives.tsx#46" size={15} /> : <RotateCcw data-eos-id="src/pages/admin/collectives.tsx#47" size={15} />}
                        </button>
                      </div>

                      {/* Bottom overlay: name + region + meta */}
                      <div data-eos-id="src/pages/admin/collectives.tsx#29" className="absolute inset-x-0 bottom-0 p-3.5">
                        <p data-eos-id="src/pages/admin/collectives.tsx#31" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="item" className="font-heading text-base font-bold text-white leading-tight line-clamp-2 drop-shadow-sm">
                          {c.name}
                        </p>
                        {(c.region || c.state) && (
                          <p data-eos-id="src/pages/admin/collectives.tsx#33" className="text-xs text-white/75 flex items-center gap-1 truncate mt-0.5">
                            <MapPin data-eos-id="src/pages/admin/collectives.tsx#34" size={12} className="shrink-0" />
                            <span data-eos-id="src/pages/admin/collectives.tsx#35" data-eos-var="c.region" data-eos-var-label="Region" data-eos-var-scope="item" className="truncate">{[c.region, c.state].filter(Boolean).join(', ')}</span>
                          </p>
                        )}
                        <div data-eos-id="src/pages/admin/collectives.tsx#36" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-xs text-white/85">
                          <span data-eos-id="src/pages/admin/collectives.tsx#37" data-eos-var="c.memberCount" data-eos-var-label="Member count" data-eos-var-scope="item" className="flex items-center gap-1 shrink-0">
                            <Users data-eos-id="src/pages/admin/collectives.tsx#38" size={12} className="shrink-0" /> {c.memberCount} members
                          </span>
                          <span data-eos-id="src/pages/admin/collectives.tsx#39" data-eos-var="c.eventCount" data-eos-var-label="Event count" data-eos-var-scope="item" className="flex items-center gap-1 shrink-0">
                            <CalendarDays data-eos-id="src/pages/admin/collectives.tsx#40" size={12} className="shrink-0" /> {c.eventCount} events
                          </span>
                          {c.leaderName && (
                            <span data-eos-id="src/pages/admin/collectives.tsx#41" className="flex items-center gap-1 min-w-0 max-w-full">
                              <Crown data-eos-id="src/pages/admin/collectives.tsx#42" size={12} className="shrink-0" />
                              <span data-eos-id="src/pages/admin/collectives.tsx#43" data-eos-var="c.leaderName" data-eos-var-label="Leader name" data-eos-var-scope="item" className="truncate">{c.leaderName}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
          </motion.div>
        </motion.div>

      {/* Create modal */}
      <CreateCollectiveModal data-eos-id="src/pages/admin/collectives.tsx#49"
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Archive / Restore confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/admin/collectives.tsx#50"
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchiveToggle}
        title={archiveTarget?.is_active ? 'Archive Collective' : 'Restore Collective'}
        description={
          archiveTarget?.is_active
            ? `"${archiveTarget?.name}" will be hidden from members. You can restore it later.`
            : `"${archiveTarget?.name}" will be made visible to members again.`
        }
        confirmLabel={archiveTarget?.is_active ? 'Archive' : 'Restore'}
        variant="warning"
      />
    </div>
  )
}
