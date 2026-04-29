import { type ReactNode, Children, cloneElement, isValidElement } from 'react'
import { motion, useReducedMotion, useInView } from 'framer-motion'
import { useCountUp } from '@/components/stat-card'
import { cn } from '@/lib/cn'
import { useRef } from 'react'

/* ------------------------------------------------------------------ */
/*  BentoStatCard                                                      */
/*                                                                     */
/*  Cream / off-white card on a muted sage background.                 */
/*  Dark olive icon badges, large bold values, uppercase labels.       */
/* ------------------------------------------------------------------ */

export interface BentoStatCardProps {
  value: number | string
  label: string
  icon: ReactNode
  /** Watermark icon - defaults to same as `icon` but rendered large behind the value */
  watermarkIcon?: ReactNode
  /** Legacy theme prop - accepted for compatibility, no longer affects styling */
  theme?: string
  /** Whether this is a "hero" (large) card in the bento grid */
  hero?: boolean
  /** Optional unit suffix (kg, m, hrs, etc.) */
  unit?: string
  /** Optional description text - only shown on hero cards */
  description?: string
  /** Optional comparison badge text e.g. "+12% VS LY" */
  badge?: string
  /** Stagger delay index */
  delay?: number
  className?: string
}

export function BentoStatCard({
  value,
  label,
  icon,
  hero = false,
  unit,
  description,
  badge,
  delay = 0,
  className,
}: BentoStatCardProps) {
  const rm = useReducedMotion()
  const isNum = typeof value === 'number'
  const display = useCountUp(isNum ? value : 0, 1200, isNum && !rm)

  const formatted = isNum
    ? (value > 0 ? display.toLocaleString() : '0')
    : value

  return (
    <motion.div
      initial={rm ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        rm
          ? { duration: 0 }
          : { duration: 0.45, delay: 0.08 + delay * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }
      }
      className={cn(
        'relative overflow-hidden rounded-3xl bg-neutral-50 shadow-sm',
        hero ? 'p-5 sm:p-6' : 'p-4 sm:p-5',
        className,
      )}
      aria-label={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
    >
      {/* Top row: icon badge + optional comparison badge */}
      <div className="flex items-start justify-between mb-3">
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-xl',
            'bg-neutral-100 text-neutral-700',
            hero ? 'w-12 h-12' : 'w-10 h-10',
          )}
          aria-hidden="true"
        >
          <span className={hero ? '[&>svg]:w-6 [&>svg]:h-6' : '[&>svg]:w-5 [&>svg]:h-5'}>
            {icon}
          </span>
        </span>

        {badge && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 text-[10px] font-bold uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>

      {/* Value */}
      <p
        className={cn(
          'font-heading font-extrabold tabular-nums leading-none tracking-tight text-neutral-900',
          hero ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl',
        )}
      >
        {formatted}
        {unit && (
          <span className="text-base font-bold ml-1 text-neutral-500">
            {unit}
          </span>
        )}
      </p>

      {/* Label */}
      <p
        className={cn(
          'font-semibold uppercase tracking-wider mt-1.5 text-neutral-600',
          hero ? 'text-xs' : 'text-[10px]',
        )}
      >
        {label}
      </p>

      {/* Description - hero cards only */}
      {hero && description && (
        <p className="mt-3 text-[13px] leading-relaxed text-neutral-500 max-w-[280px]">
          {description}
        </p>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  BentoStatGrid                                                      */
/*                                                                     */
/*  Bento layout matching the design mockup:                           */
/*  - Hero card spans full width                                       */
/*  - Remaining cards in a 2-col grid with some spanning 2 cols        */
/* ------------------------------------------------------------------ */

/**
 * Bento layout patterns for different item counts.
 * Each entry is [smColSpan, mobColSpan, isHero].
 * Grid is 4 columns on sm+, 2 columns on mobile.
 *
 * INVARIANT: mob col spans must sum to a multiple of 2.
 *            sm col spans must sum to a multiple of 4.
 */
const BENTO_LAYOUTS: Record<number, Array<[sm_col: number, mob_col: number, hero: boolean]>> = {
  1: [[4, 2, true]],
  2: [[2, 2, true], [2, 2, false]],
  3: [[2, 2, true], [1, 1, false], [1, 1, false]],
  4: [[2, 2, true], [2, 2, false], [2, 1, false], [2, 1, false]],
  5: [[2, 2, true], [2, 1, false], [2, 1, false], [1, 1, false], [1, 1, false]],
  // 6 items: hero full-width, then 2 side-by-side, then large card, then 2 small side-by-side, then large card
  6: [[4, 2, true], [2, 1, false], [2, 1, false], [4, 2, false], [2, 1, false], [2, 1, false]],
  7: [[4, 2, true], [2, 1, false], [2, 1, false], [4, 2, false], [2, 1, false], [2, 1, false], [4, 2, false]],
  8: [[4, 2, true], [2, 1, false], [2, 1, false], [4, 2, false], [2, 1, false], [2, 1, false], [2, 1, false], [2, 1, false]],
  9: [[4, 2, true], [2, 1, false], [2, 1, false], [4, 2, false], [2, 1, false], [2, 1, false], [2, 1, false], [2, 1, false], [4, 2, false]],
}

function getLayout(count: number): Array<[number, number, boolean]> {
  if (count <= 0) return []
  if (BENTO_LAYOUTS[count]) return BENTO_LAYOUTS[count]!

  const remaining = count - 1
  const base: Array<[number, number, boolean]> = [[4, 2, true]]

  let mobSum = 2
  let smSum = 4

  for (let i = 0; i < remaining; i++) {
    base.push([2, 1, false])
    mobSum += 1
    smSum += 2
  }

  if (mobSum % 2 !== 0) {
    base[base.length - 1]![1] = 2
  }

  // Fix sm: need smSum % 4 === 0
  const smRemainder = smSum % 4
  if (smRemainder !== 0) {
    const needed = 4 - smRemainder
    let expanded = 0
    for (let i = 1; i < base.length && expanded < needed; i++) {
      if (base[i]![0] === 2) {
        base[i]![0] = 4
        expanded++
      }
    }
  }

  return base
}

const smColClasses: Record<number, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
}

const mobColClasses: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
}

export interface BentoStatGridProps {
  children: ReactNode
  className?: string
  /** Animate into view when scrolled into viewport */
  animateInView?: boolean
}

export function BentoStatGrid({
  children,
  className,
  animateInView = false,
}: BentoStatGridProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const shouldAnimate = !animateInView || inView

  const items = Children.toArray(children).filter(isValidElement)
  const layout = getLayout(items.length)

  return (
    <motion.div
      ref={ref}
      layout
      className={cn(
        'grid grid-cols-2 sm:grid-cols-4 gap-3',
        className,
      )}
    >
      {items.map((child, i) => {
        const [smCol, mobCol, isHero] = layout[i] ?? [1, 1, false]

        return (
          <motion.div
            key={i}
            layout
            className={cn(
              mobColClasses[mobCol],
              smColClasses[smCol],
            )}
          >
            {isValidElement<BentoStatCardProps>(child)
              ? cloneElement(child, {
                  hero: child.props.hero ?? isHero,
                  delay: child.props.delay ?? i,
                } as Partial<BentoStatCardProps>)
              : child}
          </motion.div>
        )
      })}
    </motion.div>
  )
}

// Legacy theme exports moved to ./bento-stats-themes (bentoBoldTheme,
// bentoMixedTheme, BentoTheme) so this file only exports components,
// satisfying react-refresh/only-export-components.
