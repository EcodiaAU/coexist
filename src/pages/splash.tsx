import { useState, useEffect, startTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { APP_NAME } from '@/lib/constants'
import { useAuth } from '@/hooks/use-auth'

interface SplashProps {
  /** Called when splash is done and app is ready */
  onReady: () => void
}

export default function SplashPage({ onReady }: SplashProps) {
  const { isLoading: authLoading } = useAuth()
  const shouldReduceMotion = useReducedMotion()
  const [minTimePassed, setMinTimePassed] = useState(false)
  const [authDeadlinePassed, setAuthDeadlinePassed] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  // Minimum display time - short enough that we hand off quickly when auth is ready.
  useEffect(() => {
    const timer = setTimeout(() => startTransition(() => setMinTimePassed(true)), 600)
    return () => clearTimeout(timer)
  }, [])

  // Hard ceiling on how long the splash may wait for auth to settle. First
  // paint must NEVER block on a network round trip: if auth has not resolved
  // within this window we hand off to the app shell anyway, which renders its
  // own bounded loading / offline state underneath (the route guard shows a
  // spinner, then the login or cached home). This is the ceiling that kills
  // the 60s+ blank cold start (status_board 1b1e718d) - the splash background
  // is near-white, so a splash that waited indefinitely on auth WAS the blank
  // screen customers saw on a flaky first launch.
  useEffect(() => {
    const timer = setTimeout(() => startTransition(() => setAuthDeadlinePassed(true)), 2000)
    return () => clearTimeout(timer)
  }, [])

  // Trigger dismiss only from an effect, never during render, to avoid
  // state-during-render violations that can cause a second splash flash
  // on Android WebView. Dismiss once the min time has passed AND either auth
  // has resolved or the auth deadline has elapsed.
  useEffect(() => {
    if (minTimePassed && (!authLoading || authDeadlinePassed) && !dismissing) {
      setDismissing(true)
    }
  }, [minTimePassed, authLoading, authDeadlinePassed, dismissing])

  return (
    <AnimatePresence onExitComplete={onReady}>
      {!dismissing && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: '#fafaf8' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <img
            src="/logos/black-wordmark.png"
            alt={APP_NAME}
            className="w-[60vw] max-w-[280px] h-auto"
            style={shouldReduceMotion ? undefined : { opacity: 1 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
