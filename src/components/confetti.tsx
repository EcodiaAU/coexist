import { useEffect, useState, useMemo, startTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ConfettiProps {
  active: boolean
  /** Duration in ms before auto-clearing */
  duration?: number
  /** Number of particles */
  count?: number
  className?: string
}

interface Particle {
  id: number
  x: number
  scale: number
  color: string
  shape: 'circle' | 'rect' | 'leaf'
  delay: number
  animDuration: number
  rotate: number
}

const COLORS = [
  'var(--color-primary-400)',
  'var(--color-primary-600)',
  'var(--color-secondary-400)',
  'var(--color-accent-400)',
  'var(--color-accent-500)',
  'var(--color-success)',
]

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function createParticles(count: number): Particle[] {
  const shapes: Particle['shape'][] = ['circle', 'rect', 'leaf']
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: randomBetween(10, 90),
    scale: randomBetween(0.5, 1.2),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    delay: randomBetween(0, 0.3),
    animDuration: randomBetween(1.5, 2.5),
    rotate: randomBetween(180, 720),
  }))
}

function ParticleShape({ shape, color }: { shape: Particle['shape']; color: string }) {
  if (shape === 'circle') {
    return (
      <div data-eos-id="src/components/confetti.tsx#0" data-eos-v="2"
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    )
  }
  if (shape === 'rect') {
    return (
      <div data-eos-id="src/components/confetti.tsx#1"
        className="w-3 h-1.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
    )
  }
  // Leaf shape
  return (
    <svg data-eos-id="src/components/confetti.tsx#2" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path data-eos-id="src/components/confetti.tsx#3"
        d="M6 0C6 0 0 4 0 8c0 2.2 2.7 4 6 4s6-1.8 6-4c0-4-6-8-6-8z"
        fill={color}
      />
    </svg>
  )
}

export function Confetti({
  active,
  duration = 2500,
  count = 40,
  className,
}: ConfettiProps) {
  const shouldReduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(false)

  // Memoize particles so they're stable for the animation lifetime
  const particles = useMemo(
    () => (visible ? createParticles(count) : []),
    [visible, count],
  )

  useEffect(() => {
    if (active && !shouldReduceMotion) {
      startTransition(() => setVisible(true))
      const timer = setTimeout(() => startTransition(() => setVisible(false)), duration)
      return () => clearTimeout(timer)
    }
    if (active && shouldReduceMotion) {
      // Show a brief flash for reduced motion
      startTransition(() => setVisible(true))
      const timer = setTimeout(() => startTransition(() => setVisible(false)), 500)
      return () => clearTimeout(timer)
    }
  }, [active, count, duration, shouldReduceMotion])

  if (shouldReduceMotion && visible) {
    return (
      <div data-eos-id="src/components/confetti.tsx#4"
        className={cn(
          'fixed inset-0 z-[200] pointer-events-none flex items-center justify-center',
          className,
        )}
        aria-hidden="true"
      >
        <motion.div data-eos-id="src/components/confetti.tsx#5"
          className="w-16 h-16 rounded-full bg-primary-400/30"
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
      </div>
    )
  }

  return (
    <AnimatePresence data-eos-id="src/components/confetti.tsx#6">
      {visible && (
        <div data-eos-id="src/components/confetti.tsx#7"
          className={cn('particle-layer', className)}
          aria-hidden="true"
        >
          {particles.map((p) => (
            <div data-eos-id="src/components/confetti.tsx#8"
              key={p.id}
              className="css-particle"
              style={{
                left: `${p.x}%`,
                top: '0%',
                animationName: 'confetti-fall',
                animationDuration: `${p.animDuration}s`,
                animationDelay: `${p.delay}s`,
                '--particle-scale': p.scale,
                '--particle-rotate': `${p.rotate}deg`,
              } as React.CSSProperties}
            >
              <ParticleShape data-eos-id="src/components/confetti.tsx#9" shape={p.shape} color={p.color} />
            </div>
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}
