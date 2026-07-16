import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * FitText - render text on a single line, shrinking the font to fit the
 * available width instead of truncating with an ellipsis.
 *
 * Origin: Tate 2026-06-08. Attendee names must show First + Last in full so
 * leaders can tell apart people with the same first name; long names shrink,
 * they are never cut off.
 *
 * The parent must have a bounded width (it measures parent.clientWidth). Font
 * size scales between `min` and `max` px. Recomputes on text or container
 * resize via ResizeObserver.
 */
export function FitText({
  children,
  max = 15,
  min = 9,
  className,
  title,
}: {
  children: string
  max?: number
  min?: number
  className?: string
  /** Tooltip override; defaults to the text itself. */
  title?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState(max)

  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) return

    const fit = () => {
      // Measure at max, then scale down by the overflow ratio in one pass.
      el.style.fontSize = `${max}px`
      const avail = parent.clientWidth
      const needed = el.scrollWidth
      if (avail > 0 && needed > avail) {
        const scaled = Math.max(min, Math.floor(max * (avail / needed) * 10) / 10)
        setSize(scaled)
        el.style.fontSize = `${scaled}px`
      } else {
        setSize(max)
      }
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [children, max, min])

  return (
    <span data-eos-id="src/components/fit-text.tsx#0" data-eos-v="2"
      ref={ref}
      title={title ?? children}
      className={cn('inline-block max-w-full whitespace-nowrap align-bottom', className)}
      style={{ fontSize: `${size}px` }}
    >
      {children}
    </span>
  )
}
