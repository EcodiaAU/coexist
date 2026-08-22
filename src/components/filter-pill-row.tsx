import { type ReactNode } from 'react'
import { Chip } from '@/components/chip'
import { cn } from '@/lib/cn'

export interface FilterOption<T extends string = string> {
  id: T
  label: string
  icon?: ReactNode
}

interface FilterPillRowProps<T extends string = string> {
  options: FilterOption<T>[]
  value: T
  onChange: (id: T) => void
  'aria-label': string
  /** Extra classes on the outer wrapper (e.g. negative margins for a mobile edge-bleed). */
  className?: string
}

/**
 * The single filter-pill control for a variable-length option set (admin status
 * filters, category filters). A horizontal-scroll row of auto-width Chips.
 *
 * WHY THIS EXISTS: a flex-1 SegmentedControl (equal-width sliding pill) is only
 * right for 2-3 SHORT equal options (a view/mode toggle). For filters with more
 * or longer labels it crushes the labels together and the sliding pill misaligns.
 * Auto-width pills never bunch and scroll when they exceed the width.
 *
 * The `py-2` on the scroll track is load-bearing: overflow-x-auto also clips the
 * vertical axis, so the selected Chip's `ring-2` would be cut at the top/bottom
 * without it.
 */
export function FilterPillRow<T extends string = string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: FilterPillRowProps<T>) {
  return (
    <div className={cn('relative', className)}>
      <div
        className="flex items-center gap-2 overflow-x-auto scrollbar-none py-2 px-0.5"
        role="listbox"
        aria-label={ariaLabel}
      >
        {options.map((o) => (
          <Chip
            key={o.id}
            label={o.label}
            icon={o.icon}
            selected={value === o.id}
            onSelect={() => onChange(o.id)}
            className="shrink-0"
          />
        ))}
      </div>
    </div>
  )
}
