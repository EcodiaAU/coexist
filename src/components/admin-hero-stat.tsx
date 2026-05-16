import { type ReactNode, Children } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useCountUp } from '@/components/stat-card'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Colour presets                                                     */
/*                                                                     */
/*  Each preset provides an icon accent, value colour, and optional    */
/*  delta badge style. Cards themselves are white/flat - colour only   */
/*  appears on the icon badge and delta indicator.                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line react-refresh/only-export-components
export const HERO_STAT_COLORS = {
  // Greens / nature
  primary:  { icon: 'bg-primary-50 text-primary-600',   value: 'text-neutral-900', delta: 'text-primary-600 bg-primary-50' },
  sprout:   { icon: 'bg-sprout-50 text-sprout-600',     value: 'text-neutral-900', delta: 'text-sprout-600 bg-sprout-50' },
  moss:     { icon: 'bg-moss-50 text-moss-600',         value: 'text-neutral-900', delta: 'text-moss-600 bg-moss-50' },
  success:  { icon: 'bg-success-50 text-success-600',   value: 'text-neutral-900', delta: 'text-success-600 bg-success-50' },

  // Earth
  bark:     { icon: 'bg-bark-50 text-bark-600',         value: 'text-neutral-900', delta: 'text-bark-600 bg-bark-50' },
  secondary:{ icon: 'bg-secondary-50 text-secondary-600', value: 'text-neutral-900', delta: 'text-secondary-600 bg-secondary-50' },

  // (was Blues / cool) - remapped to sage/moss greens to enforce the
  // brand-green hero rule (2026-05-16 Tate). Keys kept for backwards
  // compatibility with callers that haven't migrated yet.
  info:     { icon: 'bg-moss-50 text-moss-600',         value: 'text-neutral-900', delta: 'text-moss-600 bg-moss-50' },
  sky:      { icon: 'bg-primary-50 text-primary-600',   value: 'text-neutral-900', delta: 'text-primary-600 bg-primary-50' },

  // Warm / accent
  warning:  { icon: 'bg-warning-50 text-warning-600',   value: 'text-neutral-900', delta: 'text-warning-600 bg-warning-50' },
  coral:    { icon: 'bg-coral-50 text-coral-600',       value: 'text-neutral-900', delta: 'text-coral-600 bg-coral-50' },
  error:    { icon: 'bg-error-50 text-error-600',       value: 'text-neutral-900', delta: 'text-error-600 bg-error-50' },

  // Purple
  plum:     { icon: 'bg-plum-50 text-plum-600',         value: 'text-neutral-900', delta: 'text-plum-600 bg-plum-50' },

  // Neutral / glass
  glass:    { icon: 'bg-neutral-100 text-neutral-500',  value: 'text-neutral-900', delta: 'text-neutral-500 bg-neutral-50' },
} as const

export type HeroStatColor = keyof typeof HERO_STAT_COLORS

/* ------------------------------------------------------------------ */
/*  AdminHeroStat                                                      */
/* ------------------------------------------------------------------ */

export interface AdminHeroStatProps {
  value: number
  label: string
  icon?: ReactNode
  color?: HeroStatColor
  /** Optional sub-label, e.g. "+12" trend */
  sub?: string
  /** Stagger delay multiplier (0, 1, 2, …) */
  delay?: number
  reducedMotion?: boolean
  className?: string
}

export function AdminHeroStat({
  value,
  label,
  icon,
  color = 'glass',
  sub,
  delay = 0,
  reducedMotion = false,
  className,
}: AdminHeroStatProps) {
  const display = useCountUp(value, 1200, !reducedMotion)
  const c = HERO_STAT_COLORS[color]

  // Parse sub to detect +/- trends
  const isPositive = sub?.startsWith('+')
  const isNegative = sub?.startsWith('-')

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: reducedMotion ? 0 : 0.15 + delay * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-2xl',
        'px-3 py-3 sm:px-4 sm:py-4',
        'bg-white shadow-sm border border-neutral-100',
        className,
      )}
      aria-label={`${label}: ${value}`}
    >
      {/* Icon badge */}
      {icon && (
        <span
          className={cn('flex items-center justify-center w-9 h-9 rounded-xl mb-2.5', c.icon)}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <p
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        className={cn('text-2xl sm:text-3xl font-bold tracking-tight tabular-nums leading-none', c.value)}
      >
        {display.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold text-neutral-400 tracking-wider uppercase truncate max-w-full">
        {label}
      </p>
      {sub && (
        <span className={cn(
          'inline-flex items-center gap-0.5 text-[10px] font-semibold mt-2 px-2 py-0.5 rounded-full',
          isPositive ? 'text-success-600 bg-success-50' :
          isNegative ? 'text-error-600 bg-error-50' :
          c.delta,
        )}>
          {(isPositive || isNegative) && (
            isPositive
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />
          )}
          {sub}
        </span>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Grid wrapper (convenience)                                         */
/* ------------------------------------------------------------------ */

export function AdminHeroStatRow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const count = Children.toArray(children).filter(Boolean).length

  return (
    <div className={cn(
      'grid gap-2.5 sm:gap-3',
      // 2-col on mobile, then expand columns based on count
      count <= 2
        ? 'grid-cols-2 max-w-[320px]'
        : count === 3
          ? 'grid-cols-2 sm:grid-cols-3 max-w-[480px]'
          : 'grid-cols-2 sm:grid-cols-4 max-w-[560px]',
      className,
    )}>
      {children}
    </div>
  )
}
