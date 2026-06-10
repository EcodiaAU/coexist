import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { MapPin, Hash, X } from 'lucide-react'
import { useState } from 'react'
import { useEventProximity } from '@/hooks/use-event-proximity'
import { ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import { Button } from '@/components/button'
import { cn } from '@/lib/cn'

/**
 * Floating banner that appears when the user is physically near an event
 * they're registered for. Prompts them to check in.
 *
 * Place this in the main app shell or home page.
 */
export function ProximityCheckInBanner() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { nearbyEvent } = useEventProximity()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const showEvent = nearbyEvent && !dismissed.has(nearbyEvent.id)

  return (
    <AnimatePresence>
      {showEvent && (
        <motion.div
          key={nearbyEvent.id}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={cn(
            'mx-4 mt-2 rounded-2xl overflow-hidden',
            'bg-gradient-to-r from-primary-600 to-primary-500',
            'shadow-sm',
          )}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 flex-shrink-0">
                  <MapPin size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                    You're here!
                  </p>
                  <p className="text-sm font-bold text-white truncate mt-0.5">
                    {nearbyEvent.title}
                  </p>
                  <p className="text-xs text-white/70 mt-0.5">
                    {ACTIVITY_TYPE_LABELS[nearbyEvent.activity_type] ?? nearbyEvent.activity_type}
                    {' '}&middot;{' '}
                    {nearbyEvent.distance_m < 100
                      ? 'Right here'
                      : `${nearbyEvent.distance_m}m away`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDismissed((prev) => new Set([...prev, nearbyEvent.id]))}
                className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-white/10 active:scale-[0.93] transition-[colors,transform] duration-150 cursor-pointer"
                aria-label="Dismiss"
              >
                <X size={16} className="text-white/70" />
              </button>
            </div>

            <Button
              variant="secondary"
              size="md"
              fullWidth
              icon={<Hash size={16} />}
              className="mt-3 bg-white text-primary-700 hover:bg-white/90"
              onClick={() => navigate(`/events/${nearbyEvent.id}/check-in`)}
            >
              Check In Now
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
