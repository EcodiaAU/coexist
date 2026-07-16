import { motion, useReducedMotion } from 'framer-motion'
import { APP_NAME, TAGLINE } from '@/lib/constants'
import { cn } from '@/lib/cn'

interface MaintenanceModeProps {
  message?: string
  className?: string
}

/**
 * Branded maintenance mode page.
 * §42 item 67.
 */
export function MaintenanceMode({
  message = "We're making things even better. Back shortly!",
  className,
}: MaintenanceModeProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div data-eos-id="src/components/maintenance-mode.tsx#0" data-eos-v="2"
      className={cn(
        'fixed inset-0 z-[200] flex flex-col items-center justify-center',
        'bg-gradient-to-b from-white to-white',
        'px-6 text-center',
        className,
      )}
      role="alert"
      aria-label="App is under maintenance"
    >
      <motion.div data-eos-id="src/components/maintenance-mode.tsx#1"
        className="flex flex-col items-center gap-4 max-w-sm"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <h1 data-eos-id="src/components/maintenance-mode.tsx#2" className="font-heading text-3xl font-bold text-black tracking-tight">
          {APP_NAME}
        </h1>

        {/* Nature illustration */}
        <svg data-eos-id="src/components/maintenance-mode.tsx#3"
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          aria-hidden="true"
          className="my-4"
        >
          {/* Ground */}
          <ellipse data-eos-id="src/components/maintenance-mode.tsx#4" cx="60" cy="72" rx="50" ry="6" fill="var(--color-primary-100)" />
          {/* Tree trunk */}
          <rect data-eos-id="src/components/maintenance-mode.tsx#5" x="56" y="40" width="8" height="32" rx="3" fill="var(--color-secondary-400)" />
          {/* Tree canopy */}
          <circle data-eos-id="src/components/maintenance-mode.tsx#6" cx="60" cy="32" r="24" fill="var(--color-primary-300)" />
          <circle data-eos-id="src/components/maintenance-mode.tsx#7" cx="48" cy="38" r="16" fill="var(--color-primary-400)" />
          <circle data-eos-id="src/components/maintenance-mode.tsx#8" cx="72" cy="38" r="16" fill="var(--color-primary-400)" />
          {/* Tools */}
          <rect data-eos-id="src/components/maintenance-mode.tsx#9" x="80" y="55" width="3" height="20" rx="1" fill="var(--color-secondary-300)" transform="rotate(-15 80 55)" />
          <rect data-eos-id="src/components/maintenance-mode.tsx#10" x="78" y="52" width="10" height="6" rx="2" fill="var(--color-primary-400)" transform="rotate(-15 80 55)" />
        </svg>

        <h2 data-eos-id="src/components/maintenance-mode.tsx#11" className="font-heading text-xl font-semibold text-neutral-900">
          Under Maintenance
        </h2>

        <p data-eos-id="src/components/maintenance-mode.tsx#12" className="text-sm text-neutral-500 leading-relaxed">
          {message}
        </p>

        <p data-eos-id="src/components/maintenance-mode.tsx#13" className="mt-4 text-xs text-neutral-400 font-medium">
          {TAGLINE}
        </p>
      </motion.div>
    </div>
  )
}
