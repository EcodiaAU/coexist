import { Suspense } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

import { MOTION } from '@/lib/motion'

/**
 * Animated route outlet for persistent layout shells.
 *
 * Replaces the old "AnimatePresence wrapped around the whole <Routes> with
 * key={location.pathname}" pattern. That keyed-<Routes> approach tore down and
 * rebuilt the ENTIRE route subtree on every navigation, which remounted the
 * layout-route shells (AppShell / AdminLayout / LeaderLayout) and reset the
 * sidebar's internal scroll position to 0 on every nav (2026-06-22 bug).
 *
 * Here the AnimatePresence + keyed motion.div live INSIDE each layout shell,
 * scoped to the <Outlet/> only. React Router reconciles the shells by type and
 * keeps them mounted across navigation, so the sidebar scroll container is
 * preserved. Only the page content fades.
 *
 * useOutlet() snapshot subtlety: useOutlet() returns the outlet element for the
 * CURRENT location, and the Outlet swaps its content the instant the route
 * changes. AnimatePresence (mode="wait") holds the PREVIOUS render's keyed
 * motion.div for the exit phase; the snapshot it holds already contains the old
 * outlet element from that previous render, so the exiting page shows old
 * content while the new keyed motion.div waits to enter. We key the motion.div
 * by pathname so AnimatePresence treats each navigation as unmount + mount.
 */
export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduce = useReducedMotion()

  if (reduce) {
    return (
      <Suspense data-eos-id="src/components/animated-outlet.tsx#0" data-eos-v="2" fallback={<div data-eos-id="src/components/animated-outlet.tsx#1" className="flex-1 min-h-0 bg-surface-1" />}>
        <div data-eos-id="src/components/animated-outlet.tsx#2" key={location.pathname} className="flex-1 flex flex-col min-h-0">
          {outlet}
        </div>
      </Suspense>
    )
  }

  return (
    <AnimatePresence data-eos-id="src/components/animated-outlet.tsx#3" mode="wait" initial={false}>
      <motion.div data-eos-id="src/components/animated-outlet.tsx#4"
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={MOTION.routeTransition}
        className="flex-1 flex flex-col min-h-0"
      >
        <Suspense data-eos-id="src/components/animated-outlet.tsx#5" fallback={<div data-eos-id="src/components/animated-outlet.tsx#6" className="flex-1 min-h-0 bg-surface-1" />}>
          {outlet}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}
