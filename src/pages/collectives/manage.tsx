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
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.85]}>
      <div className="space-y-4">
        <h3 className="font-heading text-lg font-semibold text-neutral-900">
          Edit Collective
        </h3>

        {/* Cover image */}
        <div>
          <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Cover Image
          </label>
          <div className="mt-1.5 relative rounded-sm overflow-hidden bg-neutral-100" style={{ aspectRatio: '16/9' }}>
            {coverPreview ? (
              <img src={coverPreview} alt="Cover" loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-neutral-400 gap-1.5">
                <ImagePlus size={28} />
                <span className="text-[11px] font-medium">Add a cover photo</span>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="bg-white rounded-sm px-4 py-2 shadow-sm">
                  <p className="text-xs font-semibold text-primary-700 tabular-nums">{progress ?? 0}%</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Camera size={14} />}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {coverPreview ? 'Replace' : 'Upload'}
            </Button>
            {coverPreview && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => setCoverPreview(null)}
                disabled={uploading}
              >
                Remove
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverUpload}
            />
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Name
          </label>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collective name"
            className="mt-1"
          />
        </div>

        {/* Description */}
        <Input
          type="textarea"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell people what your collective is about..."
          rows={3}
        />

        {/* Region + State */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Region
            </label>
            <PlaceAutocomplete
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
          <Dropdown
            label="State"
            placeholder="Select..."
            options={AUSTRALIAN_STATES.map((s) => ({ value: s, label: s }))}
            value={state}
            onChange={setState}
            className="mt-1"
          />
        </div>

        <Button
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
    <BottomSheet open={!!member} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <h3 className="font-heading text-lg font-semibold text-neutral-900">
          Change Role
        </h3>
        <p className="text-sm text-neutral-500">
          {member.profiles?.display_name ?? 'Member'} is currently <strong>{ROLE_LABELS[member.role!]}</strong>
        </p>

        <div className="space-y-2">
          {assignableRoles.map((role) => {
            const Icon = ROLE_ICONS[role]
            const isActive = member.role === role

            return (
              <button
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
                <Icon size={18} className={isActive ? 'text-primary-500' : 'text-primary-400'} />
                <span className="font-medium">{ROLE_LABELS[role]}</span>
                {isActive && (
                  <span className="ml-auto text-xs text-primary-500 font-semibold">Current</span>
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
      <Page swipeBack header={<Header title="Manage" back />}>
        <div className="py-4 space-y-4">
          <Skeleton variant="card" />
          <Skeleton variant="list-item" count={6} />
        </div>
      </Page>
    )
  }

  if (!collective || !canManage) {
    return (
      <Page swipeBack header={<Header title="Manage" back />}>
        <EmptyState
          illustration="error"
          title="Access denied"
          description="Only leaders and co-leaders can manage the collective"
          action={{ label: 'Go Back', onClick: () => navigate(-1) }}
        />
      </Page>
    )
  }

  return (
    <Page
      swipeBack
      header={
        <Header
          title="Manage Collective"
          back
          rightActions={
            <button
              type="button"
              onClick={handleExportCSV}
              aria-label="Export members CSV"
              className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
            >
              <Download size={20} />
            </button>
          }
        />
      }
    >
      <motion.div variants={shouldReduceMotion ? undefined : stagger} initial="hidden" animate="visible" className="space-y-6 py-4">
        {/* Collective info card */}
        <motion.div variants={fadeUp} className="rounded-md bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-sm bg-primary-100">
              {collective.cover_image_url ? (
                <img src={collective.cover_image_url} alt={collective.name} loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Users size={24} className="text-primary-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-base font-semibold text-neutral-900 truncate">
                {collective.name}
              </h3>
              <p className="text-xs text-neutral-500">
                {collective.member_count} members
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<Pencil size={16} />}
              onClick={() => setShowEdit(true)}
            >
              Edit
            </Button>
          </div>
        </motion.div>

        {/* Member search */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-sm font-semibold text-neutral-500 uppercase tracking-wider">
              Members ({members.length})
            </h3>
          </div>

          <div className="mb-3">
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search by name, email, or Instagram..." compact />
          </div>

          {/* Role filter pills */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-none">
            {(['all', 'leader', 'co_leader', 'assist_leader', 'participant'] as const).map((r) => (
              <button
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
          <motion.div variants={shouldReduceMotion ? undefined : listStagger} initial="hidden" animate="visible" className="space-y-1">
            {filteredMembers.map((member) => {
              const Icon = ROLE_ICONS[member.role!]
              const isCurrentUser = member.user_id === user?.id

              return (
                <motion.div
                  key={member.id}
                  variants={fadeUp}
                  layout
                  className="flex items-center gap-3 rounded-sm px-3 py-2.5 hover:bg-neutral-50 transition-colors"
                >
                  {/* Avatar - tappable to user card */}
                  <button
                    type="button"
                    onClick={() => setSelectedUser(member)}
                    aria-label={`View ${member.profiles?.display_name}`}
                    className="flex items-center justify-center min-h-11 min-w-11 rounded-full active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                  >
                    <Avatar
                      src={member.profiles?.avatar_url}
                      name={member.profiles?.display_name}
                      size="sm"
                    />
                  </button>

                  {/* Name + role */}
                  <button
                    type="button"
                    onClick={() => setSelectedUser(member)}
                    className="flex-1 min-w-0 min-h-11 text-left active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                  >
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {member.profiles?.display_name ?? 'Unknown'}
                      {isCurrentUser && (
                        <span className="text-xs text-neutral-500 ml-1">(you)</span>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                        ROLE_COLORS[member.role!],
                      )}>
                        <Icon size={10} />
                        {ROLE_LABELS[member.role!]}
                      </span>
                    </div>
                  </button>

                  {/* Actions: not for self; leaders can manage up to co_leader, others only below their rank */}
                  {!isCurrentUser && (myRole === 'leader' ? ROLE_RANK[member.role!] <= ROLE_RANK.co_leader : ROLE_RANK[member.role!] < (myRole ? ROLE_RANK[myRole] : -1)) && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setRoleAssignMember(member)}
                        aria-label="Change role"
                        className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                      >
                        <Shield size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovingMember(member)}
                        aria-label="Remove member"
                        className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 hover:bg-error-50 hover:text-error-500 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                      >
                        <UserMinus size={16} />
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
      <EditCollectiveSheet
        open={showEdit}
        onClose={() => setShowEdit(false)}
        collective={collective}
        onSave={handleSaveCollective}
        isSaving={updateCollective.isPending}
      />

      {/* Role assignment sheet */}
      <RoleAssignSheet
        member={roleAssignMember}
        onClose={() => setRoleAssignMember(null)}
        onAssign={handleAssignRole}
        myRole={myRole}
      />

      {/* Remove member confirmation */}
      <ConfirmationSheet
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
        <BottomSheet open={!!selectedUser} onClose={() => setSelectedUser(null)}>
          <div className="flex flex-col items-center py-2">
            <Avatar
              src={selectedUser.profiles?.avatar_url}
              name={selectedUser.profiles?.display_name}
              size="xl"
            />
            <h3 className="mt-3 font-heading text-lg font-bold text-neutral-900">
              {selectedUser.profiles?.display_name}
            </h3>
            {selectedUser.profiles?.pronouns && (
              <span className="text-xs text-neutral-500">{selectedUser.profiles.pronouns}</span>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                ROLE_COLORS[selectedUser.role!],
              )}>
                {ROLE_LABELS[selectedUser.role!]}
              </span>
              {selectedUser.profiles?.location && (
                <span className="text-xs text-neutral-500">{selectedUser.profiles.location}</span>
              )}
            </div>
            <div className="mt-4 w-full">
              <Button
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
