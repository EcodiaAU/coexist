import { useState } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Users, ChevronRight, Lock } from 'lucide-react'
import { Avatar } from '@/components'
import { BottomSheet } from '@/components/bottom-sheet'
import { useEventGoing } from '@/hooks/use-events'
import { cn } from '@/lib/cn'
import type { EventDetailData } from '@/hooks/use-events'

const REGISTERED_STATUSES = ['registered', 'attended', 'waitlisted']

function firstNameOf(m: { first_name: string | null; display_name: string | null }): string {
  return m.first_name?.trim() || m.display_name?.trim().split(/\s+/)[0] || 'Member'
}

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
  const [showGoing, setShowGoing] = useState(false)
  const isRegistrant = REGISTERED_STATUSES.includes(event.user_registration?.status ?? '')
  // Only fetch the full list once the sheet is opened by a registrant. The read
  // is RLS-gated + profile_visible-masked at the DB, so a non-registrant would
  // get nothing anyway; we gate the fetch to avoid a pointless empty query.
  const going = useEventGoing(event.id, showGoing && isRegistrant)

  return (
    <>
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
      {/* Who's going - tap to expand into the privacy-gated sheet. Preview
          avatars are already RLS-filtered to profile-visible co-attendees. */}
      {event.registration_count > 0 && (
        <button
          type="button"
          onClick={() => setShowGoing(true)}
          className="relative flex items-center gap-2.5 pt-1 w-full text-left group"
          aria-label="See who's going"
        >
          {event.attendees.length > 0 && (
            /* Descending z-index (first on top) so each white ring reads as a
               clean separator at the overlap edge, not a line across the one
               behind. */
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
          )}
          <span className="text-caption text-primary-500 font-semibold group-active:text-primary-700">
            {event.attendees.length > 0 && event.registration_count > 6
              ? `+${event.registration_count - 6} more`
              : "See who's going"}
          </span>
          <ChevronRight size={14} className="ml-auto text-neutral-400 shrink-0" aria-hidden="true" />
        </button>
      )}
    </motion.div>

    <BottomSheet open={showGoing} onClose={() => setShowGoing(false)}>
      <div className="px-1 pb-2">
        <h3 className="font-heading text-lg font-bold text-neutral-900">Who's going</h3>
        <p className="text-xs text-neutral-500 mt-0.5 mb-4">{event.registration_count} going</p>
        {!isRegistrant ? (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center">
              <Lock size={20} className="text-primary-500" aria-hidden="true" />
            </div>
            <p className="text-sm text-neutral-600 max-w-[16rem]">
              Register for this event to see who else is coming along.
            </p>
          </div>
        ) : going.isLoading ? (
          <div className="py-8 text-center text-sm text-neutral-400">Loading...</div>
        ) : going.data && going.data.length > 0 ? (
          <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
            {going.data.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2">
                <Avatar src={m.avatar_url ?? undefined} name={firstNameOf(m)} size="sm" />
                <span className="text-sm font-medium text-neutral-800">{firstNameOf(m)}</span>
              </div>
            ))}
            {event.registration_count > going.data.length && (
              <p className="text-xs text-neutral-400 pt-3 text-center">
                +{event.registration_count - going.data.length} more keeping their profile private
              </p>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-neutral-400">
            The others are keeping their profiles private.
          </div>
        )}
      </div>
    </BottomSheet>
    </>
  )
}
