import { useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Download,
  UserMinus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Crown,
  Pencil,
  Users,
  Camera,
  ImagePlus,
  Trash2,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Avatar } from '@/components/avatar'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { SearchBar } from '@/components/search-bar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { COLLECTIVE_ROLE_RANK } from '@/lib/constants'
import { useAuth } from '@/hooks/use-auth'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import { useImageUpload } from '@/hooks/use-image-upload'
import {
  useCollective,
  useCollectiveMembers,
  useUpdateCollective,
  useRemoveMember,
  useUpdateMemberRole,
  exportMembersCSV,
  type CollectiveMemberWithProfile,
} from '@/hooks/use-collective'
import type { Database } from '@/types/database.types'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { PlaceAutocomplete } from '@/components/place-autocomplete'

type CollectiveRole = Database['public']['Enums']['collective_role']

/* ------------------------------------------------------------------ */
/*  Role config                                                        */
/* ------------------------------------------------------------------ */

const ROLE_LABELS: Record<string, string> = {
  leader: 'Leader',
  co_leader: 'Co-Leader',
  assist_leader: 'Assistant Leader',
  participant: 'Participant',
  member: 'Participant',
}

const ROLE_ICONS: Record<string, typeof Crown> = {
  leader: Crown,
  co_leader: ShieldCheck,
  assist_leader: ShieldAlert,
  participant: Users,
  member: Users,
}

const ROLE_COLORS: Record<string, string> = {
  leader: 'text-warning-600 bg-warning-50',
  co_leader: 'text-primary-400 bg-white',
  assist_leader: 'text-info-600 bg-info-50',
  participant: 'text-primary-400 bg-white',
  member: 'text-primary-400 bg-white',
}

const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const

/* ------------------------------------------------------------------ */
/*  Edit collective sheet                                              */
/* ------------------------------------------------------------------ */

function EditCollectiveSheet({
  open,
  onClose,
  collective,
  onSave,
  isSaving,
}: {
  open: boolean
  onClose: () => void
  collective: { name: string; description: string | null; cover_image_url: string | null; region: string | null; state: string | null } | null
  onSave: (updates: { name: string; description: string; region: string; state: string; cover_image_url: string | null }) => void
  isSaving: boolean
}) {
  const [name, setName] = useState(collective?.name ?? '')
  const [description, setDescription] = useState(collective?.description ?? '')
  const [region, setRegion] = useState(collective?.region ?? '')
  const [state, setState] = useState(collective?.state ?? '')
  const [coverPreview, setCoverPreview] = useState<string | null>(collective?.cover_image_url ?? null)
  const { upload, uploading, progress } = useImageUpload({ bucket: 'collective-images', pathPrefix: 'covers' })
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await upload(file)
      setCoverPreview(result.url)
    } catch {
      toast.error('Failed to upload image')
    }
  }

  return (
    <BottomSheet data-eos-id="src/pages/collectives/manage.tsx#0" open={open} onClose={onClose} snapPoints={[0.85]}>
      <div data-eos-id="src/pages/collectives/manage.tsx#1" className="space-y-4">
        <h3 data-eos-id="src/pages/collectives/manage.tsx#2" className="font-heading text-lg font-semibold text-neutral-900">
          Edit Collective
        </h3>

        {/* Cover image */}
        <div data-eos-id="src/pages/collectives/manage.tsx#3">
          <label data-eos-id="src/pages/collectives/manage.tsx#4" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Cover Image
          </label>
          <div data-eos-id="src/pages/collectives/manage.tsx#5" className="mt-1.5 relative rounded-sm overflow-hidden bg-neutral-100" style={{ aspectRatio: '16/9' }}>
            {coverPreview ? (
              <img data-eos-id="src/pages/collectives/manage.tsx#6" src={coverPreview} alt="Cover" loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <div data-eos-id="src/pages/collectives/manage.tsx#7" className="flex flex-col items-center justify-center h-full text-neutral-400 gap-1.5">
                <ImagePlus data-eos-id="src/pages/collectives/manage.tsx#8" size={28} />
                <span data-eos-id="src/pages/collectives/manage.tsx#9" className="text-[11px] font-medium">Add a cover photo</span>
              </div>
            )}
            {uploading && (
              <div data-eos-id="src/pages/collectives/manage.tsx#10" className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div data-eos-id="src/pages/collectives/manage.tsx#11" className="bg-white rounded-sm px-4 py-2 shadow-sm">
                  <p data-eos-id="src/pages/collectives/manage.tsx#12" className="text-xs font-semibold text-primary-700 tabular-nums">{progress ?? 0}%</p>
                </div>
              </div>
            )}
          </div>
          <div data-eos-id="src/pages/collectives/manage.tsx#13" className="flex items-center gap-2 mt-2">
            <Button data-eos-id="src/pages/collectives/manage.tsx#14"
              variant="secondary"
              size="sm"
              icon={<Camera data-eos-id="src/pages/collectives/manage.tsx#15" size={14} />}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {coverPreview ? 'Replace' : 'Upload'}
            </Button>
            {coverPreview && (
              <Button data-eos-id="src/pages/collectives/manage.tsx#16"
                variant="ghost"
                size="sm"
                icon={<Trash2 data-eos-id="src/pages/collectives/manage.tsx#17" size={14} />}
                onClick={() => setCoverPreview(null)}
                disabled={uploading}
              >
                Remove
              </Button>
            )}
            <input data-eos-id="src/pages/collectives/manage.tsx#18"
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverUpload}
            />
          </div>
        </div>

        {/* Name */}
        <div data-eos-id="src/pages/collectives/manage.tsx#19">
          <label data-eos-id="src/pages/collectives/manage.tsx#20" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Name
          </label>
          <Input data-eos-id="src/pages/collectives/manage.tsx#21"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collective name"
            className="mt-1"
          />
        </div>

        {/* Description */}
        <Input data-eos-id="src/pages/collectives/manage.tsx#22"
          type="textarea"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell people what your collective is about..."
          rows={3}
        />

        {/* Region + State */}
        <div data-eos-id="src/pages/collectives/manage.tsx#23" className="grid grid-cols-2 gap-3">
          <div data-eos-id="src/pages/collectives/manage.tsx#24">
            <label data-eos-id="src/pages/collectives/manage.tsx#25" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Region
            </label>
            <PlaceAutocomplete data-eos-id="src/pages/collectives/manage.tsx#26"
              label="Region"
              value={region}
              onChange={(val, place) => {
                setRegion(val)
                if (place) {
                  // Auto-fill state from geocoded result
                  const stateMatch = place.short_name.split(',').pop()?.trim()
                  const matched = AUSTRALIAN_STATES.find((s) => stateMatch?.includes(s))
                  if (matched) setState(matched)
                }
              }}
              placeholder="e.g. Byron Bay"
              className="mt-1"
            />
          </div>
          <Dropdown data-eos-id="src/pages/collectives/manage.tsx#27"
            label="State"
            placeholder="Select..."
            options={AUSTRALIAN_STATES.map((s) => ({ value: s, label: s }))}
            value={state}
            onChange={setState}
            className="mt-1"
          />
        </div>

        <Button data-eos-id="src/pages/collectives/manage.tsx#28"
          variant="primary"
          fullWidth
          loading={isSaving || uploading}
          disabled={uploading}
          onClick={() => onSave({ name, description, region, state, cover_image_url: coverPreview })}
        >
          Save Changes
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Role assignment sheet                                              */
/* ------------------------------------------------------------------ */

const ROLE_RANK = COLLECTIVE_ROLE_RANK as Record<CollectiveRole, number>

function RoleAssignSheet({
  member,
  onClose,
  onAssign,
  myRole,
}: {
  member: CollectiveMemberWithProfile | null
  onClose: () => void
  onAssign: (role: CollectiveRole) => void
  myRole: CollectiveRole | null
}) {
  if (!member) return null
  const myRank = myRole ? ROLE_RANK[myRole] : -1
  // Leaders can assign up to co_leader; co-leaders can assign up to assist_leader
  const assignableRoles = (['participant', 'assist_leader', 'co_leader'] as CollectiveRole[]).filter(
    (r) => myRole === 'leader' ? ROLE_RANK[r] <= ROLE_RANK.co_leader : ROLE_RANK[r] < myRank,
  )

  return (
    <BottomSheet data-eos-id="src/pages/collectives/manage.tsx#29" open={!!member} onClose={onClose}>
      <div data-eos-id="src/pages/collectives/manage.tsx#30" className="space-y-3 pb-2">
        <h3 data-eos-id="src/pages/collectives/manage.tsx#31" className="font-heading text-lg font-semibold text-neutral-900">
          Change Role
        </h3>
        <p data-eos-id="src/pages/collectives/manage.tsx#32" data-eos-var="member.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="text-sm text-neutral-500">
          {member.profiles?.display_name ?? 'Member'} is currently <strong data-eos-id="src/pages/collectives/manage.tsx#33" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop">{ROLE_LABELS[member.role!]}</strong>
        </p>

        <div data-eos-id="src/pages/collectives/manage.tsx#34" className="space-y-2">
          {assignableRoles.map((role) => {
            const Icon = ROLE_ICONS[role]
            const isActive = member.role === role

            return (
              <button data-eos-id="src/pages/collectives/manage.tsx#35"
                key={role}
                type="button"
                onClick={() => onAssign(role)}
                disabled={isActive}
                className={cn(
                  'flex w-full items-center gap-3 rounded-sm px-4 py-3 min-h-11 text-sm active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none',
                  isActive
                    ? 'bg-white text-primary-400'
                    : 'text-neutral-900 hover:bg-neutral-50',
                )}
              >
                <Icon data-eos-id="src/pages/collectives/manage.tsx#36" size={18} className={isActive ? 'text-primary-500' : 'text-primary-400'} />
                <span data-eos-id="src/pages/collectives/manage.tsx#37" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="font-medium">{ROLE_LABELS[role]}</span>
                {isActive && (
                  <span data-eos-id="src/pages/collectives/manage.tsx#38" className="ml-auto text-xs text-primary-500 font-semibold">Current</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CollectiveManagePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, isStaff } = useAuth()

  // Fetch collective by slug, derive UUID for sub-queries
  const { data: collective, isLoading: loadingCollective } = useCollective(slug)
  const collectiveId = collective?.id
  const { isLeader, isCoLeader, role: myRole } = useCollectiveRole(collectiveId)
  const canManage = isLeader || isCoLeader || isStaff
  const { data: members = [], isLoading: loadingMembers } = useCollectiveMembers(collectiveId)
  const showLoading = useDelayedLoading(loadingCollective || loadingMembers)
  const updateCollective = useUpdateCollective()
  const removeMember = useRemoveMember()
  const updateRole = useUpdateMemberRole()

  const shouldReduceMotion = useReducedMotion()

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  }

  const listStagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.03 } },
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<CollectiveRole | 'all'>('all')
  const [showEdit, setShowEdit] = useState(false)
  const [roleAssignMember, setRoleAssignMember] = useState<CollectiveMemberWithProfile | null>(null)
  const [removingMember, setRemovingMember] = useState<CollectiveMemberWithProfile | null>(null)
  const [selectedUser, setSelectedUser] = useState<CollectiveMemberWithProfile | null>(null)

  const filteredMembers = useMemo(() => {
    let result = members
    if (roleFilter !== 'all') {
      result = result.filter((m) => m.role === roleFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((m) => {
        const p = m.profiles
        return (
          p?.display_name?.toLowerCase().includes(q) ||
          p?.email?.toLowerCase().includes(q) ||
          p?.instagram_handle?.toLowerCase().includes(q)
        )
      })
    }
    return result
  }, [members, searchQuery, roleFilter])

  const handleSaveCollective = async (updates: { name: string; description: string; region: string; state: string; cover_image_url: string | null }) => {
    if (!collectiveId) return
    try {
      await updateCollective.mutateAsync({
        collectiveId,
        updates: {
          name: updates.name,
          description: updates.description || null,
          region: updates.region || null,
          state: updates.state || null,
          cover_image_url: updates.cover_image_url,
        },
      })
      setShowEdit(false)
      toast.success('Collective updated')
    } catch {
      toast.error('Failed to update collective')
    }
  }

  const handleRemoveMember = async () => {
    if (!collectiveId || !removingMember) return
    try {
      await removeMember.mutateAsync({
        collectiveId,
        userId: removingMember.user_id,
      })
      toast.success('Member removed')
    } catch {
      toast.error('Failed to remove member')
    }
    setRemovingMember(null)
  }

  const handleAssignRole = async (role: CollectiveRole) => {
    if (!collectiveId || !roleAssignMember) return
    try {
      await updateRole.mutateAsync({
        collectiveId,
        userId: roleAssignMember.user_id,
        role,
      })
      setRoleAssignMember(null)
      toast.success(`Role updated to ${ROLE_LABELS[role]}`)
    } catch {
      toast.error('Failed to update role')
    }
  }

  const handleExportCSV = () => {
    exportMembersCSV(members)
    toast.success('CSV downloaded')
  }

  if (showLoading || loadingCollective || loadingMembers) {
    return (
      <Page data-eos-id="src/pages/collectives/manage.tsx#39" swipeBack header={<Header data-eos-id="src/pages/collectives/manage.tsx#40" title="Manage" back />}>
        <div data-eos-id="src/pages/collectives/manage.tsx#41" className="py-4 space-y-4">
          <Skeleton data-eos-id="src/pages/collectives/manage.tsx#42" variant="card" />
          <Skeleton data-eos-id="src/pages/collectives/manage.tsx#43" variant="list-item" count={6} />
        </div>
      </Page>
    )
  }

  if (!collective || !canManage) {
    return (
      <Page data-eos-id="src/pages/collectives/manage.tsx#44" swipeBack header={<Header data-eos-id="src/pages/collectives/manage.tsx#45" title="Manage" back />}>
        <EmptyState data-eos-id="src/pages/collectives/manage.tsx#46"
          illustration="error"
          title="Access denied"
          description="Only leaders and co-leaders can manage the collective"
          action={{ label: 'Go Back', onClick: () => navigate(-1) }}
        />
      </Page>
    )
  }

  return (
    <Page data-eos-id="src/pages/collectives/manage.tsx#47"
      swipeBack
      header={
        <Header data-eos-id="src/pages/collectives/manage.tsx#48"
          title="Manage Collective"
          back
          rightActions={
            <button data-eos-id="src/pages/collectives/manage.tsx#49"
              type="button"
              onClick={handleExportCSV}
              aria-label="Export members CSV"
              className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
            >
              <Download data-eos-id="src/pages/collectives/manage.tsx#50" size={20} />
            </button>
          }
        />
      }
    >
      <motion.div data-eos-id="src/pages/collectives/manage.tsx#51" variants={shouldReduceMotion ? undefined : stagger} initial="hidden" animate="visible" className="space-y-6 py-4">
        {/* Collective info card */}
        <motion.div data-eos-id="src/pages/collectives/manage.tsx#52" variants={fadeUp} className="rounded-md bg-white p-4 shadow-sm">
          <div data-eos-id="src/pages/collectives/manage.tsx#53" className="flex items-center gap-3">
            <div data-eos-id="src/pages/collectives/manage.tsx#54" className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-sm bg-primary-100">
              {collective.cover_image_url ? (
                <img data-eos-id="src/pages/collectives/manage.tsx#55" src={collective.cover_image_url} alt={collective.name} loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <div data-eos-id="src/pages/collectives/manage.tsx#56" className="flex h-full w-full items-center justify-center">
                  <Users data-eos-id="src/pages/collectives/manage.tsx#57" size={24} className="text-primary-400" />
                </div>
              )}
            </div>
            <div data-eos-id="src/pages/collectives/manage.tsx#58" className="flex-1 min-w-0">
              <h3 data-eos-id="src/pages/collectives/manage.tsx#59" data-eos-var="collective.name" data-eos-var-label="Name" data-eos-var-scope="prop" className="font-heading text-base font-semibold text-neutral-900 truncate">
                {collective.name}
              </h3>
              <p data-eos-id="src/pages/collectives/manage.tsx#60" data-eos-var="collective.member_count" data-eos-var-label="Member count" data-eos-var-scope="prop" className="text-xs text-neutral-500">
                {collective.member_count} members
              </p>
            </div>
            <Button data-eos-id="src/pages/collectives/manage.tsx#61"
              variant="ghost"
              size="sm"
              icon={<Pencil data-eos-id="src/pages/collectives/manage.tsx#62" size={16} />}
              onClick={() => setShowEdit(true)}
            >
              Edit
            </Button>
          </div>
        </motion.div>

        {/* Member search */}
        <motion.div data-eos-id="src/pages/collectives/manage.tsx#63" variants={fadeUp}>
          <div data-eos-id="src/pages/collectives/manage.tsx#64" className="flex items-center justify-between mb-3">
            <h3 data-eos-id="src/pages/collectives/manage.tsx#65" className="font-heading text-sm font-semibold text-neutral-500 uppercase tracking-wider">
              Members ({members.length})
            </h3>
          </div>

          <div data-eos-id="src/pages/collectives/manage.tsx#66" className="mb-3">
            <SearchBar data-eos-id="src/pages/collectives/manage.tsx#67" value={searchQuery} onChange={setSearchQuery} placeholder="Search by name, email, or Instagram..." compact />
          </div>

          {/* Role filter pills */}
          <div data-eos-id="src/pages/collectives/manage.tsx#68" className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-none">
            {(['all', 'leader', 'co_leader', 'assist_leader', 'participant'] as const).map((r) => (
              <button data-eos-id="src/pages/collectives/manage.tsx#69" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop"
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer select-none',
                  roleFilter === r
                    ? 'bg-moss-600 text-white shadow-sm'
                    : 'bg-white text-neutral-500 border border-neutral-100 hover:bg-neutral-50',
                )}
              >
                {r === 'all' ? 'All' : ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Member list */}
          <motion.div data-eos-id="src/pages/collectives/manage.tsx#70" variants={shouldReduceMotion ? undefined : listStagger} initial="hidden" animate="visible" className="space-y-1">
            {filteredMembers.map((member) => {
              const Icon = ROLE_ICONS[member.role!]
              const isCurrentUser = member.user_id === user?.id

              return (
                <motion.div data-eos-id="src/pages/collectives/manage.tsx#71"
                  key={member.id}
                  variants={fadeUp}
                  layout
                  className="flex items-center gap-3 rounded-sm px-3 py-2.5 hover:bg-neutral-50 transition-colors"
                >
                  {/* Avatar - tappable to user card */}
                  <button data-eos-id="src/pages/collectives/manage.tsx#72"
                    type="button"
                    onClick={() => setSelectedUser(member)}
                    aria-label={`View ${member.profiles?.display_name}`}
                    className="flex items-center justify-center min-h-11 min-w-11 rounded-full active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                  >
                    <Avatar data-eos-id="src/pages/collectives/manage.tsx#73"
                      src={member.profiles?.avatar_url}
                      name={member.profiles?.display_name}
                      size="sm"
                    />
                  </button>

                  {/* Name + role */}
                  <button data-eos-id="src/pages/collectives/manage.tsx#74"
                    type="button"
                    onClick={() => setSelectedUser(member)}
                    className="flex-1 min-w-0 min-h-11 text-left active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                  >
                    <p data-eos-id="src/pages/collectives/manage.tsx#75" data-eos-var="member.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900 truncate">
                      {member.profiles?.display_name ?? 'Unknown'}
                      {isCurrentUser && (
                        <span data-eos-id="src/pages/collectives/manage.tsx#76" className="text-xs text-neutral-500 ml-1">(you)</span>
                      )}
                    </p>
                    <div data-eos-id="src/pages/collectives/manage.tsx#77" className="flex items-center gap-1.5 mt-0.5">
                      <span data-eos-id="src/pages/collectives/manage.tsx#78" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className={cn(
                        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                        ROLE_COLORS[member.role!],
                      )}>
                        <Icon data-eos-id="src/pages/collectives/manage.tsx#79" size={10} />
                        {ROLE_LABELS[member.role!]}
                      </span>
                    </div>
                  </button>

                  {/* Actions: not for self; leaders can manage up to co_leader, others only below their rank */}
                  {!isCurrentUser && (myRole === 'leader' ? ROLE_RANK[member.role!] <= ROLE_RANK.co_leader : ROLE_RANK[member.role!] < (myRole ? ROLE_RANK[myRole] : -1)) && (
                    <div data-eos-id="src/pages/collectives/manage.tsx#80" className="flex items-center gap-1">
                      <button data-eos-id="src/pages/collectives/manage.tsx#81"
                        type="button"
                        onClick={() => setRoleAssignMember(member)}
                        aria-label="Change role"
                        className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                      >
                        <Shield data-eos-id="src/pages/collectives/manage.tsx#82" size={16} />
                      </button>
                      <button data-eos-id="src/pages/collectives/manage.tsx#83"
                        type="button"
                        onClick={() => setRemovingMember(member)}
                        aria-label="Remove member"
                        className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 hover:bg-error-50 hover:text-error-500 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                      >
                        <UserMinus data-eos-id="src/pages/collectives/manage.tsx#84" size={16} />
                      </button>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Edit collective sheet */}
      <EditCollectiveSheet data-eos-id="src/pages/collectives/manage.tsx#85"
        open={showEdit}
        onClose={() => setShowEdit(false)}
        collective={collective}
        onSave={handleSaveCollective}
        isSaving={updateCollective.isPending}
      />

      {/* Role assignment sheet */}
      <RoleAssignSheet data-eos-id="src/pages/collectives/manage.tsx#86"
        member={roleAssignMember}
        onClose={() => setRoleAssignMember(null)}
        onAssign={handleAssignRole}
        myRole={myRole}
      />

      {/* Remove member confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/collectives/manage.tsx#87"
        open={!!removingMember}
        onClose={() => setRemovingMember(null)}
        onConfirm={handleRemoveMember}
        title="Remove member?"
        description={`${removingMember?.profiles?.display_name ?? 'This member'} will be removed from the collective and lose access to the group chat.`}
        confirmLabel="Remove Member"
        variant="danger"
      />

      {/* User card bottom sheet */}
      {selectedUser && (
        <BottomSheet data-eos-id="src/pages/collectives/manage.tsx#88" open={!!selectedUser} onClose={() => setSelectedUser(null)}>
          <div data-eos-id="src/pages/collectives/manage.tsx#89" className="flex flex-col items-center py-2">
            <Avatar data-eos-id="src/pages/collectives/manage.tsx#90"
              src={selectedUser.profiles?.avatar_url}
              name={selectedUser.profiles?.display_name}
              size="xl"
            />
            <h3 data-eos-id="src/pages/collectives/manage.tsx#91" data-eos-var="selectedUser.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="mt-3 font-heading text-lg font-bold text-neutral-900">
              {selectedUser.profiles?.display_name}
            </h3>
            {selectedUser.profiles?.pronouns && (
              <span data-eos-id="src/pages/collectives/manage.tsx#92" data-eos-var="selectedUser.profiles.pronouns" data-eos-var-label="Pronouns" data-eos-var-scope="prop" className="text-xs text-neutral-500">{selectedUser.profiles.pronouns}</span>
            )}
            <div data-eos-id="src/pages/collectives/manage.tsx#93" className="flex items-center gap-2 mt-2">
              <span data-eos-id="src/pages/collectives/manage.tsx#94" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                ROLE_COLORS[selectedUser.role!],
              )}>
                {ROLE_LABELS[selectedUser.role!]}
              </span>
              {selectedUser.profiles?.location && (
                <span data-eos-id="src/pages/collectives/manage.tsx#95" data-eos-var="selectedUser.profiles.location" data-eos-var-label="Location" data-eos-var-scope="prop" className="text-xs text-neutral-500">{selectedUser.profiles.location}</span>
              )}
            </div>
            <div data-eos-id="src/pages/collectives/manage.tsx#96" className="mt-4 w-full">
              <Button data-eos-id="src/pages/collectives/manage.tsx#97"
                variant="primary"
                fullWidth
                onClick={() => {
                  setSelectedUser(null)
                  navigate(`/profile/${selectedUser.user_id}`)
                }}
              >
                View Full Profile
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}
    </Page>
  )
}
