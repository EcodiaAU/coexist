import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

interface UploadProgressProps {
  /** 0–100 progress. Null hides the indicator. */
  progress: number | null
  /** Override uploading state display */
  uploading?: boolean
  /** Error message to display */
  error?: string | null
  /** Compact mode - just a thin bar */
  variant?: 'bar' | 'overlay'
  className?: string
}

export function UploadProgress({
  progress,
  uploading,
  error,
  variant = 'bar',
  className,
}: UploadProgressProps) {
  const isActive = uploading || (progress !== null && progress < 100)
  const isDone = progress === 100 && !uploading

  if (variant === 'bar') {
    return (
      <AnimatePresence>
        {(isActive || isDone || error) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn('w-full', className)}
          >
            {error ? (
              <div className="flex items-center gap-2 py-1.5 px-3 rounded-sm bg-error-50 text-error-600 text-xs">
                <AlertCircle size={14} />
                {error}
              </div>
            ) : isDone ? (
              <div className="flex items-center gap-2 py-1.5 px-3 rounded-sm bg-success-50 text-success-600 text-xs">
                <CheckCircle2 size={14} />
                Uploaded
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-primary-500" />
                  <span className="text-xs text-neutral-500">
                    Uploading{progress != null ? ` ${progress}%` : '...'}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-white overflow-hidden">
                  <motion.div
                    className="h-full bg-primary-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress ?? 0}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  // Overlay variant - semi-transparent overlay on parent
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            'absolute inset-0 z-10 flex flex-col items-center justify-center',
            'bg-white rounded-sm gpu-backdrop',
            className,
          )}
        >
          <Loader2 size={24} className="animate-spin text-primary-500 mb-2" />
          <span className="text-sm font-medium text-neutral-900">
            {progress != null ? `${progress}%` : 'Uploading...'}
          </span>
          <div className="h-1.5 w-32 mt-2 rounded-full bg-white overflow-hidden">
            <motion.div
              className="h-full bg-primary-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress ?? 0}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
