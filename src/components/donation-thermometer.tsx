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
    <div data-eos-id="src/components/donation-thermometer.tsx#0" data-eos-v="2"
      className={cn('flex flex-col items-center gap-3', className)}
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-label={label ?? `$${current.toLocaleString()} raised of $${goal.toLocaleString()} goal`}
    >
      {/* Thermometer */}
      <div data-eos-id="src/components/donation-thermometer.tsx#1" className="relative w-10 h-48 rounded-full bg-primary-50 shadow-inner overflow-hidden">
        {/* Fill */}
        <motion.div data-eos-id="src/components/donation-thermometer.tsx#2"
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
            <motion.div data-eos-id="src/components/donation-thermometer.tsx#3"
              className="absolute -top-1 left-0 right-0 h-3"
              animate={{ y: [-1, 1, -1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <svg data-eos-id="src/components/donation-thermometer.tsx#4" viewBox="0 0 40 8" className="w-full" aria-hidden="true">
                <path data-eos-id="src/components/donation-thermometer.tsx#5"
                  d="M0 4 Q10 0 20 4 Q30 8 40 4 L40 8 L0 8Z"
                  fill="var(--color-accent-300)"
                />
              </svg>
            </motion.div>
          )}
        </motion.div>

        {/* Bubble at bulb */}
        <div data-eos-id="src/components/donation-thermometer.tsx#6" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-accent-400 -mb-1" />
      </div>

      {/* Labels */}
      <div data-eos-id="src/components/donation-thermometer.tsx#7" className="text-center">
        <p data-eos-id="src/components/donation-thermometer.tsx#8" data-eos-var="current.toLocaleString" data-eos-var-label="To locale string" data-eos-var-scope="prop" className="font-heading text-xl font-bold text-neutral-900">
          ${current.toLocaleString()}
        </p>
        <p data-eos-id="src/components/donation-thermometer.tsx#9" data-eos-var="goal.toLocaleString" data-eos-var-label="To locale string" data-eos-var-scope="prop" className="text-sm text-neutral-500">
          of ${goal.toLocaleString()} goal
        </p>
      </div>
    </div>
  )
}
