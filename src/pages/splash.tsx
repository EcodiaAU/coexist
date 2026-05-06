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
  const [dismissing, setDismissing] = useState(false)

  // Minimum display time - short enough that we hand off quickly when auth is ready.
  useEffect(() => {
    const timer = setTimeout(() => startTransition(() => setMinTimePassed(true)), 600)
    return () => clearTimeout(timer)
  }, [])

  // Trigger dismiss only from an effect, never during render, to avoid
  // state-during-render violations that can cause a second splash flash
  // on Android WebView.
  useEffect(() => {
    if (minTimePassed && !authLoading && !dismissing) {
      setDismissing(true)
    }
  }, [minTimePassed, authLoading, dismissing])

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
            src="/logos/black-logo-transparent.png"
            alt={APP_NAME}
            className="w-[160px] h-[160px] object-contain"
            style={shouldReduceMotion ? undefined : { opacity: 1 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
