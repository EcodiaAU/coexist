/**
 * Shared animation variants + helpers - used app-wide.
 *
 * Goals:
 * - GPU-composited only (transform + opacity) - no layout-triggering properties
 * - Silky 60 fps with short, optimistic durations
 * - Respect prefers-reduced-motion via `useReducedMotion`
 * - Single source of truth so every page animates consistently
 */

import type { Variants, Transition } from 'framer-motion'

/* ------------------------------------------------------------------ */
/*  Reusable variant factories                                         */
/* ------------------------------------------------------------------ */

/** Container stagger - use on the outer wrapper, pairs with `fadeUp`. */
export const stagger = (gap = 0.04): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: gap } },
})

/** Default admin stagger (0.04 s between children). */
export const adminStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

/**
 * Fade-up child variant.
 * Uses `translate3d` via framer-motion's `y` - stays on the compositor.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

/** Fade-only variant (no translate). Lighter for overlays / tab switches. */
export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
}

/* ------------------------------------------------------------------ */
/*  Optimistic spring for drawers / slide panels                       */
/* ------------------------------------------------------------------ */

export const drawerSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 36,
  mass: 0.8,
}

/* ------------------------------------------------------------------ */
/*  Expand / collapse (height: 'auto') helper                          */
/*                                                                     */
/*  Framer-Motion animates `height: auto` via JS measurement which     */
/*  triggers layout.  Keep durations ultra-short and pair with         */
/*  `overflow: hidden` on the container.                               */
/* ------------------------------------------------------------------ */

export const expandCollapse: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: {
      height: { type: 'spring', stiffness: 200, damping: 24, mass: 0.6 },
      opacity: { duration: 0.25, ease: [0.0, 0.0, 0.2, 1], delay: 0.04 },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      height: { type: 'spring', stiffness: 280, damping: 26, mass: 0.5 },
      opacity: { duration: 0.15, ease: [0.4, 0, 1, 1] },
    },
  },
}

/* ------------------------------------------------------------------ */
/*  Tab-switch cross-fade (AnimatePresence mode="wait")                */
/* ------------------------------------------------------------------ */

export const tabFade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.15 } as Transition,
}

/* ------------------------------------------------------------------ */
/*  Reduced-motion helpers                                             */
/* ------------------------------------------------------------------ */

/** Wrap a variant so it becomes an instant jump when motion is reduced. */
export function rmSafe<T extends Variants>(v: T, reduced: boolean): T | undefined {
  return reduced ? undefined : v
}

/**
 * Returns stagger + fadeUp paired correctly for reduced-motion.
 * Usage:
 *   const { stagger, fadeUp } = motionVariants(shouldReduceMotion)
 *   <motion.div variants={stagger} initial="hidden" animate="visible">
 *     <motion.div variants={fadeUp}>…</motion.div>
 *   </motion.div>
 */
export function motionVariants(reducedMotion: boolean) {
  return {
    stagger: reducedMotion ? undefined : adminStagger,
    fadeUp: reducedMotion ? undefined : fadeUp,
    fadeOnly: reducedMotion ? undefined : fadeOnly,
    expandCollapse: reducedMotion ? undefined : expandCollapse,
  } as const
}

/** @deprecated Use `motionVariants` instead. */
export const adminVariants = motionVariants
