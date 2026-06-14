import type { Transition } from 'framer-motion'

/**
 * Single source of truth for animation timing. Ported from the Chambers
 * app (src/lib/motion.ts) so the route-transition feel matches across
 * Ecodia mobile surfaces: fire-and-forget, iOS-push curve, no live drag.
 */
export const MOTION = {
  /** Route entry/exit. iOS push timing. */
  routeTransition: {
    duration: 0.28,
    ease: [0.32, 0.72, 0, 1] as const,
  } satisfies Transition,
} as const
