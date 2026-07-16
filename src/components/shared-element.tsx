import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

interface SharedElementProps {
  /** Unique ID shared between source and target elements */
  layoutId: string
  children: ReactNode
  className?: string
  /** Element type to render */
  as?: 'div' | 'img' | 'span'
  /** Click handler (typically navigation) */
  onClick?: () => void
  style?: React.CSSProperties
}

/**
 * Shared element transition wrapper using Framer Motion layoutId.
 * §55.1.1–55.1.4: Event card→detail, avatar→profile, badge→detail.
 *
 * Usage:
 * - Wrap the SOURCE element (e.g. event card image) and the TARGET element
 *   (e.g. event detail hero) with the same `layoutId`.
 * - Framer Motion's `LayoutGroup` should wrap the router outlet.
 *
 * Example:
 *   // In event card:
 *   <SharedElement layoutId={`event-image-${event.id}`}>
 *     <img src={event.coverUrl} ... />
 *   </SharedElement>
 *
 *   // In event detail page:
 *   <SharedElement layoutId={`event-image-${event.id}`}>
 *     <img src={event.coverUrl} ... />
 *   </SharedElement>
 */
export function SharedElement({
  layoutId,
  children,
  className,
  as = 'div',
  onClick,
  style,
}: SharedElementProps) {
  const shouldReduceMotion = useReducedMotion()

  const Component = motion[as] as typeof motion.div

  return (
    <Component data-eos-id="src/components/shared-element.tsx#0" data-eos-v="2"
      layoutId={shouldReduceMotion ? undefined : layoutId}
      className={className}
      onClick={onClick}
      style={style}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 280, damping: 30, mass: 0.8 }
      }
      whileTap={onClick && !shouldReduceMotion ? { scale: 0.98 } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </Component>
  )
}
