import { motion, useReducedMotion } from 'framer-motion'
import { Share2 } from 'lucide-react'
import { Header, Badge, WaveTransition } from '@/components'
import { OptimizedImage } from '@/components/optimized-image'
import { ACTIVITY_TYPE_LABELS, getCountdown } from '@/hooks/use-events'
import { cn } from '@/lib/cn'
import type { EventDetailData } from '@/hooks/use-events'
import { activityToBadge } from '@/lib/activity-types'
// Re-export removed (was unused) so this file only exports components,
// satisfying react-refresh/only-export-components. Consumers import
// activityToBadge directly from '@/lib/activity-types'.

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface EventHeroProps {
  event: EventDetailData
  past: boolean
  userStatus: string | null
  accent: { gradient: string; glow: string; bg: string; text: string; border: string }
  onShare: () => void
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EventHero({ event, past, userStatus, accent, onShare }: EventHeroProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <>
      {/* ── Full-bleed hero image ──
          Image bleeds behind the status bar / camera notch (intentional);
          the title block sits at the bottom safely below it. The activity
          pill is grouped with the title so it doesn't get clipped by the
          notch - the back button up top is the only chrome that needs to
          live in the safe area. */}
      {event.cover_image_url && (
        <div className="relative -mx-4 lg:-mx-6">
          <div
            className="relative w-full overflow-hidden"
            // Compact hero: smaller floor + tighter ceiling so the title
            // and content beneath always fit on first paint without scroll.
            style={{ height: 'min(44vh, 360px)', minHeight: '260px' }}
          >
            <OptimizedImage
              src={event.cover_image_url}
              alt={event.title}
              priority
              sizes="100vw"
              wrapperClassName="absolute inset-0"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10"
              aria-hidden="true"
            />

            {/* Title + activity pill grouped at the bottom of the hero,
                clear of the camera notch and any system overlays. */}
            <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 z-[5]">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge
                  variant="activity"
                  activity={activityToBadge[event.activity_type] ?? 'other'}
                  size="sm"
                >
                  {ACTIVITY_TYPE_LABELS[event.activity_type] ?? event.activity_type}
                </Badge>
                {!past && userStatus === 'registered' && (
                  <motion.span
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold',
                      'bg-white/25 text-white border border-white/20',
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-sprout-400 animate-pulse" />
                    {getCountdown(event.date_start)}
                  </motion.span>
                )}
              </div>
              <h1 className="font-heading text-[22px] sm:text-2xl font-bold text-white leading-tight drop-shadow-lg">
                {event.title}
              </h1>
              {event.collectives && (
                <p className="text-[13px] text-white/75 font-medium mt-1 drop-shadow">
                  by {event.collectives.name}
                </p>
              )}
            </div>
          </div>

          {/* Organic wave transition - matches homepage hero */}
          <WaveTransition className="-bottom-px z-10" />
        </div>
      )}

      {/* ── No cover image header ── */}
      {!event.cover_image_url && (
        <>
          <motion.div
            // Clear the back button. The button is sticky at top: var(--safe-top)
            // with a 56px tap target - without this padding the title loads
            // underneath it before the user scrolls.
            className="pb-1"
            style={{ paddingTop: 'calc(var(--safe-top, 0px) + 3.5rem + 0.5rem)' }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2.5">
              <Badge
                variant="activity"
                activity={activityToBadge[event.activity_type] ?? 'other'}
                size="md"
              >
                {ACTIVITY_TYPE_LABELS[event.activity_type] ?? event.activity_type}
              </Badge>
              {!past && userStatus === 'registered' && (
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold',
                  accent.bg, accent.text, accent.border, 'border',
                )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {getCountdown(event.date_start)}
                </span>
              )}
            </div>
            <h1 className="font-heading text-2xl font-bold text-neutral-900 mt-2.5">
              {event.title}
            </h1>
            {event.collectives && (
              <p className="text-sm text-primary-500 font-medium mt-1">
                by {event.collectives.name}
              </p>
            )}
          </motion.div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Sticky overlay header (used by Page stickyOverlay prop)            */
/* ------------------------------------------------------------------ */

export interface EventHeroOverlayProps {
  hasCoverImage: boolean
  onShare: () => void
}

export function EventHeroOverlay({ hasCoverImage, onShare }: EventHeroOverlayProps) {
  if (hasCoverImage) {
    return (
      <Header
        title=""
        back
        transparent
        className="collapse-header"
        rightActions={
          <motion.button
            type="button"
            onClick={onShare}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-black/40 text-white cursor-pointer select-none active:scale-95 transition-transform duration-150"
            aria-label="Share event"
          >
            <Share2 size={18} />
          </motion.button>
        }
      />
    )
  }

  return <Header title="" back className="collapse-header" />
}
