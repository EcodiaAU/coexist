import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { Confetti } from './confetti'

interface CelebrationProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: ReactNode
  /** Auto-dismiss after ms (0 = manual only) */
  autoDismiss?: number
  className?: string
}

/**
 * Full-screen celebration overlay for big wins:
 * first event, tier up, milestones.
 */
export function Celebration({
  open,
  onClose,
  title,
  subtitle,
  icon,
  autoDismiss = 4000,
  className,
}: CelebrationProps) {
  const shouldReduceMotion = useReducedMotion()
  const showConfetti = open

  useEffect(() => {
    if (open && autoDismiss > 0) {
      const timer = setTimeout(onClose, autoDismiss)
      return () => clearTimeout(timer)
    }
  }, [open, autoDismiss, onClose])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return createPortal(
    <AnimatePresence data-eos-id="src/components/celebration.tsx#0">
      {open && (
        <motion.div data-eos-id="src/components/celebration.tsx#1"
          className={cn(
            'fixed inset-0 z-[100] flex flex-col items-center justify-center',
            'bg-primary-900',
            'text-white',
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.3 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <Confetti data-eos-id="src/components/celebration.tsx#2" active={showConfetti} count={50} duration={3000} />

          {/* Glow ring - GPU-promoted */}
          {!shouldReduceMotion && (
            <motion.div data-eos-id="src/components/celebration.tsx#3"
              className="absolute w-64 h-64 rounded-full bg-primary-400/10 gpu-panel"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.4, 1.15], opacity: [0, 0.5, 0.25] }}
              transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
              aria-hidden="true"
            />
          )}

          {/* Icon */}
          {icon && (
            <motion.div data-eos-id="src/components/celebration.tsx#4"
              className="relative mb-6"
              initial={shouldReduceMotion ? false : { scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 220, damping: 14, mass: 0.8, delay: 0.2 }
              }
            >
              <div data-eos-id="src/components/celebration.tsx#5" className="flex items-center justify-center w-20 h-20 rounded-full bg-white/20">
                {icon}
              </div>
            </motion.div>
          )}

          {/* Title */}
          <motion.h2 data-eos-id="src/components/celebration.tsx#6"
            className="font-heading text-3xl font-bold text-center px-6 max-w-sm"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.4, duration: 0.4 }}
          >
            {title}
          </motion.h2>

          {/* Subtitle */}
          {subtitle && (
            <motion.p data-eos-id="src/components/celebration.tsx#7"
              className="mt-3 text-base text-white/80 text-center px-6 max-w-xs"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.6, duration: 0.3 }}
            >
              {subtitle}
            </motion.p>
          )}

          {/* Tap to dismiss */}
          <motion.p data-eos-id="src/components/celebration.tsx#8"
            className="absolute text-sm text-white/40"
            style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 3rem)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: shouldReduceMotion ? 0 : 1.5 }}
          >
            Tap anywhere to continue
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
