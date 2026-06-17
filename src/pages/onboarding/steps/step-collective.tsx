import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Users, MapPin, Check, Search, Navigation } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useUserLocation } from '@/hooks/use-nearby'
import { Button } from '@/components/button'
import { Card } from '@/components/card'
import { cn } from '@/lib/cn'
import { resolveCollectiveCoords, haversineKm } from '@/lib/geo'
import type { Database } from '@/types/database.types'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

type Collective = Database['public']['Tables']['collectives']['Row']

// How many to show by default (before the user searches). Distance-sorted when
// we have the user's location, member_count-sorted otherwise.
const DEFAULT_VISIBLE = 12

interface StepCollectiveProps {
  selectedId: string | null
  /**
   * Location the user entered on the previous onboarding step (the suburb/city
   * autocomplete). Preferred signal for proximity ordering since it's exactly
   * where they said they're based. Falls back to browser geolocation.
   */
  locationPoint?: { lat: number; lng: number } | null
  onSelect: (id: string | null) => void
  onNext: () => void
  onSkip: () => void
}

/** Human-friendly distance label: "12 km away", "<1 km away". */
function formatDistance(km: number): string {
  if (km < 1) return '<1 km away'
  return `${Math.round(km)} km away`
}

export function StepCollective({
  selectedId,
  locationPoint,
  onSelect,
  onNext,
  onSkip,
}: StepCollectiveProps) {
  const shouldReduceMotion = useReducedMotion()
  const [search, setSearch] = useState('')

  // Browser geolocation fallback, only fetched when the user didn't give a
  // location on the previous step (resolves null if denied or unavailable).
  const { data: geoLocation } = useUserLocation()

  // Prefer the explicitly-entered onboarding location; fall back to geolocation.
  const userLocation = locationPoint ?? geoLocation ?? null

  const { data: collectives, isLoading, error } = useQuery({
    queryKey: ['onboarding-collectives'],
    queryFn: async () => {
      // Fetch ALL active local collectives (no member_count limit) so the
      // distance sort can promote a small, nearby group. The old query capped
      // at the 10 largest, which permanently hid smaller cities (e.g. Cairns)
      // and forced those users to hunt via search.
      const { data } = await supabase
        .from('collectives')
        .select('*')
        .eq('is_active', true)
        .or('is_national.is.null,is_national.eq.false')
        .order('member_count', { ascending: false })
      return data as Collective[]
    },
  })
  const showLoading = useDelayedLoading(isLoading)

  // Annotate each collective with its distance from the user (km), then order.
  const ordered = useMemo(() => {
    if (!collectives) return []
    const withDistance = collectives.map((c) => {
      let distanceKm: number | null = null
      if (userLocation) {
        const coords = resolveCollectiveCoords(c.location_point, c.slug)
        if (coords) distanceKm = haversineKm(userLocation, coords)
      }
      return { collective: c, distanceKm }
    })

    if (userLocation) {
      // Nearest first; collectives with no resolvable coords sink to the
      // bottom, kept in member_count order (the source query order).
      withDistance.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0
        if (a.distanceKm === null) return 1
        if (b.distanceKm === null) return -1
        return a.distanceKm - b.distanceKm
      })
    }
    return withDistance
  }, [collectives, userLocation])

  // Search filters the full list (name + region); otherwise show the top slice.
  const query = search.trim().toLowerCase()
  const visible = useMemo(() => {
    if (query) {
      return ordered.filter(
        ({ collective }) =>
          collective.name.toLowerCase().includes(query) ||
          (collective.region?.toLowerCase().includes(query) ?? false),
      )
    }
    return ordered.slice(0, DEFAULT_VISIBLE)
  }, [ordered, query])

  /** Overlaid name + region + member count (+ distance), shared by image and fallback. */
  function CollectiveOverlayBody({
    collective,
    distanceKm,
  }: {
    collective: Collective
    distanceKm: number | null
  }) {
    return (
      <>
        <p className="font-heading text-lg font-semibold text-white leading-tight line-clamp-1">
          {collective.name}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-white/80">
          {collective.region && (
            <span className="flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" />
              {collective.region}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users size={12} aria-hidden="true" />
            {collective.member_count} members
          </span>
          {distanceKm !== null && (
            <span className="flex items-center gap-1 text-white/70">
              <Navigation size={12} aria-hidden="true" />
              {formatDistance(distanceKm)}
            </span>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="flex-1 flex flex-col px-4 pt-8 min-h-0">
      <motion.div
        className="flex-1 overflow-y-auto"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          Join a Collective
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500 leading-relaxed">
          {userLocation
            ? 'Collectives are local volunteer groups. The closest ones to you are shown first.'
            : 'Collectives are local volunteer groups. Join one to find events near you.'}
        </motion.p>

        <motion.div variants={fadeUp} className="mt-5 relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
          />
          <input
            type="text"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for your town or city"
            className={cn(
              'w-full h-12 pl-10 pr-3 rounded-xl bg-white border border-neutral-200',
              'text-neutral-900 placeholder:text-neutral-400',
              'focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent',
            )}
          />
        </motion.div>

        <div className="mt-4 space-y-4">
          {showLoading ? (
            <>
              <Card.Skeleton hasImage lines={1} />
              <Card.Skeleton hasImage lines={1} />
              <Card.Skeleton hasImage lines={1} />
            </>
          ) : error ? (
            <p className="text-sm text-error-500 text-center py-8">
              Couldn't load collectives. You can skip and join one later.
            </p>
          ) : visible.length > 0 ? (
            visible.map(({ collective, distanceKm }) => {
              const isSelected = selectedId === collective.id
              return (
                <motion.div key={collective.id} variants={fadeUp}>
                  <Card
                    variant="collective"
                    onClick={() => onSelect(isSelected ? null : collective.id)}
                    aria-label={collective.name}
                    className={cn(
                      'transition-shadow duration-150',
                      isSelected ? 'ring-2 ring-primary-500 shadow-md' : 'shadow-sm',
                    )}
                  >
                    {isSelected && (
                      <Card.Badge position="top-right">
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary-500 shadow-md">
                          <Check size={16} className="text-white" aria-hidden="true" />
                        </span>
                      </Card.Badge>
                    )}
                    {collective.cover_image_url ? (
                      <Card.Overlay
                        src={collective.cover_image_url}
                        alt=""
                        aspectRatio="16/9"
                        positionX={collective.cover_image_position_x}
                        positionY={collective.cover_image_position_y}
                      >
                        <CollectiveOverlayBody collective={collective} distanceKm={distanceKm} />
                      </Card.Overlay>
                    ) : (
                      <div
                        className="relative w-full overflow-hidden bg-gradient-to-br from-primary-400 to-sprout-500"
                        style={{ aspectRatio: '16/9' }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/15 to-transparent" aria-hidden="true" />
                        <div className="absolute inset-0 flex flex-col justify-end p-4">
                          <CollectiveOverlayBody collective={collective} distanceKm={distanceKm} />
                        </div>
                      </div>
                    )}
                  </Card>
                </motion.div>
              )
            })
          ) : query ? (
            <p className="text-sm text-neutral-500 text-center py-8">
              No collectives match "{search.trim()}". Try a nearby town, or skip and join one later.
            </p>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-8">
              No collectives available yet. Check back soon!
            </p>
          )}
        </div>
      </motion.div>

      <div
        className="py-6 space-y-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext} disabled={!selectedId}>
          Join & Continue
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  )
}
