import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { WifiOff, Wifi } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useOffline } from '@/hooks/use-offline'

interface OfflineBannerProps {
  className?: string
}

export function OfflineBanner({ className }: OfflineBannerProps) {
  const { isOffline, justReconnected } = useOffline()
  const shouldReduceMotion = useReducedMotion()

  const show = isOffline || justReconnected

  return (
    <AnimatePresence data-eos-id="src/components/offline-banner.tsx#0">
      {show && (
        <motion.div data-eos-id="src/components/offline-banner.tsx#1"
          initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          role="status"
          aria-live="polite"
          className={cn('overflow-hidden', className)}
        >
          <div data-eos-id="src/components/offline-banner.tsx#2"
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium',
              isOffline
                ? 'bg-primary-900 text-white'
                : 'bg-success text-white',
            )}
          >
            {isOffline ? (
              <>
                <WifiOff data-eos-id="src/components/offline-banner.tsx#3" size={14} />
                <span data-eos-id="src/components/offline-banner.tsx#4">You're offline - some features may be limited</span>
              </>
            ) : (
              <>
                <Wifi data-eos-id="src/components/offline-banner.tsx#5" size={14} />
                <span data-eos-id="src/components/offline-banner.tsx#6">Back online</span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
