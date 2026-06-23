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
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className={cn(
            'rounded-md bg-moss-100 border border-moss-200 shadow-sm p-5',
            className,
          )}
        >
          <div className="flex items-start gap-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 15 }}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-moss-100 shrink-0"
            >
              <CheckCircle2 size={22} className="text-moss-600" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-moss-800">{message}</p>
              {subtitle && (
                <p className="text-xs text-moss-600 mt-0.5">{subtitle}</p>
              )}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Link to={listPath}>
                  <Button variant="primary" size="sm" icon={<ArrowRight size={14} />}>
                    {listLabel}
                  </Button>
                </Link>
                {editPath && (
                  <Link to={editPath}>
                    <Button variant="ghost" size="sm">
                      Continue Editing
                    </Button>
                  </Link>
                )}
                {onDismiss && (
                  <Button variant="ghost" size="sm" onClick={onDismiss}>
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
