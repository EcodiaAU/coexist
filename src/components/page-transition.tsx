import { type ReactNode, Suspense } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useLocation } from 'react-router-dom'

import { MOTION } from '@/lib/motion'

interface PageTransitionProps {
  children: ReactNode
}

/**
 * Page transition wrapper. Fade-up enter, fade-down exit; iOS-push curve.
 * Fire-and-forget - no live drag, no parallax, no spring snap. Matches the
 * Chambers app's PageFrame shape (src/App.tsx PageFrame) so the two
 * Ecodia mobile surfaces share one motion language.
 *
 * Pairs with the AnimatePresence wrapper around <Routes> in App.tsx, which
 * holds the outgoing route subtree until this motion.div's exit completes,
 * then mounts the new one.
 *
 * Also provides a local Suspense boundary so lazy-loaded pages suspend
 * inside the shell rather than bubbling to the root Suspense and
 * unmounting the sidebar + tabs.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const reduce = useReducedMotion()

  if (reduce) {
    return (
      <Suspense fallback={<div className="flex-1 min-h-0 bg-surface-1" />}>
        <div key={location.pathname} className="flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="flex-1 min-h-0 bg-surface-1" />}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={MOTION.routeTransition}
        className="flex-1 flex flex-col min-h-0"
      >
        {children}
      </motion.div>
    </Suspense>
  )
}
