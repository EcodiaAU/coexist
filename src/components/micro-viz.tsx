/**
 * Micro-visualizations for stat cards.
 *
 * Each metric type gets a display that communicates what the number *means*:
 * - MiniBar:      horizontal fill bar for quantities with a known max (hours, kg, etc.)
 * - MiniRing:     small donut for percentages / ratios
 * - MiniSparkline: tiny line chart for trend data
 * - DeltaMark:    small +/- pill for changes
 */

import { motion, useReducedMotion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  MiniBar - horizontal fill for bounded values                       */
/* ------------------------------------------------------------------ */

interface MiniBarProps {
  /** Current value */
  value: number
  /** Maximum / target value for the bar to fill against */
  max: number
  /** Tailwind color class for the bar fill, e.g. 'bg-primary-500' */
  color?: string
  className?: string
}

export function MiniBar({ value, max, color = 'bg-primary-500', className }: MiniBarProps) {
  const rm = useReducedMotion()
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0

  return (
    <div data-eos-id="src/components/micro-viz.tsx#0" data-eos-v="2" className={cn('h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden', className)}>
      <motion.div data-eos-id="src/components/micro-viz.tsx#1"
        className={cn('h-full rounded-full', color)}
        initial={rm ? { width: `${pct}%` } : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  MiniRing - small donut for percentages                             */
/* ------------------------------------------------------------------ */

interface MiniRingProps {
  /** Percentage 0–100 */
  value: number
  /** Size in px */
  size?: number
  /** Stroke color (CSS value) */
  color?: string
  className?: string
}

export function MiniRing({ value, size = 32, color = 'var(--color-primary-500)', className }: MiniRingProps) {
  const rm = useReducedMotion()
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const dashLen = (Math.min(value, 100) / 100) * circumference

  return (
    <svg data-eos-id="src/components/micro-viz.tsx#2"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('-rotate-90', className)}
    >
      <circle data-eos-id="src/components/micro-viz.tsx#3"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={3}
        className="stroke-neutral-100"
      />
      <motion.circle data-eos-id="src/components/micro-viz.tsx#4"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        initial={rm ? {} : { strokeDasharray: `0 ${circumference}` }}
        animate={{ strokeDasharray: `${dashLen} ${circumference - dashLen}` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  MiniSparkline - tiny trend line                                    */
/* ------------------------------------------------------------------ */

interface MiniSparklineProps {
  /** Array of values (min 2 points) */
  data: number[]
  /** Stroke color */
  color?: string
  /** Height in px */
  height?: number
  /** Width in px */
  width?: number
  className?: string
}

export function MiniSparkline({
  data,
  color = 'var(--color-primary-500)',
  height = 24,
  width = 64,
  className,
}: MiniSparklineProps) {
  const rm = useReducedMotion()
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const padding = 2

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = padding + (1 - (v - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  const pathD = `M${points.join(' L')}`

  return (
    <svg data-eos-id="src/components/micro-viz.tsx#5"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <motion.path data-eos-id="src/components/micro-viz.tsx#6"
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={rm ? {} : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  DeltaMark - small trend pill                                       */
/* ------------------------------------------------------------------ */

interface DeltaMarkProps {
  /** Numeric change value (positive or negative) */
  value: number
  /** Label suffix, e.g. '%' or '' */
  suffix?: string
  className?: string
}

export function DeltaMark({ value, suffix = '%', className }: DeltaMarkProps) {
  const isPositive = value > 0
  const isNegative = value < 0
  const isFlat = value === 0

  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus

  return (
    <span data-eos-id="src/components/micro-viz.tsx#7"
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums',
        isPositive && 'bg-success-50 text-success-600',
        isNegative && 'bg-error-50 text-error-600',
        isFlat && 'bg-neutral-50 text-neutral-400',
        className,
      )}
    >
      <Icon data-eos-id="src/components/micro-viz.tsx#8" className="w-3 h-3" />
      {isPositive ? '+' : ''}{value}{suffix}
    </span>
  )
}
