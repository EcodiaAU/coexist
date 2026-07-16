import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ProgressBarProps {
  value: number
  variant?: 'linear' | 'circular'
  size?: 'sm' | 'md' | 'lg'
  color?: string
  milestones?: number[]
  showLabel?: boolean
  label?: string
  className?: string
  'aria-label'?: string
}

const linearSizes = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
} as const

const circularDimensions = {
  sm: { size: 40, stroke: 3 },
  md: { size: 64, stroke: 4 },
  lg: { size: 96, stroke: 6 },
} as const

const circularFontSizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg',
} as const

function LinearProgress({
  value,
  size = 'md',
  color = 'bg-primary-500',
  milestones,
  showLabel,
  label,
  shouldReduceMotion,
  className,
  ariaLabel,
}: {
  value: number
  size: 'sm' | 'md' | 'lg'
  color: string
  milestones?: number[]
  showLabel?: boolean
  label?: string
  shouldReduceMotion: boolean | null
  className?: string
  ariaLabel?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div data-eos-id="src/components/progress-bar.tsx#0" data-eos-v="2" className={cn('w-full', className)}>
      {(showLabel || label) && (
        <div data-eos-id="src/components/progress-bar.tsx#1" className="flex items-center justify-between mb-1.5">
          {label && (
            <span data-eos-id="src/components/progress-bar.tsx#2" className="text-sm font-medium text-neutral-900">{label}</span>
          )}
          {showLabel && (
            <span data-eos-id="src/components/progress-bar.tsx#3" data-eos-var="Math.round" data-eos-var-label="Round" data-eos-var-scope="prop" className="text-sm tabular-nums text-neutral-500">
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <div data-eos-id="src/components/progress-bar.tsx#4"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label ?? 'Progress'}
        className={cn('relative w-full rounded-full bg-white overflow-hidden', linearSizes[size])}
      >
        <motion.div data-eos-id="src/components/progress-bar.tsx#5"
          className={cn('h-full rounded-full', color)}
          initial={shouldReduceMotion ? { width: `${clamped}%` } : { width: '0%' }}
          animate={{ width: `${clamped}%` }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 120, damping: 22, mass: 0.9 }
          }
        />
        {milestones?.map((milestone) => {
          const clampedMilestone = Math.max(0, Math.min(100, milestone))
          return (
            <span data-eos-id="src/components/progress-bar.tsx#6"
              key={milestone}
              aria-hidden="true"
              className={cn(
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
                'rounded-full bg-white border-2 border-neutral-200',
                size === 'sm' && 'w-2 h-2',
                size === 'md' && 'w-3 h-3',
                size === 'lg' && 'w-4 h-4',
              )}
              style={{ left: `${clampedMilestone}%` }}
            />
          )
        })}
      </div>
    </div>
  )
}

function CircularProgress({
  value,
  size = 'md',
  color = 'text-primary-500',
  showLabel,
  label,
  shouldReduceMotion,
  className,
  ariaLabel,
}: {
  value: number
  size: 'sm' | 'md' | 'lg'
  color: string
  showLabel?: boolean
  label?: string
  shouldReduceMotion: boolean | null
  className?: string
  ariaLabel?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const dims = circularDimensions[size]
  const radius = (dims.size - dims.stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  // Map bg-* color to text-* for SVG stroke
  const strokeColor = color.startsWith('bg-')
    ? color.replace('bg-', 'text-')
    : color

  return (
    <div data-eos-id="src/components/progress-bar.tsx#7"
      className={cn('inline-flex flex-col items-center gap-1', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? label ?? 'Progress'}
    >
      <svg data-eos-id="src/components/progress-bar.tsx#8"
        width={dims.size}
        height={dims.size}
        viewBox={`0 0 ${dims.size} ${dims.size}`}
        className="-rotate-90"
      >
        <circle data-eos-id="src/components/progress-bar.tsx#9"
          cx={dims.size / 2}
          cy={dims.size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={dims.stroke}
          className="text-primary-200"
        />
        <motion.circle data-eos-id="src/components/progress-bar.tsx#10"
          cx={dims.size / 2}
          cy={dims.size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={dims.stroke}
          strokeLinecap="round"
          className={strokeColor}
          strokeDasharray={circumference}
          initial={
            shouldReduceMotion
              ? { strokeDashoffset: offset }
              : { strokeDashoffset: circumference }
          }
          animate={{ strokeDashoffset: offset }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 100, damping: 22, mass: 0.9 }
          }
        />
      </svg>
      {showLabel && (
        <span data-eos-id="src/components/progress-bar.tsx#11" data-eos-var="Math.round" data-eos-var-label="Round" data-eos-var-scope="prop" className={cn('tabular-nums font-semibold text-neutral-900', circularFontSizes[size])}>
          {Math.round(clamped)}%
        </span>
      )}
      {label && (
        <span data-eos-id="src/components/progress-bar.tsx#12" className="text-xs text-neutral-500">{label}</span>
      )}
    </div>
  )
}

export function ProgressBar({
  value,
  variant = 'linear',
  size = 'md',
  color = variant === 'circular' ? 'text-primary-500' : 'bg-primary-500',
  milestones,
  showLabel,
  label,
  className,
  'aria-label': ariaLabel,
}: ProgressBarProps) {
  const shouldReduceMotion = useReducedMotion()

  if (variant === 'circular') {
    return (
      <CircularProgress data-eos-id="src/components/progress-bar.tsx#13"
        value={value}
        size={size}
        color={color}
        showLabel={showLabel}
        label={label}
        shouldReduceMotion={shouldReduceMotion}
        className={className}
        ariaLabel={ariaLabel}
      />
    )
  }

  return (
    <LinearProgress data-eos-id="src/components/progress-bar.tsx#14"
      value={value}
      size={size}
      color={color}
      milestones={milestones}
      showLabel={showLabel}
      label={label}
      shouldReduceMotion={shouldReduceMotion}
      className={className}
      ariaLabel={ariaLabel}
    />
  )
}
