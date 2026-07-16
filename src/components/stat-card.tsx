import { type ReactNode, useEffect, useState, startTransition } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Trend {
  value: number
  direction: 'up' | 'down' | 'flat'
}

interface StatCardProps {
  value: number | string
  label: string
  trend?: Trend
  icon?: ReactNode
  /** Accent colour for the icon badge - defaults to primary */
  accent?: string
  className?: string
  /** Tighter padding + smaller value/icon for narrow grids (e.g. 3-col modal). */
  compact?: boolean
  'aria-label'?: string
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCountUp(target: number, duration: number, enabled: boolean) {
  const [current, setCurrent] = useState(enabled ? 0 : target)

  useEffect(() => {
    if (!enabled) {
      startTransition(() => setCurrent(target))
      return
    }

    const startTime = performance.now()
    let frame: number

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      startTransition(() => setCurrent(Math.round(eased * target)))

      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, enabled])

  return current
}

const trendConfig = {
  up: { icon: TrendingUp, color: 'text-success-600 bg-success-50' },
  down: { icon: TrendingDown, color: 'text-error-600 bg-error-50' },
  flat: { icon: Minus, color: 'text-neutral-400 bg-neutral-50' },
}

export function StatCard({
  value,
  label,
  trend,
  icon,
  accent,
  className,
  compact = false,
  'aria-label': ariaLabel,
}: StatCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const isNumeric = typeof value === 'number'
  const displayValue = useCountUp(
    isNumeric ? value : 0,
    1200,
    isNumeric && !shouldReduceMotion,
  )

  const tc = trend ? trendConfig[trend.direction] : null
  const TrendIcon = tc?.icon

  return (
    <motion.div data-eos-id="src/components/stat-card.tsx#0" data-eos-v="2"
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 300, damping: 25 }
      }
      aria-label={ariaLabel ?? `${label}: ${value}`}
      className={cn(
        'rounded-md bg-white shadow-sm border border-neutral-100',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div data-eos-id="src/components/stat-card.tsx#1" className="flex items-start justify-between gap-2">
        <div data-eos-id="src/components/stat-card.tsx#2" className="flex-1 min-w-0">
          <p data-eos-id="src/components/stat-card.tsx#3" data-eos-var="displayValue.toLocaleString" data-eos-var-label="To locale string" data-eos-var-scope="prop" className={cn(
            'font-heading font-bold text-neutral-900 tabular-nums leading-tight truncate',
            compact ? 'text-xl' : 'text-3xl',
          )}>
            {isNumeric ? displayValue.toLocaleString() : value}
          </p>
          <p data-eos-id="src/components/stat-card.tsx#4" className={cn(
            'mt-1 font-medium text-neutral-500 uppercase tracking-wider leading-tight line-clamp-2',
            compact ? 'text-[10px]' : 'text-xs mt-1.5',
          )}>{label}</p>
        </div>
        {icon && (
          <span data-eos-id="src/components/stat-card.tsx#5"
            className={cn(
              'flex items-center justify-center shrink-0 rounded-sm',
              compact ? 'w-7 h-7' : 'w-10 h-10 ml-3',
              accent ?? 'bg-primary-50 text-primary-600',
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>
      {trend && tc && TrendIcon && (
        <div data-eos-id="src/components/stat-card.tsx#6"
          className={cn(
            'mt-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
            tc.color,
          )}
          aria-label={`Trend: ${trend.direction} ${trend.value}%`}
        >
          <TrendIcon data-eos-id="src/components/stat-card.tsx#7" className="w-3.5 h-3.5" aria-hidden="true" />
          <span data-eos-id="src/components/stat-card.tsx#8" data-eos-var="trend.direction" data-eos-var-label="Direction" data-eos-var-scope="prop" className="tabular-nums">{trend.direction === 'flat' ? '-' : `${trend.value}%`}</span>
        </div>
      )}
    </motion.div>
  )
}
