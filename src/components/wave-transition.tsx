import { cn } from '@/lib/cn'
import { WAVE_PATHS, WAVE_PATHS_TALL, WAVE_PATHS_SMALL } from './wave-paths'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type WaveSize = 'sm' | 'md' | 'lg'

const SIZE_CONFIG: Record<WaveSize, { viewBox: string; className: string }> = {
  sm:  { viewBox: '0 0 1440 40',  className: 'w-full h-5 block' },
  md:  { viewBox: '0 0 1440 70',  className: 'w-full h-7 sm:h-10 block' },
  lg:  { viewBox: '0 0 1440 200', className: 'w-full h-20 sm:h-28 block' },
}

interface WaveTransitionProps {
  /** Wave path index (into WAVE_PATHS / WAVE_PATHS_TALL / WAVE_PATHS_SMALL). Default 0. */
  wave?: number
  /** Size preset – controls viewBox and rendered height. Default 'md'. */
  size?: WaveSize
  /** Tailwind fill class for the wave shape. Default 'fill-white'. */
  fill?: string
  /** Extra classes on the wrapper div. */
  className?: string
  /** Position style. Default 'bottom' = absolute bottom-0. 'inline' = relative block flow. */
  position?: 'bottom' | 'inline'
}

export function WaveTransition({
  wave = 0,
  size = 'md',
  fill = 'fill-white',
  className,
  position = 'bottom',
}: WaveTransitionProps) {
  const paths = size === 'lg' ? WAVE_PATHS_TALL : size === 'sm' ? WAVE_PATHS_SMALL : WAVE_PATHS
  const path = paths[wave % paths.length]
  const cfg = SIZE_CONFIG[size]

  return (
    <div
      className={cn(
        position === 'bottom'
          ? 'absolute bottom-0 left-0 right-0 z-20'
          : 'relative z-20',
        className,
      )}
    >
      <svg
        viewBox={cfg.viewBox}
        preserveAspectRatio="none"
        className={cfg.className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={path} className={fill} />
      </svg>
    </div>
  )
}
