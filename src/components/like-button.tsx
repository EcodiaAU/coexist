import { useState, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface LikeButtonProps {
  liked: boolean
  count?: number
  onToggle: (liked: boolean) => void
  className?: string
}

/** Single particle for the leaf burst */
function LeafParticle({ index, total }: { index: number; total: number }) {
  const angle = (index / total) * 360
  const rad = (angle * Math.PI) / 180
  const [distance] = useState(() => 18 + Math.random() * 8)

  return (
    <motion.span
      className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-primary-500"
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{
        x: Math.cos(rad) * distance,
        y: Math.sin(rad) * distance,
        scale: 0,
        opacity: 0,
      }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      aria-hidden="true"
    />
  )
}

/**
 * Like button with leaf burst animation.
 * §55.3.7: Leaf icon scales up 1.3x, fills with colour,
 * pops back to 1x, small particles emit outward.
 */
export function LikeButton({
  liked,
  count,
  onToggle,
  className,
}: LikeButtonProps) {
  const shouldReduceMotion = useReducedMotion()
  const [bursting, setBursting] = useState(false)

  const handleClick = useCallback(() => {
    const newLiked = !liked
    onToggle(newLiked)
    if (newLiked && !shouldReduceMotion) {
      setBursting(true)
      setTimeout(() => setBursting(false), 600)
    }
  }, [liked, onToggle, shouldReduceMotion])

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'relative inline-flex items-center justify-center gap-1.5 p-2 rounded-sm',
        'min-h-11 min-w-11',
        'cursor-pointer select-none',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        liked ? 'text-primary-400' : 'text-neutral-400',
        className,
      )}
      aria-label={liked ? 'Unlike' : 'Like'}
      aria-pressed={liked}
    >
      {/* Leaf icon */}
      <motion.svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={
          shouldReduceMotion
            ? {}
            : liked
              ? { scale: [1, 1.25, 0.95, 1] }
              : { scale: 1 }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 400, damping: 14, mass: 0.6 }
        }
        aria-hidden="true"
      >
        <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 1 8-2 7-8 10-9 10Z" />
        <path d="M10.7 20C7.4 16 5.8 11.8 7.3 7.4" />
      </motion.svg>

      {/* Particle burst */}
      <AnimatePresence>
        {bursting && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {Array.from({ length: 8 }, (_, i) => (
              <LeafParticle key={i} index={i} total={8} />
            ))}
          </span>
        )}
      </AnimatePresence>

      {/* Count */}
      {count != null && (
        <span className="text-sm font-medium tabular-nums">{count}</span>
      )}
    </button>
  )
}
