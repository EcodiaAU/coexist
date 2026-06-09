import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Calendar, MapPin, Users, TreePine, ExternalLink, Download } from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { OGMeta, SITE_URL } from '@/components/og-meta'
import { APP_NAME } from '@/lib/constants'
import { formatTime } from '@/lib/date-format'
import { WebFooter } from '@/components/web-footer'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

function formatDate(date: string, _legacyTz?: string) {
  // Floating local time (Tate 2026-05-25): stored wall-clock is the
  // wall-clock for every viewer.
  return new Date(date).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const ACTIVITY_LABELS: Record<string, string> = {
  clean_up: 'Clean Up',
  tree_planting: 'Tree Planting',
  ecosystem_restoration: 'Ecosystem Restoration',
  nature_hike: 'Nature Hike',
  camp_out: 'Camp Out',
  spotlighting: 'Spotlighting',
  other: 'Other',
}

export default function PublicEventPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['public-event', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, collectives(name, slug, timezone, region)')
        .eq('id', id!)
        .eq('is_public', true)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
  const showLoading = useDelayedLoading(isLoading)

  if (showLoading) {
    return (
      <div className="min-h-dvh bg-white">
        <div className="h-64 animate-pulse bg-white" />
        <div className="mx-auto max-w-2xl p-6 space-y-4">
          <Skeleton variant="title" />
          <Skeleton variant="text" count={4} />
        </div>
      </div>
    )
  }
  if (error || !event) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-white p-6">
        <OGMeta title="Event Not Found" description="This event doesn't exist or is no longer available." />
        <h1 className="font-heading text-2xl font-bold text-neutral-900">Event not found</h1>
        <p className="mt-2 text-neutral-500">This event doesn't exist or is no longer public.</p>
        <Button variant="primary" className="mt-6" onClick={() => navigate('/download')}>
          Get the {APP_NAME} App
        </Button>
      </div>
    )
  }

  const collective = (event as Record<string, unknown>).collectives as
    | { name?: string; region?: string }
    | null
    | undefined
  // "Hosted by <region> Collective" (Tate 2026-06-09). Region is the
  // human-facing place name (e.g. "Sunshine Coast"); fall back to the
  // collective name if a region is somehow missing.
  const collectiveLabel = collective
    ? `${collective.region || collective.name} Collective`
    : undefined

  const canonicalPath = `/event/${event.id}`
  const activityLabel = ACTIVITY_LABELS[event.activity_type] || 'conservation'
  const metaDescription = event.description
    ? event.description.slice(0, 155) + (event.description.length > 155 ? '...' : '')
    : `Join this ${activityLabel} event with Co-Exist${collectiveLabel ? `, hosted by ${collectiveLabel}` : ''} in Australia.`

  const eventJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || metaDescription,
    startDate: event.date_start,
    ...(event.date_end && { endDate: event.date_end }),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    ...(event.address && {
      location: {
        '@type': 'Place',
        name: event.address,
        address: { '@type': 'PostalAddress', addressCountry: 'AU', streetAddress: event.address },
      },
    }),
    ...(event.cover_image_url && { image: event.cover_image_url }),
    organizer: {
      '@type': 'Organization',
      name: collectiveLabel || 'Co-Exist Australia',
      url: 'https://www.coexistaus.org',
    },
    ...(event.capacity && {
      maximumAttendeeCapacity: event.capacity,
    }),
    isAccessibleForFree: true,
    url: `${SITE_URL}${canonicalPath}`,
  }

  return (
    <div className="min-h-dvh bg-white">
      <OGMeta
        title={event.title}
        description={metaDescription}
        canonicalPath={canonicalPath}
        image={event.cover_image_url || undefined}
        jsonLd={eventJsonLd}
      />

      {/* Hero image */}
      <div className="relative h-64 sm:h-80 bg-primary-800 overflow-hidden">
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TreePine size={64} className="text-primary-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Activity badge */}
        <motion.div
          initial={shouldReduceMotion ? false : { y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute bottom-4 left-4"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-neutral-500 shadow-sm">
            <TreePine size={14} />
            {ACTIVITY_LABELS[event.activity_type] || event.activity_type}
          </span>
        </motion.div>
      </div>

      {/* Content */}
      <motion.div
        className="mx-auto max-w-2xl px-4 py-6 sm:px-6"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Title */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <h1 className="font-heading text-2xl font-bold text-neutral-900 sm:text-3xl">
            {event.title}
          </h1>

          {collectiveLabel && (
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Hosted by {collectiveLabel}
            </p>
          )}
        </motion.div>

        {/* Details grid */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="mt-6 space-y-3">
          <div className="flex items-start gap-3">
            <Calendar size={20} className="mt-0.5 shrink-0 text-primary-500" />
            <div>
              {(() => {
                const tz =
                  (event as { timezone?: string | null }).timezone ??
                  (event as { collectives?: { timezone?: string | null } | null }).collectives?.timezone ??
                  undefined
                return (
                  <>
                    <p className="font-medium text-neutral-900">{formatDate(event.date_start, tz)}</p>
                    <p className="text-sm text-neutral-500">
                      {formatTime(event.date_start, tz)}
                      {event.date_end && ` - ${formatTime(event.date_end, tz)}`}
                    </p>
                  </>
                )
              })()}
            </div>
          </div>

          {event.address && (
            <div className="flex items-start gap-3">
              <MapPin size={20} className="mt-0.5 shrink-0 text-primary-500" />
              <p className="text-neutral-900">{event.address}</p>
            </div>
          )}

          {event.capacity && (
            <div className="flex items-start gap-3">
              <Users size={20} className="mt-0.5 shrink-0 text-primary-500" />
              <p className="text-neutral-900">{event.capacity} spots</p>
            </div>
          )}
        </motion.div>

        {/* Description */}
        {event.description && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="mt-6">
            <h2 className="font-heading text-lg font-semibold text-neutral-900">About this event</h2>
            <p className="mt-2 whitespace-pre-line text-neutral-500 leading-relaxed">
              {event.description}
            </p>
          </motion.div>
        )}

        {/* CTAs */}
        <motion.div
          variants={shouldReduceMotion ? undefined : fadeUp}
          className={cn(
            'mt-8 flex flex-col gap-3',
            'sticky bottom-4 rounded-2xl bg-white/95 p-4 shadow-sm',
            'sm:relative sm:bottom-auto sm:bg-transparent sm:p-0 sm:shadow-none',
          )}
        >
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<ExternalLink size={18} />}
            onClick={() => {
              // Try to open in-app, fallback to app store
              window.location.href = `coexist://events/${event.id}`
              setTimeout(() => {
                navigate('/download')
              }, 1500)
            }}
          >
            Open in App
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            icon={<Download size={18} />}
            onClick={() => navigate('/download')}
          >
            Download {APP_NAME}
          </Button>
        </motion.div>

      </motion.div>

      <WebFooter />
    </div>
  )
}
