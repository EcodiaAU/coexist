import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { AlertTriangle, RefreshCw, HardDrive } from 'lucide-react'
import { cn } from '@/lib/cn'

export type SyncIssue = 'auth-expired' | 'storage-full' | null

interface SyncStatusBannerProps {
  issue: SyncIssue
  pendingCount: number
  onSignIn?: () => void
  className?: string
}

/**
 * Persistent banner that stays visible until the user resolves the sync issue.
 * Unlike toasts, this won't auto-dismiss - the user must re-authenticate or
 * free up storage before their queued data can sync.
 */
export function SyncStatusBanner({ issue, pendingCount, onSignIn, className }: SyncStatusBannerProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence data-eos-id="src/components/sync-status-banner.tsx#0">
      {issue && (
        <motion.div data-eos-id="src/components/sync-status-banner.tsx#1"
          initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          role="alert"
          aria-live="assertive"
          className={cn('overflow-hidden', className)}
        >
          {issue === 'auth-expired' && (
            <div data-eos-id="src/components/sync-status-banner.tsx#2" className="flex items-center justify-between gap-3 px-4 py-2.5 bg-warning-100 text-warning-900">
              <div data-eos-id="src/components/sync-status-banner.tsx#3" className="flex items-center gap-2 text-sm font-medium min-w-0">
                <AlertTriangle data-eos-id="src/components/sync-status-banner.tsx#4" size={15} className="shrink-0" />
                <span data-eos-id="src/components/sync-status-banner.tsx#5" className="truncate">
                  Sync paused - sign in to upload {pendingCount} saved action{pendingCount === 1 ? '' : 's'}
                </span>
              </div>
              {onSignIn && (
                <button data-eos-id="src/components/sync-status-banner.tsx#6"
                  type="button"
                  onClick={onSignIn}
                  className="shrink-0 flex items-center gap-1.5 rounded-full bg-warning-700 text-white px-3 py-1 text-xs font-bold"
                >
                  <RefreshCw data-eos-id="src/components/sync-status-banner.tsx#7" size={12} />
                  Sign in
                </button>
              )}
            </div>
          )}

          {issue === 'storage-full' && (
            <div data-eos-id="src/components/sync-status-banner.tsx#8" className="flex items-center gap-2 px-4 py-2.5 bg-error-100 text-error-900 text-sm font-medium">
              <HardDrive data-eos-id="src/components/sync-status-banner.tsx#9" size={15} className="shrink-0" />
              <span data-eos-id="src/components/sync-status-banner.tsx#10">Storage full - connect to the internet and sync your data to free up space</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
