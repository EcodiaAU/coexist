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
  ChevronRight,
  Crown,
  X,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { SearchBar } from '@/components/search-bar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
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

  const handleCreate = async () => {
    try {
      await createCollective.mutateAsync({
        name,
        description: description || undefined,
        region: region || undefined,
        state: state || undefined,
      })
      toast.success('Collective created')
      setName('')
      setDescription('')
      setRegion('')
      setState('')
      onClose()
    } catch {
      toast.error('Failed to create collective')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-semibold text-neutral-900">Create Collective</h2>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.93] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div className="space-y-4">
        <Input
          label="Collective Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Byron Bay Collective"
        />
        <Input
          type="textarea"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this collective focus on?"
          rows={3}
        />
        <PlaceAutocomplete
          label="Region"
          value={region}
          onChange={(val, place) => {
            setRegion(val)
            if (place) {
              const stateMatch = place.short_name.split(',').pop()?.trim()
              const matched = (['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const).find((s) => stateMatch?.includes(s))
              if (matched) setState(matched)
            }
          }}
          placeholder="e.g. Byron Bay"
        />
        <Dropdown
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
        <Button
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
    <Button
      variant="primary"
      size="sm"
      icon={<Plus size={16} />}
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

  // Stats summary
  const stats = useMemo(() => {
    if (!collectives) return null
    const total = collectives.length
    const totalMembers = collectives.reduce((acc, c) => acc + c.memberCount, 0)
    const totalEvents = collectives.reduce((acc, c) => acc + c.eventCount, 0)
    return { total, totalMembers, totalEvents }
  }, [collectives])

  const rm = !!shouldReduceMotion

  const heroStats = useMemo(() => (
    <AdminHeroStatRow>
      <AdminHeroStat value={stats?.total ?? 0} label="Collectives" icon={<MapPin size={18} />} color="primary" delay={0} reducedMotion={rm} />
      <AdminHeroStat value={stats?.totalMembers ?? 0} label="Members" icon={<Users size={18} />} color="moss" delay={1} reducedMotion={rm} />
      <AdminHeroStat value={stats?.totalEvents ?? 0} label="Events" icon={<CalendarDays size={18} />} color="sprout" delay={2} reducedMotion={rm} />
    </AdminHeroStatRow>
  ), [stats, rm])

  useAdminHeader('Collectives', { actions: heroActions, heroContent: heroStats })

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <div>
        <motion.div variants={stagger} initial="hidden" animate="visible">
          {/* Filters */}
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search collectives..."
              compact
              className="flex-1"
            />
            <div className="flex items-center gap-0.5 rounded-xl shadow-sm bg-white p-0.5">
              {(['active', 'archived', 'all'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-3.5 min-h-11 rounded-lg text-sm font-semibold capitalize',
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
          <motion.div variants={fadeUp}>
          {showLoading ? (
            <Skeleton variant="list-item" count={5} />
          ) : !collectives?.length ? (
            <EmptyState
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
            <motion.div layout className="space-y-2">
              {collectives.map((c) => {
                return (
                  <motion.div
                    key={c.id}
                    layout="position"
                  >
                    <Link
                      to={`/admin/collectives/${c.id}`}
                      className={cn(
                        'flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl',
                        'bg-white shadow-sm',
                        'active:scale-[0.99] transition-[color,background-color,transform] duration-150',
                        !c.is_active && 'opacity-60',
                      )}
                    >
                      {/* Cover image */}
                      {c.cover_image_url ? (
                        <img
                          src={c.cover_image_url}
                          alt=""
                          className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                          <MapPin size={20} className="text-neutral-400 sm:hidden" />
                          <MapPin size={24} className="text-neutral-400 hidden sm:block" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-heading text-sm font-semibold text-neutral-900 truncate">
                            {c.name}
                          </p>
                          {!c.is_active && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 shrink-0">
                              Archived
                            </span>
                          )}
                        </div>
                        {(c.region || c.state) && (
                          <p className="text-[11px] sm:text-xs text-neutral-400 flex items-center gap-1 truncate">
                            <MapPin size={12} className="shrink-0" />
                            <span className="truncate">{[c.region, c.state].filter(Boolean).join(', ')}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] sm:text-xs text-neutral-400">
                          <span className="flex items-center gap-1 shrink-0">
                            <Users size={12} className="shrink-0" /> {c.memberCount} members
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <CalendarDays size={12} className="shrink-0" /> {c.eventCount} events
                          </span>
                          {c.leaderName && (
                            <span className="flex items-center gap-1 min-w-0 max-w-full">
                              <Crown size={12} className="shrink-0" />
                              <span className="truncate">{c.leaderName}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setArchiveTarget(c)
                          }}
                          className="flex items-center justify-center min-w-10 min-h-10 sm:min-w-11 sm:min-h-11 rounded-lg text-neutral-400 hover:bg-neutral-50 cursor-pointer active:scale-[0.93] transition-[colors,transform]"
                          aria-label={c.is_active ? `Archive ${c.name}` : `Restore ${c.name}`}
                        >
                          {c.is_active ? <Archive size={16} /> : <RotateCcw size={16} />}
                        </button>
                        <ChevronRight size={16} className="text-neutral-300 hidden sm:block" />
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
      <CreateCollectiveModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Archive / Restore confirmation */}
      <ConfirmationSheet
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
