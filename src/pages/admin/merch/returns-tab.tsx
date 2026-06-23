import { useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { Check, X } from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { Avatar } from '@/components/avatar'
import { useToast } from '@/components/toast'
import { useAdminReturns, useUpdateReturnStatus } from '@/hooks/use-admin-merch'
import { formatPrice, type ReturnStatus } from '@/types/merch'
import { cn } from '@/lib/cn'

const STATUS_COLORS: Record<ReturnStatus, string> = {
  requested: 'bg-warning-100 text-warning-800',
  approved: 'bg-success-100 text-success-800',
  denied: 'bg-error-100 text-error-700',
  refunded: 'bg-plum-100 text-plum-800',
}

export default function ReturnsTab() {
  const { data: returns, isLoading } = useAdminReturns()
  const showLoading = useDelayedLoading(isLoading)
  const updateReturn = useUpdateReturnStatus()
  const { toast } = useToast()
  const shouldReduceMotion = useReducedMotion()

  const handleUpdate = useCallback(
    async (returnId: string, status: 'approved' | 'denied') => {
      try {
        await updateReturn.mutateAsync({ returnId, status })
        toast.success(`Return ${status}`)
      } catch {
        toast.error('Failed to update return')
      }
    },
    [updateReturn, toast],
  )

  if (showLoading) {
    return <Skeleton variant="text" count={5} />
  }
  if (!returns || returns.length === 0) {
    return (
      <EmptyState
        illustration="empty"
        title="No return requests"
        description="Return requests from customers will appear here"
      />
    )
  }

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible">
    <motion.div variants={fadeUp}>
    <StaggeredList className="space-y-3">
      {returns.map((ret) => (
        <StaggeredItem
          key={ret.id}
          className="p-4 bg-white border border-neutral-100 rounded-md shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Avatar
                src={ret.profiles?.avatar_url}
                name={ret.profiles?.display_name ?? 'User'}
                size="xs"
              />
              <span className="text-sm font-medium text-neutral-900">
                {ret.profiles?.display_name ?? 'Unknown'}
              </span>
            </div>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize',
                STATUS_COLORS[ret.status],
              )}
            >
              {ret.status}
            </span>
          </div>
          <p className="text-sm text-neutral-500 mb-1">
            <span className="font-medium">Reason:</span> {ret.reason}
          </p>
          {ret.order && (
            <p className="text-xs text-neutral-400">
              Order #{(ret.order as { id: string }).id.slice(0, 8)} ·{' '}
              {formatPrice((ret.order as { total_cents: number }).total_cents)}
            </p>
          )}

          {ret.status === 'requested' && (
            <div className="flex gap-2 mt-3">
              <Button
                variant="primary"
                size="sm"
                icon={<Check size={14} />}
                loading={updateReturn.isPending}
                onClick={() => handleUpdate(ret.id, 'approved')}
              >
                Approve
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<X size={14} />}
                loading={updateReturn.isPending}
                onClick={() => handleUpdate(ret.id, 'denied')}
              >
                Deny
              </Button>
            </div>
          )}
        </StaggeredItem>
      ))}
    </StaggeredList>
    </motion.div>
    </motion.div>
  )
}
