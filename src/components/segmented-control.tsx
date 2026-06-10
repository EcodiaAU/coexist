import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Segment<T extends string = string> {
  id: T
  label: string
  icon?: ReactNode
}

type SegmentedControlVariant = 'filled' | 'pill'

interface SegmentedControlProps<T extends string = string> {
  segments: Segment<T>[]
  value: T
  onChange: (id: T) => void
  /** 'filled' = white bg active on neutral-100 track (default). 'pill' = colored bg active on white track. */
  variant?: SegmentedControlVariant
  /** Hide labels on mobile, show icon-only. Labels appear at sm: breakpoint. */
  compact?: boolean
  className?: string
  'aria-label'?: string
}

/* ------------------------------------------------------------------ */
/*  Variant styles                                                     */
/* ------------------------------------------------------------------ */

const VARIANT_STYLES: Record<SegmentedControlVariant, { track: string; active: string; inactive: string }> = {
  filled: {
    track: 'bg-neutral-100 rounded-xl p-1',
    active: 'bg-white text-primary-800 shadow-sm ring-1 ring-primary-200/40',
    inactive: 'text-neutral-500 hover:text-neutral-700 active:bg-white/50',
  },
  pill: {
    track: 'bg-white/80 border border-neutral-200/50 rounded-2xl p-1 shadow-sm',
    active: 'bg-primary-600 text-white shadow-sm',
    inactive: 'text-neutral-500 hover:text-neutral-700',
  },
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SegmentedControl<T extends string = string>({
  segments,
  value,
  onChange,
  variant = 'filled',
  compact = false,
  className,
  'aria-label': ariaLabel = 'View options',
}: SegmentedControlProps<T>) {
  const styles = VARIANT_STYLES[variant]

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex', styles.track, className)}
    >
      {segments.map((seg) => {
        const isActive = seg.id === value

        return (
          <button
            key={seg.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(seg.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5',
              'min-h-11 rounded-xl text-sm font-semibold',
              'cursor-pointer select-none',
              'transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
              isActive ? styles.active : styles.inactive,
            )}
          >
            {seg.icon && (
              <span className="shrink-0" aria-hidden="true">
                {seg.icon}
              </span>
            )}
            <span className={compact ? 'hidden sm:inline' : undefined}>{seg.label}</span>
          </button>
        )
      })}
    </div>
  )
}
