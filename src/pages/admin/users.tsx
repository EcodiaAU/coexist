import { useState, useCallback, useMemo, useEffect } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { formatRole } from '@/lib/labels-and-enums'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { adminVariants, expandCollapse as expandCollapseVariants } from '@/lib/admin-motion'
import {
    Users,
    Shield,
    Ban,
    Trash2,
    KeyRound,
    UserCog,
    Crown,
    ShieldCheck,
    ShieldAlert,
    Plus,
    X,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    XCircle,
    Sparkles,
    Settings,
} from 'lucide-react'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { SearchBar } from '@/components/search-bar'
import { Dropdown } from '@/components/dropdown'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { Avatar } from '@/components/avatar'
import { Toggle } from '@/components/toggle'
import { ProfileModal } from '@/components/profile-modal'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import {
    useUserCollectiveRoles,
    useAdminAssignCollectiveRole,
    useAdminRemoveFromCollective,
    useAdminUpdateCapabilities,
    useUserResolvedCapabilities,
    useUserManagedCollectives,
    useAdminUpdateManagedCollectives,
} from '@/hooks/use-admin-user-roles'
import {
    CAPABILITIES,
    CATEGORY_LABELS,
    ROLE_DEFAULT_CAPS,
    type CapabilityDef,
} from '@/lib/capabilities'
import type { Database } from '@/types/database.types'

type CollectiveRole = Database['public']['Enums']['collective_role']
type UserRole = Database['public']['Enums']['user_role']

/** Shape returned by the admin_list_users RPC */
interface AdminUserRow {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
  role: string
  is_suspended: boolean
  created_at: string
  [key: string]: unknown
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 30

function useAdminUsers(search: string, roleFilter: string) {
  return useInfiniteQuery({
    queryKey: ['admin-users', search, roleFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase.rpc('admin_list_users', {
        search_term: search,
        role_filter: roleFilter,
        result_limit: PAGE_SIZE,
        offset_val: pageParam,
      })
      if (error) throw error
      return (data ?? []) as unknown as AdminUserRow[]
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    staleTime: 30 * 1000,
  })
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function useAllCollectives() {
  return useQuery({
    queryKey: ['admin-all-collectives-simple'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collectives')
        .select('id, name, slug, state, region')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

const roleOptions = [
  { value: 'all', label: 'All Roles' },
  { value: 'participant', label: 'Participant' },
  { value: 'assist_leader', label: 'Assistant Leader' },
  { value: 'co_leader', label: 'Co-Leader' },
  { value: 'leader', label: 'Leader' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
]

const roleBadgeColors: Record<string, string> = {
  participant: 'bg-primary-100 text-primary-500',
  assist_leader: 'bg-moss-100 text-moss-700',
  co_leader: 'bg-sprout-200 text-sprout-800',
  leader: 'bg-info-200 text-info-800',
  manager: 'bg-plum-200 text-plum-800',
  admin: 'bg-error-200 text-error-800',
}

const collectiveRoleOptions: { value: CollectiveRole; label: string }[] = [
  { value: 'leader', label: 'Leader' },
  { value: 'co_leader', label: 'Co-Leader' },
  { value: 'assist_leader', label: 'Assistant Leader' },
  { value: 'participant', label: 'Participant' },
]

const COLLECTIVE_ROLE_ICONS: Record<string, typeof Crown> = {
  leader: Crown,
  co_leader: ShieldCheck,
  assist_leader: ShieldAlert,
  participant: Users,
}

const COLLECTIVE_ROLE_COLORS: Record<string, string> = {
  leader: 'bg-warning-200 text-warning-800',
  co_leader: 'bg-neutral-200 text-neutral-800',
  assist_leader: 'bg-info-200 text-info-800',
  participant: 'bg-neutral-200 text-neutral-700',
}

const COLLECTIVE_ROLE_SURFACE: Record<string, string> = {
  leader: 'bg-warning-50 ring-1 ring-warning-200/60',
  co_leader: 'bg-neutral-50 ring-1 ring-neutral-200/60',
  assist_leader: 'bg-info-50 ring-1 ring-info-200/60',
  participant: 'bg-white ring-1 ring-primary-100/50',
}

/* ------------------------------------------------------------------ */
/*  Unified User Settings Sheet                                        */
/* ------------------------------------------------------------------ */

function UserSettingsSheet({
  user,
  open,
  onClose,
}: {
  user: AdminUserRow
  open: boolean
  onClose: () => void
}) {
  const { user: currentUser, isSuperAdmin } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: collectiveRoles, isLoading: rolesLoading } = useUserCollectiveRoles(user?.id)
  const { data: capsData, isLoading: capsLoading } = useUserResolvedCapabilities(user?.id)
  const { data: allCollectives } = useAllCollectives()
  const assignRole = useAdminAssignCollectiveRole()
  const removeFromCollective = useAdminRemoveFromCollective()
  const updateCaps = useAdminUpdateCapabilities()
  const { data: managedCollectives } = useUserManagedCollectives(user?.role === 'manager' ? user?.id : undefined)
  const updateManagedCollectives = useAdminUpdateManagedCollectives()

  const [showAddCollective, setShowAddCollective] = useState(false)
  const [addCollectiveId, setAddCollectiveId] = useState('')
  const [addCollectiveRole, setAddCollectiveRole] = useState<CollectiveRole>('participant')
  const [capsExpanded, setCapsExpanded] = useState(false)
  const [showSuspendForm, setShowSuspendForm] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [newRole, setNewRole] = useState('')
  const [showRoleChange, setShowRoleChange] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const availableCollectives = useMemo(() => {
    if (!allCollectives || !collectiveRoles) return []
    const existing = new Set(collectiveRoles.filter((r) => r.status === 'active').map((r) => r.collective_id))
    return allCollectives.filter((c) => !existing.has(c.id))
  }, [allCollectives, collectiveRoles])

  const isStaffRole = user?.role === 'leader' || user?.role === 'manager' || user?.role === 'admin'
  const userRole = (user?.role ?? 'participant') as UserRole

  const capsByCategory = useMemo(() => {
    const grouped: Record<string, CapabilityDef[]> = {}
    for (const cap of CAPABILITIES) {
      if (!grouped[cap.category]) grouped[cap.category] = []
      grouped[cap.category].push(cap)
    }
    return grouped
  }, [])

  const handleToggleCap = useCallback(
    (capKey: string) => {
      if (!capsData || !user) return
      const currentOverrides = { ...capsData.overrides }
      const isDefault = ROLE_DEFAULT_CAPS[userRole].includes(capKey)
      const currentValue = capsData.capabilities.has(capKey)

      if (currentValue) {
        if (isDefault) {
          currentOverrides[capKey] = false
        } else {
          delete currentOverrides[capKey]
        }
      } else {
        if (!isDefault) {
          currentOverrides[capKey] = true
        } else {
          delete currentOverrides[capKey]
        }
      }

      updateCaps.mutate(
        { userId: user.id, permissions: currentOverrides },
        {
          onSuccess: () => toast.success('Permissions updated'),
          onError: () => toast.error('Failed to update permissions'),
        },
      )
    },
    [capsData, user, userRole, updateCaps, toast],
  )

  /* ---- Optimistic cache helpers ---- */
  const patchUserInCache = useCallback(
    (userId: string, patch: Record<string, unknown>) => {
      queryClient.setQueriesData<{ pages: Record<string, unknown>[][]; pageParams: unknown[] }>(
        { queryKey: ['admin-users'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
            ),
          }
        },
      )
    },
    [queryClient],
  )

  const removeUserFromCache = useCallback(
    (userId: string) => {
      queryClient.setQueriesData<{ pages: Record<string, unknown>[][]; pageParams: unknown[] }>(
        { queryKey: ['admin-users'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => page.filter((u) => u.id !== userId)),
          }
        },
      )
    },
    [queryClient],
  )

  /* ---- Mutations ---- */
  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      if (userId === currentUser?.id) {
        throw new Error('You cannot change your own role')
      }
      if ((role === 'admin' || role === 'manager') && !isSuperAdmin) {
        throw new Error('Only admins can assign admin/manager roles')
      }
      const { data: rows, error } = await supabase
        .from('profiles')
        .update({ role: role as UserRole })
        .eq('id', userId)
        .select('id')
      if (error) throw error
      if (!rows?.length) throw new Error('Role update had no effect - check RLS policies')
      await logAudit({ action: 'role_changed', target_type: 'user', target_id: userId, details: { new_role: role } })
    },
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-users'] })
      const previous = queryClient.getQueriesData({ queryKey: ['admin-users'] })
      patchUserInCache(userId, { role })
      setShowRoleChange(false)
      return { previous }
    },
    onSuccess: () => toast.success('Role updated'),
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      toast.error('Failed to update role')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const suspendMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      if (userId === currentUser?.id) {
        throw new Error('You cannot suspend your own account')
      }
      const { error } = await supabase
        .from('profiles')
        .update({ is_suspended: true, suspended_reason: reason })
        .eq('id', userId)
      if (error) throw error
      await logAudit({ action: 'user_suspended', target_type: 'user', target_id: userId, details: { reason } })
    },
    onMutate: async ({ userId }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-users'] })
      const previous = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['admin-users'] })
      patchUserInCache(userId, { is_suspended: true })
      setShowSuspendForm(false)
      setSuspendReason('')
      return { previous }
    },
    onSuccess: () => toast.success('User suspended'),
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      toast.error('Failed to suspend user')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const unsuspendMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_suspended: false, suspended_reason: null })
        .eq('id', userId)
      if (error) throw error
      await logAudit({ action: 'user_unsuspended', target_type: 'user', target_id: userId })
    },
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ['admin-users'] })
      const previous = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['admin-users'] })
      patchUserInCache(userId, { is_suspended: false })
      return { previous }
    },
    onSuccess: () => toast.success('User unsuspended'),
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      toast.error('Failed to unsuspend user')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (userId === currentUser?.id) {
        throw new Error('You cannot delete your own account')
      }
      const { error } = await supabase.functions.invoke('delete-user', { body: { userId } })
      if (error) throw error
      await logAudit({ action: 'user_deleted', target_type: 'user', target_id: userId })
    },
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ['admin-users'] })
      const previous = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['admin-users'] })
      removeUserFromCache(userId)
      setShowDeleteConfirm(false)
      onClose()
      return { previous }
    },
    onSuccess: () => toast.success('User deleted'),
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      toast.error('Failed to delete user')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/reset-password`,
      })
      if (error) throw error
    },
    onMutate: () => {
      toast.success('Password reset email sent')
    },
    onError: () => toast.error('Failed to send reset email  check Supabase SMTP config'),
  })

  if (!user) return null

  const activeRoles = collectiveRoles?.filter((r) => r.status === 'active') ?? []
  const enabledCapsCount = capsData ? capsData.capabilities.size : 0

  return (
    <>
      <BottomSheet data-eos-id="src/pages/admin/users.tsx#0" data-eos-v="2" open={open} onClose={onClose} snapPoints={[0.92]}>
        <div data-eos-id="src/pages/admin/users.tsx#1" className="space-y-5 pb-6">
          {/* User header */}
          <div data-eos-id="src/pages/admin/users.tsx#2" className="flex items-center gap-4 p-4 -mx-1 rounded-md bg-white border border-neutral-100">
            <Avatar data-eos-id="src/pages/admin/users.tsx#3" src={user.avatar_url} name={user.display_name ?? ''} size="lg" />
            <div data-eos-id="src/pages/admin/users.tsx#4" className="flex-1 min-w-0">
              <p data-eos-id="src/pages/admin/users.tsx#5" data-eos-var="user.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="text-lg font-bold text-neutral-900 truncate">{user.display_name}</p>
              <p data-eos-id="src/pages/admin/users.tsx#6" data-eos-var="user.email" data-eos-var-label="Email" data-eos-var-scope="prop" className="text-sm text-neutral-500 truncate">{user.email}</p>
              <div data-eos-id="src/pages/admin/users.tsx#7" className="flex items-center gap-2 mt-1.5">
                <span data-eos-id="src/pages/admin/users.tsx#8" data-eos-var="user.role" data-eos-var-label="Role" data-eos-var-scope="prop" className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', roleBadgeColors[user.role])}>
                  {formatRole(user.role ?? 'participant')}
                </span>
                {user.is_suspended && (
                  <span data-eos-id="src/pages/admin/users.tsx#9" className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-error-200 text-error-800">
                    Suspended
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick actions - touch-optimised row */}
          <div data-eos-id="src/pages/admin/users.tsx#10" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button data-eos-id="src/pages/admin/users.tsx#11"
              type="button"
              onClick={() => { setNewRole(user.role); setShowRoleChange(!showRoleChange) }}
              className={cn(
                'flex items-center gap-3 p-3.5 rounded-sm transition-colors active:scale-[0.97]',
                showRoleChange
                  ? 'bg-neutral-100 ring-1 ring-neutral-200'
                  : 'bg-neutral-50 ring-1 ring-neutral-100',
              )}
            >
              <div data-eos-id="src/pages/admin/users.tsx#12" className="w-9 h-9 rounded-sm bg-primary-200 text-primary-700 flex items-center justify-center shrink-0">
                <UserCog data-eos-id="src/pages/admin/users.tsx#13" size={17} />
              </div>
              <span data-eos-id="src/pages/admin/users.tsx#14" className="text-sm font-semibold text-neutral-900">Change Role</span>
            </button>

            <button data-eos-id="src/pages/admin/users.tsx#15"
              type="button"
              onClick={() => user.email && resetPasswordMutation.mutate(user.email)}
              disabled={resetPasswordMutation.isPending}
              className="flex items-center gap-3 p-3.5 rounded-sm bg-neutral-50 ring-1 ring-neutral-100 transition-colors active:scale-[0.97]"
            >
              <div data-eos-id="src/pages/admin/users.tsx#16" className="w-9 h-9 rounded-sm bg-primary-200 text-primary-700 flex items-center justify-center shrink-0">
                <KeyRound data-eos-id="src/pages/admin/users.tsx#17" size={17} />
              </div>
              <span data-eos-id="src/pages/admin/users.tsx#18" className="text-sm font-semibold text-neutral-900">Reset Password</span>
            </button>

            {user.is_suspended ? (
              <button data-eos-id="src/pages/admin/users.tsx#19"
                type="button"
                onClick={() => unsuspendMutation.mutate(user.id)}
                disabled={unsuspendMutation.isPending}
                className="flex items-center gap-3 p-3.5 rounded-sm bg-success-50 ring-1 ring-success-200/40 transition-colors active:scale-[0.97]"
              >
                <div data-eos-id="src/pages/admin/users.tsx#20" className="w-9 h-9 rounded-sm bg-success-200 text-success-700 flex items-center justify-center shrink-0">
                  <Shield data-eos-id="src/pages/admin/users.tsx#21" size={17} />
                </div>
                <span data-eos-id="src/pages/admin/users.tsx#22" className="text-sm font-semibold text-success-800">Unsuspend</span>
              </button>
            ) : (
              <button data-eos-id="src/pages/admin/users.tsx#23"
                type="button"
                onClick={() => setShowSuspendForm(!showSuspendForm)}
                className={cn(
                  'flex items-center gap-3 p-3.5 rounded-sm transition-colors active:scale-[0.97]',
                  showSuspendForm
                    ? 'bg-warning-200 ring-1 ring-warning-300/60'
                    : 'bg-warning-50 ring-1 ring-warning-200/40',
                )}
              >
                <div data-eos-id="src/pages/admin/users.tsx#24" className="w-9 h-9 rounded-sm bg-warning-200 text-warning-700 flex items-center justify-center shrink-0">
                  <Ban data-eos-id="src/pages/admin/users.tsx#25" size={17} />
                </div>
                <span data-eos-id="src/pages/admin/users.tsx#26" className="text-sm font-semibold text-warning-800">Suspend</span>
              </button>
            )}

            {isSuperAdmin && (
              <button data-eos-id="src/pages/admin/users.tsx#27"
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-3 p-3.5 rounded-sm bg-error-50 ring-1 ring-error-200/40 transition-colors active:scale-[0.97]"
              >
                <div data-eos-id="src/pages/admin/users.tsx#28" className="w-9 h-9 rounded-sm bg-error-200 text-error-700 flex items-center justify-center shrink-0">
                  <Trash2 data-eos-id="src/pages/admin/users.tsx#29" size={17} />
                </div>
                <span data-eos-id="src/pages/admin/users.tsx#30" className="text-sm font-semibold text-error-800">Delete User</span>
              </button>
            )}
          </div>

          {/* Inline role change form */}
          <AnimatePresence data-eos-id="src/pages/admin/users.tsx#31">
            {showRoleChange && (
              <motion.div data-eos-id="src/pages/admin/users.tsx#32"
                variants={expandCollapseVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden"
              >
                <div data-eos-id="src/pages/admin/users.tsx#33" className="p-3.5 bg-neutral-50 rounded-sm ring-1 ring-neutral-100 space-y-3">
                  <Dropdown data-eos-id="src/pages/admin/users.tsx#34"
                    options={roleOptions.filter((o) => o.value !== 'all')}
                    value={newRole}
                    onChange={setNewRole}
                    label="New Role"
                  />
                  <Button data-eos-id="src/pages/admin/users.tsx#35"
                    variant="primary"
                    fullWidth
                    className="h-12 text-base"
                    onClick={() => changeRoleMutation.mutate({ userId: user.id, role: newRole })}
                    loading={changeRoleMutation.isPending}
                  >
                    Update Role
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline suspend form */}
          <AnimatePresence data-eos-id="src/pages/admin/users.tsx#36">
            {showSuspendForm && !user.is_suspended && (
              <motion.div data-eos-id="src/pages/admin/users.tsx#37"
                variants={expandCollapseVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden"
              >
                <div data-eos-id="src/pages/admin/users.tsx#38" className="p-3.5 bg-error-50 rounded-sm ring-1 ring-error-200/40 space-y-3">
                  <p data-eos-id="src/pages/admin/users.tsx#39" className="text-xs text-error-600">User will see the reason and can submit an appeal</p>
                  <Input data-eos-id="src/pages/admin/users.tsx#40"
                    type="textarea"
                    label="Reason for suspension"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    required
                    placeholder="Explain why this account is being suspended..."
                  />
                  <Button data-eos-id="src/pages/admin/users.tsx#41"
                    variant="danger"
                    fullWidth
                    className="h-12 text-base"
                    onClick={() => suspendMutation.mutate({ userId: user.id, reason: suspendReason })}
                    loading={suspendMutation.isPending}
                    disabled={!suspendReason.trim()}
                  >
                    Suspend Account
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collective Roles Section */}
          <div data-eos-id="src/pages/admin/users.tsx#42">
            <div data-eos-id="src/pages/admin/users.tsx#43" className="flex items-center justify-between mb-3">
              <div data-eos-id="src/pages/admin/users.tsx#44" className="flex items-center gap-2">
                <h3 data-eos-id="src/pages/admin/users.tsx#45" className="text-sm font-bold text-neutral-900">Collective Roles</h3>
                {activeRoles.length > 0 && (
                  <span data-eos-id="src/pages/admin/users.tsx#46" className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary-200 text-primary-700">
                    {activeRoles.length}
                  </span>
                )}
              </div>
              <button data-eos-id="src/pages/admin/users.tsx#47"
                type="button"
                onClick={() => setShowAddCollective(!showAddCollective)}
                className={cn(
                  'flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-sm transition-colors active:scale-[0.97]',
                  showAddCollective
                    ? 'bg-neutral-200 text-neutral-900'
                    : 'bg-neutral-100 text-neutral-600',
                )}
              >
                {showAddCollective ? <X data-eos-id="src/pages/admin/users.tsx#48" size={13} /> : <Plus data-eos-id="src/pages/admin/users.tsx#49" size={13} />}
                {showAddCollective ? 'Cancel' : 'Add'}
              </button>
            </div>

            {/* Add to collective form */}
            <AnimatePresence data-eos-id="src/pages/admin/users.tsx#50">
              {showAddCollective && (
                <motion.div data-eos-id="src/pages/admin/users.tsx#51"
                  variants={expandCollapseVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <div data-eos-id="src/pages/admin/users.tsx#52" className="mb-3 p-3.5 bg-neutral-50 rounded-sm ring-1 ring-neutral-100 space-y-2.5">
                    <Dropdown data-eos-id="src/pages/admin/users.tsx#53"
                      options={availableCollectives.map((c) => ({ value: c.id, label: `${c.name}${c.state ? ` (${c.state})` : ''}` }))}
                      value={addCollectiveId}
                      onChange={setAddCollectiveId}
                      placeholder="Select collective..."
                    />
                    <Dropdown data-eos-id="src/pages/admin/users.tsx#54"
                      options={collectiveRoleOptions}
                      value={addCollectiveRole}
                      onChange={(v) => setAddCollectiveRole(v as CollectiveRole)}
                      label="Role"
                    />
                    <Button data-eos-id="src/pages/admin/users.tsx#55"
                      variant="primary"
                      fullWidth
                      className="h-12 text-base"
                      disabled={!addCollectiveId}
                      loading={assignRole.isPending}
                      onClick={() => {
                        if (!addCollectiveId) return
                        assignRole.mutate(
                          { userId: user.id, collectiveId: addCollectiveId, role: addCollectiveRole },
                          {
                            onSuccess: () => {
                              toast.success('Added to collective')
                              setShowAddCollective(false)
                              setAddCollectiveId('')
                              setAddCollectiveRole('participant')
                            },
                            onError: () => toast.error('Failed to add to collective'),
                          },
                        )
                      }}
                    >
                      Add to Collective
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {rolesLoading ? (
              <Skeleton data-eos-id="src/pages/admin/users.tsx#56" variant="list-item" count={2} />
            ) : !activeRoles.length ? (
              <div data-eos-id="src/pages/admin/users.tsx#57" className="py-4 px-3 rounded-sm bg-neutral-50 ring-1 ring-neutral-200/40 text-center">
                <Users data-eos-id="src/pages/admin/users.tsx#58" size={20} className="text-neutral-400 mx-auto mb-1" />
                <p data-eos-id="src/pages/admin/users.tsx#59" className="text-xs text-neutral-500">Not a member of any collective</p>
              </div>
            ) : (
              <div data-eos-id="src/pages/admin/users.tsx#60" className="space-y-2">
                {activeRoles.map((membership) => {
                  const Icon = COLLECTIVE_ROLE_ICONS[membership.role]
                  return (
                    <motion.div data-eos-id="src/pages/admin/users.tsx#61"
                      key={membership.id}
                      layout
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-sm transition-colors duration-200',
                        COLLECTIVE_ROLE_SURFACE[membership.role],
                      )}
                    >
                      <div data-eos-id="src/pages/admin/users.tsx#62" className={cn(
                        'w-8 h-8 rounded-sm flex items-center justify-center shrink-0',
                        COLLECTIVE_ROLE_COLORS[membership.role],
                      )}>
                        <Icon data-eos-id="src/pages/admin/users.tsx#63" size={15} />
                      </div>
                      <div data-eos-id="src/pages/admin/users.tsx#64" className="flex-1 min-w-0">
                        <p data-eos-id="src/pages/admin/users.tsx#65" data-eos-var="membership.collective.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">{membership.collective.name}</p>
                        <p data-eos-id="src/pages/admin/users.tsx#66" data-eos-var="membership.role,membership.collective.state" data-eos-var-label="Role, State" data-eos-var-scope="item" className="text-[11px] text-neutral-500">
                          {membership.role.replace(/_/g, ' ')}
                          {membership.collective.state && ` · ${membership.collective.state}`}
                        </p>
                      </div>
                      <Dropdown data-eos-id="src/pages/admin/users.tsx#67"
                        options={collectiveRoleOptions}
                        value={membership.role}
                        onChange={(newCollectiveRole) => {
                          assignRole.mutate(
                            { userId: user.id, collectiveId: membership.collective_id, role: newCollectiveRole as CollectiveRole },
                            {
                              onSuccess: () => toast.success('Role updated'),
                              onError: () => toast.error('Failed to update role'),
                            },
                          )
                        }}
                        className="w-[7.5rem] shrink-0"
                      />
                      <button data-eos-id="src/pages/admin/users.tsx#68"
                        type="button"
                        onClick={() =>
                          removeFromCollective.mutate(
                            { userId: user.id, collectiveId: membership.collective_id },
                            {
                              onSuccess: () => toast.success('Removed from collective'),
                              onError: () => toast.error('Failed to remove'),
                            },
                          )
                        }
                        className="p-2.5 rounded-sm text-neutral-400 active:bg-error-100 active:text-error-600 shrink-0 transition-colors"
                        title="Remove from collective"
                      >
                        <X data-eos-id="src/pages/admin/users.tsx#69" size={14} />
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Managed Collectives - shown for managers, editable by admin */}
          {user.role === 'manager' && isSuperAdmin && allCollectives && (
            <div data-eos-id="src/pages/admin/users.tsx#70">
              <div data-eos-id="src/pages/admin/users.tsx#71" className="flex items-center gap-2 mb-3">
                <div data-eos-id="src/pages/admin/users.tsx#72" className="w-9 h-9 rounded-sm bg-plum-200 text-plum-700 flex items-center justify-center shrink-0">
                  <Settings data-eos-id="src/pages/admin/users.tsx#73" size={15} />
                </div>
                <div data-eos-id="src/pages/admin/users.tsx#74">
                  <h3 data-eos-id="src/pages/admin/users.tsx#75" className="text-sm font-bold text-plum-900">Managed Collectives</h3>
                  <p data-eos-id="src/pages/admin/users.tsx#76" className="text-[11px] text-plum-600">
                    Which collectives this manager oversees
                  </p>
                </div>
              </div>
              <div data-eos-id="src/pages/admin/users.tsx#77" className="space-y-2">
                {allCollectives.map((collective) => {
                  const isManaged = managedCollectives?.includes(collective.id) ?? false
                  return (
                    <label data-eos-id="src/pages/admin/users.tsx#78"
                      key={collective.id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-sm cursor-pointer transition-colors',
                        isManaged
                          ? 'bg-plum-50 ring-1 ring-plum-200/60'
                          : 'bg-white ring-1 ring-neutral-100 hover:bg-neutral-50',
                      )}
                    >
                      <input data-eos-id="src/pages/admin/users.tsx#79"
                        type="checkbox"
                        checked={isManaged}
                        onChange={() => {
                          const current = managedCollectives ?? []
                          const next = isManaged
                            ? current.filter((id) => id !== collective.id)
                            : [...current, collective.id]
                          updateManagedCollectives.mutate(
                            { userId: user.id, collectiveIds: next },
                            {
                              onSuccess: () => toast.success('Managed collectives updated'),
                              onError: () => toast.error('Failed to update managed collectives'),
                            },
                          )
                        }}
                        className="w-5 h-5 rounded border-plum-300 text-plum-600 focus:ring-plum-500"
                      />
                      <div data-eos-id="src/pages/admin/users.tsx#80" className="flex-1 min-w-0">
                        <p data-eos-id="src/pages/admin/users.tsx#81" data-eos-var="collective.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">{collective.name}</p>
                        {collective.state && (
                          <p data-eos-id="src/pages/admin/users.tsx#82" data-eos-var="collective.state,collective.region" data-eos-var-label="State, Region" data-eos-var-scope="item" className="text-[11px] text-neutral-500">{collective.state}{collective.region ? ` · ${collective.region}` : ''}</p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Capabilities / Permissions Section - admin only */}
          {isSuperAdmin && isStaffRole && (
            <div data-eos-id="src/pages/admin/users.tsx#83">
              <button data-eos-id="src/pages/admin/users.tsx#84"
                type="button"
                onClick={() => setCapsExpanded(!capsExpanded)}
                className={cn(
                  'flex items-center justify-between w-full p-3.5 rounded-sm transition-colors active:scale-[0.98]',
                  capsExpanded
                    ? 'bg-plum-100 ring-1 ring-plum-200/60'
                    : 'bg-plum-50 ring-1 ring-plum-200/40',
                )}
              >
                <div data-eos-id="src/pages/admin/users.tsx#85" className="flex items-center gap-2.5">
                  <div data-eos-id="src/pages/admin/users.tsx#86" className="w-9 h-9 rounded-sm bg-plum-200 text-plum-700 flex items-center justify-center">
                    <Sparkles data-eos-id="src/pages/admin/users.tsx#87" size={15} />
                  </div>
                  <div data-eos-id="src/pages/admin/users.tsx#88" className="text-left">
                    <h3 data-eos-id="src/pages/admin/users.tsx#89" className="text-sm font-bold text-plum-900">Permissions</h3>
                    <p data-eos-id="src/pages/admin/users.tsx#90" className="text-[11px] text-plum-600">
                      {enabledCapsCount} capabilities active
                    </p>
                  </div>
                </div>
                {capsExpanded
                  ? <ChevronUp data-eos-id="src/pages/admin/users.tsx#91" size={16} className="text-plum-500" />
                  : <ChevronDown data-eos-id="src/pages/admin/users.tsx#92" size={16} className="text-plum-500" />
                }
              </button>

              <AnimatePresence data-eos-id="src/pages/admin/users.tsx#93">
                {capsExpanded && (
                  <motion.div data-eos-id="src/pages/admin/users.tsx#94"
                    variants={expandCollapseVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="overflow-hidden"
                  >
                    {capsLoading ? (
                      <div data-eos-id="src/pages/admin/users.tsx#95" className="mt-3">
                        <Skeleton data-eos-id="src/pages/admin/users.tsx#96" variant="list-item" count={4} />
                      </div>
                    ) : (
                      <div data-eos-id="src/pages/admin/users.tsx#97" className="mt-3 space-y-4">
                        <p data-eos-id="src/pages/admin/users.tsx#98" className="text-[11px] text-neutral-500 px-1">
                          Defaults from <strong data-eos-id="src/pages/admin/users.tsx#99" className="text-neutral-700">{userRole.replace(/_/g, ' ')}</strong> role.
                          Toggle to override.
                        </p>
                        {Object.entries(capsByCategory).map(([category, caps]) => (
                          <div data-eos-id="src/pages/admin/users.tsx#100" key={category}>
                            <p data-eos-id="src/pages/admin/users.tsx#101" data-eos-var="CATEGORY_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 mb-2 px-1">
                              {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
                            </p>
                            <div data-eos-id="src/pages/admin/users.tsx#102" className="rounded-sm overflow-hidden ring-1 ring-neutral-100">
                              {caps.map((cap, i) => {
                                const isEnabled = capsData?.capabilities.has(cap.key) ?? false
                                const isDefault = ROLE_DEFAULT_CAPS[userRole].includes(cap.key)
                                const isOverridden = capsData?.overrides?.[cap.key] !== undefined
                                return (
                                  <div data-eos-id="src/pages/admin/users.tsx#103"
                                    key={cap.key}
                                    className={cn(
                                      'flex items-center justify-between px-3.5 py-3',
                                      i > 0 && 'border-t border-neutral-100',
                                      isOverridden
                                        ? isEnabled ? 'bg-success-50/60' : 'bg-error-50/40'
                                        : 'bg-white',
                                    )}
                                  >
                                    <div data-eos-id="src/pages/admin/users.tsx#104" className="flex-1 min-w-0 mr-3">
                                      <div data-eos-id="src/pages/admin/users.tsx#105" className="flex items-center gap-1.5">
                                        {isEnabled ? (
                                          <CheckCircle data-eos-id="src/pages/admin/users.tsx#106" size={13} className="text-success-500 shrink-0" />
                                        ) : (
                                          <XCircle data-eos-id="src/pages/admin/users.tsx#107" size={13} className="text-neutral-300 shrink-0" />
                                        )}
                                        <p data-eos-id="src/pages/admin/users.tsx#108" data-eos-var="cap.label" data-eos-var-label="Label" data-eos-var-scope="item" className={cn('text-sm', isEnabled ? 'text-neutral-900 font-medium' : 'text-neutral-500')}>
                                          {cap.label}
                                        </p>
                                        {isOverridden && (
                                          <span data-eos-id="src/pages/admin/users.tsx#109" className={cn(
                                            'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                                            isEnabled ? 'bg-success-200 text-success-800' : 'bg-error-200 text-error-700',
                                          )}>
                                            {isEnabled ? 'granted' : 'revoked'}
                                          </span>
                                        )}
                                        {!isOverridden && isDefault && (
                                          <span data-eos-id="src/pages/admin/users.tsx#110" className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                                            default
                                          </span>
                                        )}
                                      </div>
                                      <p data-eos-id="src/pages/admin/users.tsx#111" data-eos-var="cap.description" data-eos-var-label="Description" data-eos-var-scope="item" className="text-[11px] text-neutral-400 ml-[21px]">{cap.description}</p>
                                    </div>
                                    <Toggle data-eos-id="src/pages/admin/users.tsx#112"
                                      checked={isEnabled}
                                      onChange={() => handleToggleCap(cap.key)}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Delete confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/admin/users.tsx#113"
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => deleteMutation.mutate(user.id)}
        title="Delete User Permanently"
        description="This will permanently delete this user's account and all associated data. This action cannot be undone (GDPR data removal)."
        confirmLabel="Delete Permanently"
        variant="danger"
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [roleFilter, setRoleFilter] = useState('all')
  const [settingsUser, setSettingsUser] = useState<AdminUserRow | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useAdminUsers(debouncedSearch, roleFilter)
  const users = useMemo(() => data?.pages.flatMap((p) => p) ?? [], [data])
  const showLoading = useDelayedLoading(isLoading)
  useAdminHeader('User Management')

  const toggleUserSelection = useCallback((userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }, [])

  const shouldReduceMotion = useReducedMotion()

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/users.tsx#114" variants={stagger} initial="hidden" animate="visible">
      {/* Filters */}
      <motion.div data-eos-id="src/pages/admin/users.tsx#115" variants={fadeUp} className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchBar data-eos-id="src/pages/admin/users.tsx#116"
          value={search}
          onChange={setSearch}
          placeholder="Search by name or email..."
          compact
          className="flex-1"
        />
        <Dropdown data-eos-id="src/pages/admin/users.tsx#117"
          options={roleOptions}
          value={roleFilter}
          onChange={setRoleFilter}
          placeholder="All Roles"
          className="sm:w-52"
        />
      </motion.div>

      {/* Bulk actions */}
      {selectedUsers.size > 0 && (
        <motion.div data-eos-id="src/pages/admin/users.tsx#118" variants={fadeUp} className="flex items-center gap-2 mb-4 p-3 bg-neutral-50 rounded-sm ring-1 ring-neutral-100">
          <span data-eos-id="src/pages/admin/users.tsx#119" data-eos-var="selectedUsers.size" data-eos-var-label="Size" data-eos-var-scope="prop" className="text-sm text-neutral-700 font-semibold">
            {selectedUsers.size} selected
          </span>
          <Button data-eos-id="src/pages/admin/users.tsx#120"
            variant="ghost"
            size="sm"
            icon={<Ban data-eos-id="src/pages/admin/users.tsx#121" size={14} />}
            onClick={async () => {
              const uids = Array.from(selectedUsers)
              const { error } = await supabase.from('profiles').update({ is_suspended: true, suspended_reason: 'Bulk suspension by admin' }).in('id', uids)
              if (error) {
                toast.error('Failed to suspend users')
                console.error('[admin] Bulk suspend error:', error)
                return
              }
              for (const uid of uids) {
                await logAudit({ action: 'user_suspended', target_type: 'user', target_id: uid, details: { reason: 'Bulk suspension by admin' } })
              }
              queryClient.invalidateQueries({ queryKey: ['admin-users'] })
              toast.success(`${selectedUsers.size} users suspended`)
              setSelectedUsers(new Set())
            }}
          >
            Suspend All
          </Button>
          <Button data-eos-id="src/pages/admin/users.tsx#122" variant="ghost" size="sm" onClick={() => setSelectedUsers(new Set())}>Clear</Button>
        </motion.div>
      )}

      {/* User list */}
      <motion.div data-eos-id="src/pages/admin/users.tsx#123" variants={fadeUp}>
      {showLoading ? (
        <Skeleton data-eos-id="src/pages/admin/users.tsx#124" variant="list-item" count={8} />
      ) : !users?.length ? (
        <EmptyState data-eos-id="src/pages/admin/users.tsx#125"
          illustration="search"
          title="No users found"
          description={search ? 'Try a different search term' : 'No users match the filter'}
        />
      ) : (
        <>
        <StaggeredList data-eos-id="src/pages/admin/users.tsx#126" className="space-y-1.5">
          {users.map((user) => (
            <StaggeredItem data-eos-id="src/pages/admin/users.tsx#127"
              key={user.id}
              className={cn(
                'flex items-center gap-3 p-3.5 rounded-sm',
                'transition-colors duration-200',
                user.is_suspended
                  ? 'bg-error-50 ring-1 ring-error-200/60 opacity-70'
                  : 'bg-white border border-neutral-100 shadow-sm',
                selectedUsers.has(user.id) && 'ring-2 ring-primary-500 shadow-sm',
              )}
            >
              {/* Checkbox */}
              <input data-eos-id="src/pages/admin/users.tsx#128"
                type="checkbox"
                checked={selectedUsers.has(user.id)}
                onChange={() => toggleUserSelection(user.id)}
                className="w-5 h-5 rounded border-neutral-200 text-primary-600 focus:ring-primary-500"
                aria-label={`Select ${user.display_name}`}
              />

              {/* Avatar + info  tappable to open profile */}
              <button data-eos-id="src/pages/admin/users.tsx#129"
                type="button"
                onClick={() => setProfileUserId(user.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70 transition-opacity cursor-pointer"
              >
                <Avatar data-eos-id="src/pages/admin/users.tsx#130" src={user.avatar_url} name={user.display_name ?? ''} size="sm" />
                <div data-eos-id="src/pages/admin/users.tsx#131" className="flex-1 min-w-0">
                  <div data-eos-id="src/pages/admin/users.tsx#132" className="flex items-center gap-2">
                    <p data-eos-id="src/pages/admin/users.tsx#133" data-eos-var="user.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">
                      {user.display_name ?? 'Unknown'}
                    </p>
                    <span data-eos-id="src/pages/admin/users.tsx#134" data-eos-var="user.role" data-eos-var-label="Role" data-eos-var-scope="item" className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', roleBadgeColors[user.role] ?? roleBadgeColors.participant)}>
                      {formatRole(user.role ?? 'participant')}
                    </span>
                    {user.is_suspended && (
                      <span data-eos-id="src/pages/admin/users.tsx#135" className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-error-200 text-error-800 shrink-0">
                        Suspended
                      </span>
                    )}
                  </div>
                  <p data-eos-id="src/pages/admin/users.tsx#136" data-eos-var="user.email" data-eos-var-label="Email" data-eos-var-scope="item" className="text-xs text-neutral-500 truncate">{user.email}</p>
                </div>
              </button>

              {/* Single settings button */}
              <button data-eos-id="src/pages/admin/users.tsx#137"
                type="button"
                onClick={() => setSettingsUser(user)}
                className="p-2.5 rounded-sm bg-neutral-50 text-neutral-500 active:bg-neutral-200 active:text-neutral-700 transition-colors shrink-0"
                title="User settings"
              >
                <Settings data-eos-id="src/pages/admin/users.tsx#138" size={18} />
              </button>
            </StaggeredItem>
          ))}
        </StaggeredList>

        {hasNextPage && (
          <div data-eos-id="src/pages/admin/users.tsx#139" className="flex justify-center mt-4">
            <Button data-eos-id="src/pages/admin/users.tsx#140"
              variant="ghost"
              size="sm"
              onClick={() => fetchNextPage()}
              loading={isFetchingNextPage}
            >
              Load more
            </Button>
          </div>
        )}
        </>
      )}
      </motion.div>

      {/* Unified user settings sheet */}
      {settingsUser && <UserSettingsSheet data-eos-id="src/pages/admin/users.tsx#141" user={settingsUser} open onClose={() => setSettingsUser(null)} />}

      {/* Profile detail modal */}
      <ProfileModal data-eos-id="src/pages/admin/users.tsx#142" userId={profileUserId} open={!!profileUserId} onClose={() => setProfileUserId(null)} />
    </motion.div>
  )
}
