import { ECODIA_CODE_URL } from '@/lib/constants'
import { cn } from '@/lib/cn'

interface EcodiaAttributionProps {
  className?: string
}

/**
 * Small "Built by Ecodia Code" attribution link.
 * Binary black/white pill  each half inverts independently on hover.
 * Matches the web footer design at a smaller scale.
 */
export function EcodiaAttribution({ className }: EcodiaAttributionProps) {
  return (
    <a
      href={ECODIA_CODE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5',
        className,
      )}
    >
      <span className="text-[10px] text-neutral-400">
        Built by
      </span>
      <span className="inline-flex">
        <span className="bg-white text-black p-2 text-[10px] font-semibold leading-none transition-colors duration-150 hover:bg-black hover:text-white">
          Ecodia
        </span>
        <span className="bg-black text-white p-2 text-[10px] font-semibold leading-none transition-colors duration-150 hover:bg-white hover:text-black">
          Code
        </span>
      </span>
    </a>
  )
}
