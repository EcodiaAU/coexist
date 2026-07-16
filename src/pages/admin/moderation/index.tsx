import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Check,
  Trash2,
  AlertTriangle,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  UserX,
  Flag,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Avatar } from '@/components/avatar'
import { TabBar } from '@/components/tab-bar'
import { EmptyState } from '@/components/empty-state'
import { Skeleton } from '@/components/skeleton'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { useAuth } from '@/hooks/use-auth'
import type { Tables, Enums } from '@/types/database.types'

type ContentReport = Tables<'content_reports'>
type Profile = Tables<'profiles'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReportWithReporter extends ContentReport {
  reporter: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

/* ------------------------------------------------------------------ */
/*  Content type config                                                */
/* ------------------------------------------------------------------ */

const contentTypeConfig: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  photo: { icon: ImageIcon, label: 'Photo', color: 'text-plum-600 bg-plum-100' },
  chat_message: { icon: MessageSquare, label: 'Chat Message', color: 'text-success-600 bg-success-100' },
  profile: { icon: UserX, label: 'User Report / Block', color: 'text-error-600 bg-error-100' },
  post: { icon: Flag, label: 'Post', color: 'text-warning-600 bg-warning-100' },
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useModerationQueue(status: Enums<'report_status'>) {
  return useQuery({
    queryKey: ['moderation-queue', status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_reports')
        .select(`
          *,
          reporter:profiles!content_reports_reporter_id_fkey(id, display_name, avatar_url)
        `)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      return (data ?? []) as ReportWithReporter[]
    },
    staleTime: 30 * 1000,
  })
}

function useReviewReport() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ reportId, action }: { reportId: string; action: Enums<'report_status'> }) => {
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('content_reports')
        .update({
          status: action,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reportId)

      if (error) throw error
      await logAudit({ action: action === 'removed' ? 'content_removed' : `content_${action}`, target_type: 'content_report', target_id: reportId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Time helper                                                        */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ------------------------------------------------------------------ */
/*  Report card                                                        */
/* ------------------------------------------------------------------ */

function ReportCard({
  report,
  onApprove,
  onRemove,
  onDismiss,
}: {
  report: ReportWithReporter
  onApprove: () => void
  onRemove: () => void
  onDismiss: () => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const config = contentTypeConfig[report.content_type] ?? contentTypeConfig.photo
  const TypeIcon = config.icon

  return (
    <>
      <motion.div data-eos-id="src/pages/admin/moderation/index.tsx#0"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-md shadow-sm overflow-hidden"
      >
        {/* Header */}
        <div data-eos-id="src/pages/admin/moderation/index.tsx#1" className="flex items-center gap-3 px-4 pt-4 pb-2">
          <div data-eos-id="src/pages/admin/moderation/index.tsx#2"
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-full',
              config.color,
            )}
          >
            <TypeIcon data-eos-id="src/pages/admin/moderation/index.tsx#3" size={16} aria-hidden="true" />
          </div>

          <div data-eos-id="src/pages/admin/moderation/index.tsx#4" className="flex-1 min-w-0">
            <div data-eos-id="src/pages/admin/moderation/index.tsx#5" className="flex items-center gap-2">
              <span data-eos-id="src/pages/admin/moderation/index.tsx#6" data-eos-var="config.label" data-eos-var-label="Label" data-eos-var-scope="prop" className="text-sm font-semibold text-neutral-900">
                {config.label} Report
              </span>
              <span data-eos-id="src/pages/admin/moderation/index.tsx#7" data-eos-var="report.status" data-eos-var-label="Status" data-eos-var-scope="prop" className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                report.status === 'pending'
                  ? 'bg-warning-100 text-warning-700'
                  : report.status === 'approved'
                    ? 'bg-success-100 text-success-700'
                    : report.status === 'removed'
                      ? 'bg-error-100 text-error-700'
                      : 'bg-white text-neutral-400',
              )}>
                {report.status}
              </span>
            </div>
            <span data-eos-id="src/pages/admin/moderation/index.tsx#8" data-eos-var="report.created_at" data-eos-var-label="Created at" data-eos-var-scope="prop" className="text-xs text-neutral-400">
              {formatDate(report.created_at!)}
            </span>
          </div>
        </div>

        {/* Reporter + reason */}
        <div data-eos-id="src/pages/admin/moderation/index.tsx#9" className="flex items-center gap-2 px-4 py-2">
          <Avatar data-eos-id="src/pages/admin/moderation/index.tsx#10"
            src={report.reporter?.avatar_url}
            name={report.reporter?.display_name ?? 'Reporter'}
            size="xs"
          />
          <div data-eos-id="src/pages/admin/moderation/index.tsx#11" className="flex-1 min-w-0">
            <span data-eos-id="src/pages/admin/moderation/index.tsx#12" data-eos-var="report.reporter.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="text-xs text-neutral-400">
              {report.reporter?.display_name ?? 'Unknown'}
            </span>
            <p data-eos-id="src/pages/admin/moderation/index.tsx#13" data-eos-var="report.reason" data-eos-var-label="Reason" data-eos-var-scope="prop" className="text-xs text-neutral-400 truncate" title={report.reason}>
              {report.reason}
            </p>
          </div>
        </div>

        {/* Quick link for profile reports (user blocks / user reports) */}
        {report.content_type === 'profile' && (
          <div data-eos-id="src/pages/admin/moderation/index.tsx#14" className="px-4 pb-2">
            <Link data-eos-id="src/pages/admin/moderation/index.tsx#15"
              to={`/profile/${report.content_id}`}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-700 hover:underline"
            >
              View reported user profile &rarr;
            </Link>
          </div>
        )}

        {/* Actions */}
        {report.status === 'pending' && (
          <div data-eos-id="src/pages/admin/moderation/index.tsx#16" className="flex gap-2 px-4 py-3 border-t border-neutral-100">
            <Button data-eos-id="src/pages/admin/moderation/index.tsx#17"
              variant="ghost"
              size="sm"
              icon={<Check data-eos-id="src/pages/admin/moderation/index.tsx#18" size={14} />}
              onClick={onApprove}
              className="flex-1 !text-success-600 hover:!bg-success-50"
            >
              Approve
            </Button>
            <Button data-eos-id="src/pages/admin/moderation/index.tsx#19"
              variant="ghost"
              size="sm"
              icon={<Trash2 data-eos-id="src/pages/admin/moderation/index.tsx#20" size={14} />}
              onClick={() => setShowRemoveConfirm(true)}
              className="flex-1 !text-error-600 hover:!bg-error-50"
            >
              Remove
            </Button>
            <Button data-eos-id="src/pages/admin/moderation/index.tsx#21"
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="flex-1"
            >
              Dismiss
            </Button>
          </div>
        )}
      </motion.div>

      <ConfirmationSheet data-eos-id="src/pages/admin/moderation/index.tsx#22"
        open={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={onRemove}
        title="Remove this content?"
        description="The content will be hidden from all users. The author will be notified."
        confirmLabel="Remove Content"
        variant="danger"
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Moderation page                                                    */
/* ------------------------------------------------------------------ */

const statusTabs = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'removed', label: 'Removed' },
  { id: 'dismissed', label: 'Dismissed' },
]

export default function ModerationQueuePage() {
  useAdminHeader('Content Moderation')
  const { toast } = useToast()
  const [activeStatus, setActiveStatus] = useState<Enums<'report_status'>>('pending')
  const { data: reports, isLoading, refetch } = useModerationQueue(activeStatus)
  const showLoading = useDelayedLoading(isLoading)
  const reviewReport = useReviewReport()

  const handleAction = (reportId: string, action: Enums<'report_status'>) => {
    reviewReport.mutate(
      { reportId, action },
      {
        onSuccess: () => {
          const label = action === 'approved'
            ? 'Content approved'
            : action === 'removed'
              ? 'Content removed'
              : 'Report dismissed'
          toast.success(label)
        },
        onError: () => toast.error('Failed to update report'),
      },
    )
  }

  const handleRefresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const isEmpty = !isLoading && (reports ?? []).length === 0

  const shouldReduceMotion = useReducedMotion()
  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/moderation/index.tsx#23" variants={stagger} initial="hidden" animate="visible">
      <motion.div data-eos-id="src/pages/admin/moderation/index.tsx#24" variants={fadeUp}>
        <TabBar data-eos-id="src/pages/admin/moderation/index.tsx#25"
          tabs={statusTabs}
          activeTab={activeStatus}
          onChange={(id) => setActiveStatus(id as Enums<'report_status'>)}
          aria-label="Report status filter"
          className="mb-4"
        />
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/moderation/index.tsx#26" variants={fadeUp}>
      {showLoading ? (
        <div data-eos-id="src/pages/admin/moderation/index.tsx#27" className="space-y-4">
          <Skeleton data-eos-id="src/pages/admin/moderation/index.tsx#28" variant="card" />
          <Skeleton data-eos-id="src/pages/admin/moderation/index.tsx#29" variant="card" />
          <Skeleton data-eos-id="src/pages/admin/moderation/index.tsx#30" variant="card" />
        </div>
      ) : isEmpty ? (
        <EmptyState data-eos-id="src/pages/admin/moderation/index.tsx#31"
          illustration="empty"
          title={activeStatus === 'pending' ? 'No pending reports' : `No ${activeStatus} reports`}
          description={
            activeStatus === 'pending'
              ? 'All content has been reviewed. Check back later.'
              : `No reports with status "${activeStatus}"`
          }
        />
      ) : (
          <div data-eos-id="src/pages/admin/moderation/index.tsx#32" className="space-y-4">
            {/* Stats header for pending */}
            {activeStatus === 'pending' && (
              <div data-eos-id="src/pages/admin/moderation/index.tsx#33" className="flex items-center gap-2 px-1">
                <AlertTriangle data-eos-id="src/pages/admin/moderation/index.tsx#34" size={14} className="text-warning-500" aria-hidden="true" />
                <span data-eos-id="src/pages/admin/moderation/index.tsx#35" className="text-sm font-medium text-neutral-900">
                  {reports?.length ?? 0} report{(reports?.length ?? 0) !== 1 ? 's' : ''} pending review
                </span>
              </div>
            )}

            {(reports ?? []).map((report) => (
              <ReportCard data-eos-id="src/pages/admin/moderation/index.tsx#36"
                key={report.id}
                report={report}
                onApprove={() => handleAction(report.id, 'approved')}
                onRemove={() => handleAction(report.id, 'removed')}
                onDismiss={() => handleAction(report.id, 'dismissed')}
              />
            ))}
          </div>
      )}
      </motion.div>
    </motion.div>
  )
}
