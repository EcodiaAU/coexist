import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Users } from 'lucide-react'
import { Avatar } from '@/components'
import { cn } from '@/lib/cn'
import type { EventDetailData } from '@/hooks/use-events'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface EventAttendeesProps {
  event: EventDetailData
  accent: { gradient: string; glow: string; bg: string; text: string; border: string }
  capacityText: string
  capacityPercent: number
  fadeUpVariants: Variants | undefined
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EventAttendees({ event, accent, capacityText, capacityPercent, fadeUpVariants }: EventAttendeesProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      variants={fadeUpVariants}
      className={cn(
        'rounded-md p-4.5 space-y-3 relative overflow-hidden',
        'border shadow-sm',
        accent.border,
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-[0.06]', accent.gradient)} aria-hidden="true" />
      <div className="absolute inset-0 bg-white/92" aria-hidden="true" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn('w-8 h-8 rounded-sm flex items-center justify-center shadow-sm bg-gradient-to-br text-white', accent.gradient)}>
            <Users size={15} />
          </div>
          <span className="text-[15px] font-bold text-neutral-900">{capacityText}</span>
        </div>
        {event.capacity && (
          <span className={cn(
            'text-xs font-bold px-2.5 py-1 rounded-full',
            capacityPercent >= 90 ? 'text-error-700 bg-error-100' : capacityPercent >= 70 ? 'text-warning-700 bg-warning-100' : cn(accent.text, accent.bg),
          )}>
            {Math.round(capacityPercent)}%
          </span>
        )}
      </div>
      {event.capacity && (
        <div className="relative h-3 rounded-full bg-neutral-100 overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full shadow-sm',
              capacityPercent >= 90
                ? 'bg-error-500'
                : capacityPercent >= 70
                  ? 'bg-warning-500'
                  : cn('bg-gradient-to-r', accent.gradient),
            )}
            animate={{ width: `${capacityPercent}%` }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      )}
      {/* Attendee avatars */}
      {event.attendees.length > 0 && (
        <div className="relative flex items-center gap-2.5 pt-1">
          {/* Descending z-index (first on top) so each white ring reads as a
              clean separator at the overlap edge. Without it the browser paints
              later siblings on top, so every front avatar's ring bled a white
              line across the one behind it (all but the last). */}
          <div className="flex -space-x-2">
            {event.attendees.slice(0, 6).map((a, i, arr) => (
              <div key={a.id} className="relative" style={{ zIndex: arr.length - i }}>
                <Avatar
                  src={a.avatar_url ?? undefined}
                  name={a.display_name ?? 'User'}
                  size="xs"
                  className="ring-2 ring-white shadow-sm"
                />
              </div>
            ))}
          </div>
          {event.registration_count > 6 && (
            <span className="text-caption text-primary-500 font-semibold">
              +{event.registration_count - 6} more
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}
