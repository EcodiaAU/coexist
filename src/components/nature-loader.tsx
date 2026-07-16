import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

type LoaderVariant = 'seedling' | 'bird' | 'leaf'

interface NatureLoaderProps {
  variant?: LoaderVariant
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

const sizeMap = {
  sm: { container: 'w-12 h-12', svg: 24 },
  md: { container: 'w-16 h-16', svg: 36 },
  lg: { container: 'w-24 h-24', svg: 48 },
}

function SeedlingAnimation({ size }: { size: number }) {
  return (
    <svg data-eos-id="src/components/nature-loader.tsx#0"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      {/* Soil */}
      <motion.ellipse data-eos-id="src/components/nature-loader.tsx#1"
        cx="24"
        cy="42"
        rx="14"
        ry="3"
        fill="var(--color-secondary-300)"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.4 }}
      />
      {/* Stem */}
      <motion.path data-eos-id="src/components/nature-loader.tsx#2"
        d="M24 40 L24 24"
        stroke="var(--color-primary-600)"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      />
      {/* Left leaf */}
      <motion.path data-eos-id="src/components/nature-loader.tsx#3"
        d="M24 30 C20 28 16 24 18 20 C22 22 24 26 24 30Z"
        fill="var(--color-primary-500)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      />
      {/* Right leaf */}
      <motion.path data-eos-id="src/components/nature-loader.tsx#4"
        d="M24 26 C28 24 32 20 30 16 C26 18 24 22 24 26Z"
        fill="var(--color-primary-400)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.8 }}
      />
    </svg>
  )
}

function BirdAnimation({ size }: { size: number }) {
  return (
    <motion.svg data-eos-id="src/components/nature-loader.tsx#5"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      animate={{ x: [0, 4, 0, -4, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Bird body */}
      <motion.path data-eos-id="src/components/nature-loader.tsx#6"
        d="M8 28 Q16 16 24 24 Q32 16 40 28"
        stroke="var(--color-primary-600)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        animate={{
          d: [
            'M8 28 Q16 16 24 24 Q32 16 40 28',
            'M8 24 Q16 20 24 24 Q32 20 40 24',
            'M8 28 Q16 16 24 24 Q32 16 40 28',
          ],
        }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.svg>
  )
}

function LeafAnimation({ size }: { size: number }) {
  return (
    <motion.svg data-eos-id="src/components/nature-loader.tsx#7"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      animate={{ rotate: 360 }}
      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
    >
      <motion.path data-eos-id="src/components/nature-loader.tsx#8"
        d="M24 4 C24 4 8 16 8 28 C8 36.8 15.2 44 24 44 C32.8 44 40 36.8 40 28 C40 16 24 4 24 4Z"
        fill="var(--color-primary-400)"
        fillOpacity="0.7"
      />
      <path data-eos-id="src/components/nature-loader.tsx#9"
        d="M24 12 L24 36 M24 20 L18 16 M24 26 L30 22 M24 32 L18 28"
        stroke="var(--color-primary-700)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </motion.svg>
  )
}

/**
 * Nature-themed loading indicators.
 * §53 item 45: growing seedling, bird flying.
 */
export function NatureLoader({
  variant = 'seedling',
  size = 'md',
  label = 'Loading...',
  className,
}: NatureLoaderProps) {
  const shouldReduceMotion = useReducedMotion()
  const s = sizeMap[size]

  if (shouldReduceMotion) {
    return (
      <div data-eos-id="src/components/nature-loader.tsx#10"
        className={cn('flex flex-col items-center gap-2', className)}
        role="status"
        aria-label={label}
      >
        <div data-eos-id="src/components/nature-loader.tsx#11" className={cn(s.container, 'rounded-full bg-primary-100')} />
        <span data-eos-id="src/components/nature-loader.tsx#12" className="text-sm text-neutral-500">{label}</span>
        <span data-eos-id="src/components/nature-loader.tsx#13" className="sr-only">{label}</span>
      </div>
    )
  }

  const Loader = {
    seedling: SeedlingAnimation,
    bird: BirdAnimation,
    leaf: LeafAnimation,
  }[variant]

  return (
    <div data-eos-id="src/components/nature-loader.tsx#14"
      className={cn('flex flex-col items-center gap-3', className)}
      role="status"
      aria-label={label}
    >
      <div data-eos-id="src/components/nature-loader.tsx#15" className={cn(s.container, 'flex items-center justify-center')}>
        <Loader data-eos-id="src/components/nature-loader.tsx#16" size={s.svg} />
      </div>
      <motion.span data-eos-id="src/components/nature-loader.tsx#17"
        className="text-sm text-neutral-500 font-medium"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {label}
      </motion.span>
      <span data-eos-id="src/components/nature-loader.tsx#18" className="sr-only">{label}</span>
    </div>
  )
}
