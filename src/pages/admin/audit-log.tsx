import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Clock,
  FileSearch,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { SearchBar } from '@/components/search-bar'
import { Dropdown } from '@/components/dropdown'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { Avatar } from '@/components/avatar'
import { cn } from '@/lib/cn'
import { supabase, escapeIlike } from '@/lib/supabase'

interface AuditLogEntry {
  id: string
  action: string
  details: string | { message?: string; [k: string]: unknown } | null
  target_type: string | null
  target_id: string | null
  created_at: string
  user_id: string | null
  profiles: { display_name: string; avatar_url: string | null } | null
}

const actionTypeOptions = [
  { value: 'all', label: 'All Actions' },
  { value: 'user_suspended', label: 'User Suspended' },
  { value: 'user_unsuspended', label: 'User Unsuspended' },
  { value: 'user_deleted', label: 'User Deleted' },
  { value: 'role_changed', label: 'Role Changed' },
  { value: 'collective_created', label: 'Collective Created' },
  { value: 'collective_archived', label: 'Collective Archived' },
  { value: 'collective_restored', label: 'Collective Restored' },
  { value: 'collective_deleted', label: 'Collective Deleted' },
  { value: 'member_role_changed', label: 'Member Role Changed' },
  { value: 'member_removed', label: 'Member Removed' },
  { value: 'challenge_created', label: 'Challenge Created' },
  { value: 'challenge_ended', label: 'Challenge Ended' },
  { value: 'challenge_deleted', label: 'Challenge Deleted' },
  { value: 'survey_deleted', label: 'Survey Deleted' },
  { value: 'content_auto_flagged', label: 'Content Auto-Flagged' },
  { value: 'content_removed', label: 'Content Removed' },
  { value: 'impersonation_started', label: 'Impersonation Started' },
]

const actionColors: Record<string, string> = {
  user_deleted: 'text-error-600 bg-error-50',
  user_suspended: 'text-warning-600 bg-warning-50',
  user_unsuspended: 'text-primary-600 bg-primary-50',
  role_changed: 'text-plum-600 bg-plum-50',
  member_role_changed: 'text-plum-600 bg-plum-50',
  member_removed: 'text-warning-600 bg-warning-50',
  collective_deleted: 'text-error-600 bg-error-50',
  challenge_deleted: 'text-error-600 bg-error-50',
  survey_deleted: 'text-error-600 bg-error-50',
  content_auto_flagged: 'text-warning-600 bg-warning-50',
  content_removed: 'text-error-600 bg-error-50',
  impersonation_started: 'text-error-600 bg-error-50',
  default: 'text-neutral-400 bg-neutral-50',
}

function humanizeValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'string') return v.replace(/_/g, ' ')
  return String(v)
}

// Turn an audit payload into a human sentence. The old surface printed
// JSON.stringify(details) straight to the product ({"new_role":"leader"}),
// reading as a developer debug console (review #4). The generic fallback names
// the changed fields so even an unmapped action type never leaks raw JSON.
function formatDetails(action: string, details: AuditLogEntry['details']): string | null {
  if (!details) return null
  if (typeof details === 'string') return details
  const d = details as Record<string, unknown>
  if (typeof d.message === 'string') return d.message

  switch (action) {
    case 'role_changed':
    case 'member_role_changed':
      return d.new_role ? `Changed role to ${humanizeValue(d.new_role)}` : null
    case 'user_suspended':
      return d.reason ? `Suspended: ${humanizeValue(d.reason)}` : 'Account suspended'
    case 'user_unsuspended':
      return 'Suspension lifted'
    case 'user_deleted':
      return 'Account deleted'
    case 'member_removed':
      return 'Removed from collective'
    case 'content_removed':
    case 'content_auto_flagged':
      return d.reason ? humanizeValue(d.reason) : null
  }

  const keys = Object.keys(d).filter((k) => k !== 'bulk')
  if (keys.length === 0) return null
  return `Updated ${keys.map((k) => k.replace(/_/g, ' ')).join(', ')}`
}

// Never print a full 36-char UUID to the surface; an 8-char token is enough to
// eyeball and correlate without reading as a debug console (review #4).
function shortTargetId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function useAuditLog(search: string, actionFilter: string, page: number) {
  const pageSize = 25
  return useQuery({
    queryKey: ['admin-audit-log', search, actionFilter, page],
    queryFn: async () => {
      let query = supabase.from('audit_log')
        .select('*, profiles!audit_log_user_id_fkey(display_name, avatar_url)', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (search) {
        query = query.ilike('action', `%${escapeIlike(search)}%`)
      }

      if (actionFilter && actionFilter !== 'all') {
        query = query.eq('action', actionFilter)
      }

      const { data, error, count } = await query
      if (error) throw error
      return { logs: (data ?? []) as AuditLogEntry[], total: count ?? 0 }
    },
    staleTime: 30 * 1000,
  })
}

export default function AdminAuditLogPage() {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [page, setPage] = useState(0)

  const { data, isLoading } = useAuditLog(search, actionFilter, page)
  const pageSize = 25
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  const shouldReduceMotion = useReducedMotion()

  const rm = !!shouldReduceMotion
  const heroStats = useMemo(() => (
    <AdminHeroStatRow data-eos-id="src/pages/admin/audit-log.tsx#0" data-eos-v="2">
      <AdminHeroStat data-eos-id="src/pages/admin/audit-log.tsx#1" value={data?.total ?? 0} label="Total Entries" icon={<FileSearch data-eos-id="src/pages/admin/audit-log.tsx#2" size={18} />} color="plum" delay={0} reducedMotion={rm} />
    </AdminHeroStatRow>
  ), [data?.total, rm])

  useAdminHeader('Audit Log', { heroContent: heroStats })

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <div data-eos-id="src/pages/admin/audit-log.tsx#3">
      <motion.div data-eos-id="src/pages/admin/audit-log.tsx#4" variants={stagger} initial="hidden" animate="visible">
        {/* Filters */}
        <motion.div data-eos-id="src/pages/admin/audit-log.tsx#5" variants={fadeUp} className="flex flex-col sm:flex-row gap-3 mb-4">
          <SearchBar data-eos-id="src/pages/admin/audit-log.tsx#6"
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(0)
            }}
            placeholder="Search actions..."
            compact
            className="flex-1"
          />
          <Dropdown data-eos-id="src/pages/admin/audit-log.tsx#7"
            options={actionTypeOptions}
            value={actionFilter}
            onChange={(v) => {
              setActionFilter(v)
              setPage(0)
            }}
            className="sm:w-52"
          />
        </motion.div>

        {/* Log list */}
        <motion.div data-eos-id="src/pages/admin/audit-log.tsx#8" variants={fadeUp}>
        {isLoading ? (
          <Skeleton data-eos-id="src/pages/admin/audit-log.tsx#9" variant="list-item" count={8} />
        ) : !data?.logs.length ? (
          <EmptyState data-eos-id="src/pages/admin/audit-log.tsx#10"
            illustration="empty"
            title="No audit logs"
            description={search || actionFilter !== 'all' ? 'Try different filters' : 'Admin actions will appear here'}
          />
        ) : (
          <>
            <StaggeredList data-eos-id="src/pages/admin/audit-log.tsx#11" className="space-y-1">
              {data.logs.map((log) => {
                const profile = log.profiles
                const colorClass =
                  actionColors[log.action] ?? actionColors.default
                const detailText = formatDetails(log.action, log.details)

                return (
                  <StaggeredItem data-eos-id="src/pages/admin/audit-log.tsx#12"
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-sm bg-white shadow-sm"
                  >
                    <Avatar data-eos-id="src/pages/admin/audit-log.tsx#13"
                      src={profile?.avatar_url}
                      name={profile?.display_name ?? 'System'}
                      size="sm"
                    />
                    <div data-eos-id="src/pages/admin/audit-log.tsx#14" className="flex-1 min-w-0">
                      <div data-eos-id="src/pages/admin/audit-log.tsx#15" className="flex items-center gap-2 flex-wrap">
                        <span data-eos-id="src/pages/admin/audit-log.tsx#16" data-eos-var="profile.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="text-sm font-medium text-neutral-900">
                          {profile?.display_name ?? 'System'}
                        </span>
                        <span data-eos-id="src/pages/admin/audit-log.tsx#17" data-eos-var="log.action" data-eos-var-label="Action" data-eos-var-scope="item"
                          className={cn(
                            'text-[11px] font-medium px-1.5 py-0.5 rounded-full',
                            colorClass,
                          )}
                        >
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {detailText && (
                        <p data-eos-id="src/pages/admin/audit-log.tsx#18" className="text-xs text-neutral-600 mt-0.5 line-clamp-2">
                          {detailText}
                        </p>
                      )}
                      {log.target_type && log.target_id && (
                        <p data-eos-id="src/pages/admin/audit-log.tsx#19" className="text-[11px] text-neutral-500 mt-0.5">
                          {log.target_type.replace(/_/g, ' ')}
                          <span className="font-mono text-neutral-400"> #{shortTargetId(log.target_id)}</span>
                        </p>
                      )}
                    </div>
                    <span data-eos-id="src/pages/admin/audit-log.tsx#20" data-eos-var="log.created_at" data-eos-var-label="Created at" data-eos-var-scope="item" className="text-[11px] text-neutral-400 shrink-0 flex items-center gap-1">
                      <Clock data-eos-id="src/pages/admin/audit-log.tsx#21" size={12} />
                      {new Date(log.created_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </StaggeredItem>
                )
              })}
            </StaggeredList>

            {/* Pagination */}
            {totalPages > 1 && (
              <div data-eos-id="src/pages/admin/audit-log.tsx#22" className="flex items-center justify-center gap-2 mt-4">
                <button data-eos-id="src/pages/admin/audit-log.tsx#23"
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className={cn(
                    'px-4 min-h-11 rounded-sm text-sm font-medium cursor-pointer',
                    page === 0
                      ? 'text-neutral-300 cursor-not-allowed'
                      : 'text-neutral-400 hover:bg-neutral-50',
                  )}
                >
                  Previous
                </button>
                <span data-eos-id="src/pages/admin/audit-log.tsx#24" className="text-sm text-neutral-400">
                  {page + 1} / {totalPages}
                </span>
                <button data-eos-id="src/pages/admin/audit-log.tsx#25"
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className={cn(
                    'px-4 min-h-11 rounded-sm text-sm font-medium cursor-pointer',
                    page >= totalPages - 1
                      ? 'text-neutral-300 cursor-not-allowed'
                      : 'text-neutral-400 hover:bg-neutral-50',
                  )}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
        </motion.div>
      </motion.div>
    </div>
  )
}
