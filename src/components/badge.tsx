import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Activity-type variants                                             */
/* ------------------------------------------------------------------ */

// Single Co-Exist green for every event type (2026-06-08): per-type colour
// theming removed. The activity label (not colour) distinguishes types now.
const activityStyles = {
  'clean-up': 'bg-primary-100 text-primary-800',
  'tree-planting': 'bg-primary-100 text-primary-800',
  'ecosystem-restoration': 'bg-primary-100 text-primary-800',
  'nature-hike': 'bg-primary-100 text-primary-800',
  'camp-out': 'bg-primary-100 text-primary-800',
  spotlighting: 'bg-primary-100 text-primary-800',
  other: 'bg-primary-100 text-primary-800',
  // Legacy DB enum slugs still present on real event rows. Rendered with
  // the same single Co-Exist green per the 2026-06-08 mono-colour decision.
  'shore-cleanup': 'bg-primary-100 text-primary-800',
  'nature-walk': 'bg-primary-100 text-primary-800',
  'land-regeneration': 'bg-primary-100 text-primary-800',
  workshop: 'bg-primary-100 text-primary-800',
  retreat: 'bg-primary-100 text-primary-800',
  'marine-restoration': 'bg-primary-100 text-primary-800',
} as const

/* ------------------------------------------------------------------ */
/*  Tier variants                                                      */
/* ------------------------------------------------------------------ */

const tierStyles = {
  new: 'bg-success-100 text-success-800',
  active: 'bg-primary-100 text-primary-800',
  committed: 'bg-moss-100 text-moss-800',
  dedicated: 'bg-secondary-100 text-secondary-800',
  lifetime: 'bg-bark-100 text-bark-900',
} as const

type ActivityVariant = keyof typeof activityStyles
type TierVariant = keyof typeof tierStyles

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type BadgeVariantProps =
  | { variant: 'activity'; activity: ActivityVariant; tier?: never }
  | { variant: 'tier'; tier: TierVariant; activity?: never }
  | { variant: 'default'; activity?: never; tier?: never }
  | { variant: 'success'; activity?: never; tier?: never }

interface BadgeBaseProps {
  size?: 'sm' | 'md'
  icon?: ReactNode
  children: ReactNode
  className?: string
  'aria-label'?: string
}

type BadgeProps = BadgeBaseProps & BadgeVariantProps

/* ------------------------------------------------------------------ */
/*  Size styles                                                        */
/* ------------------------------------------------------------------ */

const sizeStyles = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-3 py-1 text-caption',
} as const

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Badge({
  variant,
  activity,
  tier,
  size = 'md',
  icon,
  children,
  className,
  'aria-label': ariaLabel,
}: BadgeProps) {
  const colorClass =
    variant === 'activity'
      ? activityStyles[activity]
      : variant === 'tier'
        ? tierStyles[tier]
        : variant === 'success'
          ? 'bg-success-100 text-success-800'
          : 'bg-primary-100 text-primary-700'

  return (
    <span data-eos-id="src/components/badge.tsx#0"
      role="status"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-full font-semibold leading-none whitespace-nowrap select-none',
        sizeStyles[size],
        colorClass,
        className,
      )}
    >
      {icon && (
        <span data-eos-id="src/components/badge.tsx#1" className="flex items-center justify-center shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  )
}
