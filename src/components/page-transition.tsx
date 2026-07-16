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
 * DEPRECATED (2026-06-22): route transitions are now owned by AnimatedOutlet
 * (src/components/animated-outlet.tsx), which scopes the AnimatePresence +
 * keyed motion.div to the <Outlet/> INSIDE each persistent layout shell. The
 * old pattern keyed the whole <Routes> by pathname and remounted the layout
 * shells on every nav, resetting the sidebar scroll to 0. This component has no
 * live callers; kept only for the barrel re-export. New routes do not wrap
 * pages in PageTransition.
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
      <Suspense data-eos-id="src/components/page-transition.tsx#0" fallback={<div data-eos-id="src/components/page-transition.tsx#1" className="flex-1 min-h-0 bg-surface-1" />}>
        <div data-eos-id="src/components/page-transition.tsx#2" key={location.pathname} className="flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </Suspense>
    )
  }

  return (
    <Suspense data-eos-id="src/components/page-transition.tsx#3" fallback={<div data-eos-id="src/components/page-transition.tsx#4" className="flex-1 min-h-0 bg-surface-1" />}>
      <motion.div data-eos-id="src/components/page-transition.tsx#5"
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
