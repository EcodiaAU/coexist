import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface DonationThermometerProps {
  current: number
  goal: number
  label?: string
  className?: string
}

/**
 * Donation thermometer with liquid fill animation.
 * §37 item 18.
 */
export function DonationThermometer({
  current,
  goal,
  label,
  className,
}: DonationThermometerProps) {
  const shouldReduceMotion = useReducedMotion()
  const percentage = Math.min((current / goal) * 100, 100)

  return (
    <div
      className={cn('flex flex-col items-center gap-3', className)}
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-label={label ?? `$${current.toLocaleString()} raised of $${goal.toLocaleString()} goal`}
    >
      {/* Thermometer */}
      <div className="relative w-10 h-48 rounded-full bg-primary-50 shadow-inner overflow-hidden">
        {/* Fill */}
        <motion.div
          className={cn(
            'absolute bottom-0 left-0 right-0 rounded-full',
            'bg-accent-300',
          )}
          initial={{ height: shouldReduceMotion ? `${percentage}%` : '0%' }}
          animate={{ height: `${percentage}%` }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 60, damping: 18, mass: 1.2 }
          }
        >
          {/* Liquid surface wobble */}
          {!shouldReduceMotion && (
            <motion.div
              className="absolute -top-1 left-0 right-0 h-3"
              animate={{ y: [-1, 1, -1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <svg viewBox="0 0 40 8" className="w-full" aria-hidden="true">
                <path
                  d="M0 4 Q10 0 20 4 Q30 8 40 4 L40 8 L0 8Z"
                  fill="var(--color-accent-300)"
                />
              </svg>
            </motion.div>
          )}
        </motion.div>

        {/* Bubble at bulb */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-accent-400 -mb-1" />
      </div>

      {/* Labels */}
      <div className="text-center">
        <p className="font-heading text-xl font-bold text-neutral-900">
          ${current.toLocaleString()}
        </p>
        <p className="text-sm text-neutral-500">
          of ${goal.toLocaleString()} goal
        </p>
      </div>
    </div>
  )
}
