import { CloudOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { usePendingSync } from '@/hooks/use-pending-sync'

interface PendingSyncBadgeProps {
  className?: string
}

/**
 * Shows a small badge with the count of pending offline actions.
 * Only visible when there are queued actions waiting to sync.
 */
export function PendingSyncBadge({ className }: PendingSyncBadgeProps) {
  const { count } = usePendingSync()

  if (count === 0) return null

  return (
    <span data-eos-id="src/components/pending-sync-badge.tsx#0"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5',
        'text-xs font-medium text-warning-700',
        className,
      )}
    >
      <CloudOff data-eos-id="src/components/pending-sync-badge.tsx#1" size={12} />
      <span data-eos-id="src/components/pending-sync-badge.tsx#2">{count} pending</span>
    </span>
  )
}
