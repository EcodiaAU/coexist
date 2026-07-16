import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/button'
import { cn } from '@/lib/cn'

interface SaveSuccessBannerProps {
  show: boolean
  message: string
  subtitle?: string
  editPath?: string
  listPath?: string
  listLabel?: string
  onDismiss?: () => void
  className?: string
}

export function SaveSuccessBanner({
  show,
  message,
  subtitle,
  editPath,
  listPath = '/admin/development',
  listLabel = 'Back to Development',
  onDismiss,
  className,
}: SaveSuccessBannerProps) {
  return (
    <AnimatePresence data-eos-id="src/components/development/save-success-banner.tsx#0" data-eos-v="2">
      {show && (
        <motion.div data-eos-id="src/components/development/save-success-banner.tsx#1"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className={cn(
            'rounded-md bg-moss-100 border border-moss-200 shadow-sm p-5',
            className,
          )}
        >
          <div data-eos-id="src/components/development/save-success-banner.tsx#2" className="flex items-start gap-3">
            <motion.div data-eos-id="src/components/development/save-success-banner.tsx#3"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 15 }}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-moss-100 shrink-0"
            >
              <CheckCircle2 data-eos-id="src/components/development/save-success-banner.tsx#4" size={22} className="text-moss-600" />
            </motion.div>
            <div data-eos-id="src/components/development/save-success-banner.tsx#5" className="flex-1 min-w-0">
              <p data-eos-id="src/components/development/save-success-banner.tsx#6" className="text-sm font-bold text-moss-800">{message}</p>
              {subtitle && (
                <p data-eos-id="src/components/development/save-success-banner.tsx#7" className="text-xs text-moss-600 mt-0.5">{subtitle}</p>
              )}
              <div data-eos-id="src/components/development/save-success-banner.tsx#8" className="flex items-center gap-2 mt-3 flex-wrap">
                <Link data-eos-id="src/components/development/save-success-banner.tsx#9" to={listPath}>
                  <Button data-eos-id="src/components/development/save-success-banner.tsx#10" variant="primary" size="sm" icon={<ArrowRight data-eos-id="src/components/development/save-success-banner.tsx#11" size={14} />}>
                    {listLabel}
                  </Button>
                </Link>
                {editPath && (
                  <Link data-eos-id="src/components/development/save-success-banner.tsx#12" to={editPath}>
                    <Button data-eos-id="src/components/development/save-success-banner.tsx#13" variant="ghost" size="sm">
                      Continue Editing
                    </Button>
                  </Link>
                )}
                {onDismiss && (
                  <Button data-eos-id="src/components/development/save-success-banner.tsx#14" variant="ghost" size="sm" onClick={onDismiss}>
                    Create Another
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default SaveSuccessBanner
