import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

type MapPinVariant = 'default' | 'event' | 'collective'

interface MapPinProps {
  variant?: MapPinVariant
  active?: boolean
  icon?: ReactNode
  color?: string
  className?: string
  'aria-label'?: string
}

const variantColors: Record<MapPinVariant, string> = {
  default: 'var(--color-primary-600, #4a7c59)',
  event: 'var(--color-accent-600, #e67e22)',
  collective: 'var(--color-secondary-600, #8b6f47)',
}

export function MapPin({
  variant = 'default',
  active = false,
  icon,
  color,
  className,
  'aria-label': ariaLabel = 'Map pin',
}: MapPinProps) {
  const shouldReduceMotion = useReducedMotion()
  const fillColor = color ?? variantColors[variant]

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('relative inline-flex items-center justify-center', className)}
    >
      {/* Pulse ring for active state */}
      {active && !shouldReduceMotion && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 48,
            height: 48,
            backgroundColor: fillColor,
          }}
          initial={{ opacity: 0.4, scale: 1 }}
          animate={{ opacity: 0, scale: 2 }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          aria-hidden="true"
        />
      )}

      {/* Active static ring (reduced motion fallback) */}
      {active && shouldReduceMotion && (
        <div
          className="absolute rounded-full opacity-20"
          style={{
            width: 56,
            height: 56,
            backgroundColor: fillColor,
          }}
          aria-hidden="true"
        />
      )}

      {/* Pin SVG */}
      <svg
        width="36"
        height="46"
        viewBox="0 0 36 46"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative drop-shadow-sm"
        aria-hidden="true"
      >
        {/* Pin body */}
        <path
          d="M18 0C8.06 0 0 8.06 0 18c0 12.6 16.2 26.4 17.1 27.15a1.5 1.5 0 0 0 1.8 0C19.8 44.4 36 30.6 36 18 36 8.06 27.94 0 18 0Z"
          fill={fillColor}
        />

        {/* Inner circle background */}
        <circle cx="18" cy="17" r="10" fill="white" fillOpacity="0.9" />
      </svg>

      {/* Icon inside circle */}
      {icon && (
        <div
          className="absolute flex items-center justify-center"
          style={{ top: 8, width: 20, height: 20 }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      {/* Default dot if no icon */}
      {!icon && (
        <div
          className="absolute rounded-full"
          style={{
            top: 13,
            width: 8,
            height: 8,
            backgroundColor: fillColor,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
