import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

interface RegisterButtonProps {
  registered: boolean
  loading?: boolean
  onRegister: () => void
  onCancel?: () => void
  className?: string
}

/**
 * Register → "You're going!" morphing button.
 * §55.3.1: Button morphs with text change, colour shift, checkmark draw-in.
 */
export function RegisterButton({
  registered,
  loading = false,
  onRegister,
  onCancel,
  className,
}: RegisterButtonProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.button data-eos-id="src/components/register-button.tsx#0"
      type="button"
      onClick={registered ? onCancel : onRegister}
      disabled={loading}
      className={cn(
        'relative flex items-center justify-center gap-2',
        'min-w-[180px] min-h-12 px-6 py-3 rounded-sm font-heading font-semibold text-sm',
        'transition-colors focus-visible:outline-none focus-visible:ring-2',
        registered
          ? 'bg-success-50 text-success-700 border-2 border-success-200 focus-visible:ring-success-400'
          : 'bg-primary-800 text-white focus-visible:ring-primary-400',
        loading && 'opacity-70 cursor-wait',
        className,
      )}
      layout={!shouldReduceMotion}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 400, damping: 30 }
      }
      aria-label={registered ? "You're going! Tap to cancel" : 'Register for event'}
      aria-pressed={registered}
    >
      <AnimatePresence data-eos-id="src/components/register-button.tsx#1" mode="wait" initial={false}>
        {registered ? (
          <motion.span data-eos-id="src/components/register-button.tsx#2"
            key="registered"
            className="flex items-center gap-2"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
          >
            {/* Checkmark that draws in */}
            <motion.span data-eos-id="src/components/register-button.tsx#3"
              initial={shouldReduceMotion ? false : { scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 500, damping: 15, delay: 0.1 }
              }
            >
              <Check data-eos-id="src/components/register-button.tsx#4" size={18} strokeWidth={3} />
            </motion.span>
            You&apos;re going!
          </motion.span>
        ) : (
          <motion.span data-eos-id="src/components/register-button.tsx#5"
            key="register"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? 'Registering...' : 'Register'}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
