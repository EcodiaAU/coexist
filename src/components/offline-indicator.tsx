import { useState } from 'react'
import { WifiOff, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useOffline } from '@/hooks/use-offline'

interface OfflineIndicatorProps {
  /** React Query's dataUpdatedAt timestamp (ms) */
  dataUpdatedAt?: number
  /** Whether the query is currently fetching */
  isFetching?: boolean
  /** Compact mode - just an icon, no text */
  compact?: boolean
  className?: string
}

/**
 * Inline offline/stale data indicator for data-dependent components.
 * Shows:
 *   - "Offline - showing cached data" when offline with data
 *   - "Updated X ago" when data is stale
 *   - Spinning refresh icon when fetching
 */
export function OfflineIndicator({
  dataUpdatedAt,
  isFetching,
  compact,
  className,
}: OfflineIndicatorProps) {
  const { isOffline } = useOffline()
  const [now] = useState(() => Date.now())

  if (isFetching && !isOffline) {
    return (
      <span data-eos-id="src/components/offline-indicator.tsx#0" className={cn('inline-flex items-center gap-1 text-xs text-neutral-500', className)}>
        <RefreshCw data-eos-id="src/components/offline-indicator.tsx#1" size={12} className="animate-spin" />
        {!compact && <span data-eos-id="src/components/offline-indicator.tsx#2">Updating…</span>}
      </span>
    )
  }

  if (isOffline) {
    return (
      <span data-eos-id="src/components/offline-indicator.tsx#3" className={cn('inline-flex items-center gap-1 text-xs text-warning-600', className)}>
        <WifiOff data-eos-id="src/components/offline-indicator.tsx#4" size={12} />
        {!compact && <span data-eos-id="src/components/offline-indicator.tsx#5">Offline - cached data</span>}
      </span>
    )
  }

  // Show "stale" hint if data is older than 5 minutes
  if (dataUpdatedAt) {
    const age = now - dataUpdatedAt
    if (age > 5 * 60 * 1000) {
      const mins = Math.round(age / 60_000)
      const label = mins >= 60 ? `${Math.round(mins / 60)}h ago` : `${mins}m ago`
      return (
        <span data-eos-id="src/components/offline-indicator.tsx#6" className={cn('inline-flex items-center gap-1 text-xs text-neutral-500', className)}>
          <Clock data-eos-id="src/components/offline-indicator.tsx#7" size={12} />
          {!compact ? <span data-eos-id="src/components/offline-indicator.tsx#8">Updated {label}</span> : null}
        </span>
      )
    }
  }

  return null
}
