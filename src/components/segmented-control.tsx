import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Segment<T extends string = string> {
  id: T
  label: string
  icon?: ReactNode
}

type SegmentedControlVariant = 'filled' | 'pill' | 'dark'

interface SegmentedControlProps<T extends string = string> {
  segments: Segment<T>[]
  value: T
  onChange: (id: T) => void
  /** 'filled' = search-family grey track + white sliding pill (default). 'pill' = solid-olive sliding pill. 'dark' = translucent-white track + white sliding pill, for switchers ON a dark/coloured surface (e.g. the home impact card). */
  variant?: SegmentedControlVariant
  /** Hide labels on mobile, show icon-only. Labels appear at sm: breakpoint. */
  compact?: boolean
  className?: string
  'aria-label'?: string
}

/* ------------------------------------------------------------------ */
/*  Variant styles                                                     */
/*  The default 'filled' variant matches the `search-bar` primitive    */
/*  (warm-grey surface-3 track, rounded-full, shadow-sm) so a switcher  */
/*  and a search field read as one family. The sliding pill is a        */
/*  layoutId motion.span lifted from bottom-tab-bar.tsx.                */
/* ------------------------------------------------------------------ */

const VARIANT_STYLES: Record<
  SegmentedControlVariant,
  { track: string; indicator: string; active: string; inactive: string }
> = {
  filled: {
    track: 'bg-surface-3 rounded-full shadow-sm p-1',
    // white pill + the search-bar primary-ring accent (the approved A+B blend)
    indicator: 'bg-white shadow-sm ring-1 ring-primary-200',
    active: 'text-primary-800',
    inactive: 'text-neutral-500 hover:text-neutral-700',
  },
  pill: {
    track: 'bg-primary-50 rounded-full p-1 ring-1 ring-primary-100',
    indicator: 'bg-primary-600 shadow-sm',
    active: 'text-white',
    inactive: 'text-primary-700 hover:text-primary-800',
  },
  // For switchers sitting ON a dark / coloured surface (home impact card, dark
  // modals). Translucent-white track + solid-white sliding pill; dark active text
  // on the pill, translucent-white inactive text on the surface.
  dark: {
    track: 'bg-white/15 rounded-full p-1',
    indicator: 'bg-white shadow-sm',
    active: 'text-primary-900',
    inactive: 'text-white/70 hover:text-white',
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
  const shouldReduceMotion = useReducedMotion()
  // Unique per instance so two switchers on one page never share a layout pill.
  const pillId = useId()
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Roving-tabindex keyboard nav (manual switcher = activate on arrow).
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      let next = index
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % segments.length
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        next = (index - 1 + segments.length) % segments.length
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = segments.length - 1
      else return
      e.preventDefault()
      onChange(segments[next].id)
      btnRefs.current[next]?.focus()
    },
    [segments, onChange],
  )

  return (
    <div data-eos-id="src/components/segmented-control.tsx#0" data-eos-v="2"
      role="tablist"
      aria-label={ariaLabel}
      className={cn('relative flex', styles.track, className)}
    >
      <LayoutGroup id={pillId}>
        {segments.map((seg, index) => {
          const isActive = seg.id === value
          const isFirst = index === 0
          const isLast = index === segments.length - 1

          return (
            <button data-eos-id="src/components/segmented-control.tsx#1"
              key={seg.id}
              ref={(el) => {
                btnRefs.current[index] = el
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(seg.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                'relative flex-1 flex items-center justify-center gap-1.5',
                'min-h-11 rounded-full text-sm font-semibold',
                'cursor-pointer select-none',
                // active/inactive label colour moves on the shared motion contract
                'transition-colors [transition-timing-function:var(--ease-out)] [transition-duration:var(--dur-base)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
                isActive ? styles.active : styles.inactive,
              )}
            >
              {/* Sliding pill - one motion.span in the active segment; layoutId
                  FLIPs it between segments. Vertical seat comes from the track's
                  p-1 (~4px). End segments bleed ~3px toward the outer edge so the
                  first hugs left / last hugs right (~1px gap), interior overlays
                  the button box exactly - matching the approved prototype. */}
              {isActive && (
                <motion.span data-eos-id="src/components/segmented-control.tsx#4"
                  layoutId={shouldReduceMotion ? undefined : `${pillId}-seg-pill`}
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-y-0 z-0 rounded-full',
                    styles.indicator,
                    isFirst ? '-left-[3px] right-0' : isLast ? 'left-0 -right-[3px]' : 'inset-x-0',
                  )}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
                />
              )}

              {seg.icon && (
                <span data-eos-id="src/components/segmented-control.tsx#2" data-eos-var="seg.icon" data-eos-var-label="Icon" data-eos-var-scope="item" className="relative z-10 shrink-0" aria-hidden="true">
                  {seg.icon}
                </span>
              )}
              <span data-eos-id="src/components/segmented-control.tsx#3" data-eos-var="seg.label" data-eos-var-label="Label" data-eos-var-scope="item" className={cn('relative z-10', compact ? 'hidden sm:inline' : undefined)}>{seg.label}</span>
            </button>
          )
        })}
      </LayoutGroup>
    </div>
  )
}
