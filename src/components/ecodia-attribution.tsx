import { cn } from '@/lib/cn'

interface EcodiaAttributionProps {
  className?: string
}

/**
 * Ecodia attribution mark. "the world we build next" -> ecodia.au.
 * EB Garamond italic signature, lowercase, opacity-recede. Inherits the
 * surrounding text colour, so it works on light and dark footers with no
 * colour prop. The phrase always renders whole, never abbreviated.
 * Canonical spec: patterns/ecodia-attribution-mark-the-world-we-build-next-2026-06-23.md
 */
export function EcodiaAttribution({ className }: EcodiaAttributionProps) {
  return (
    <a
      href="https://ecodia.au"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="the world we build next"
      style={{ fontFamily: "'EB Garamond', Georgia, 'Times New Roman', serif" }}
      className={cn(
        'inline-block italic text-[15px] leading-none no-underline opacity-60 transition-opacity duration-200 hover:opacity-90',
        className,
      )}
    >
      the world we build next
    </a>
  )
}
