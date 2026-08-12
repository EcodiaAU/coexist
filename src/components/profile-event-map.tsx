import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Images, Share2, MapPin, ChevronRight } from 'lucide-react'
import { MapView, type MapMarker, type MapCenter } from '@/components/map/map-view'
import { BottomSheet } from '@/components/bottom-sheet'
import { EventShareSheet } from '@/components/event-share-sheet'
import { getWatermark } from '@/components/card'
import { useProfileEventMap, type ProfileMapLocation, type ProfileMapEvent } from '@/hooks/use-profile-event-map'
import { cn } from '@/lib/cn'

/* Activity label map mirrors the app's canonical labels (chat-bubble.tsx);
   falls back to a Title-Cased version of the raw enum for any newer type. */
const ACTIVITY_LABELS: Record<string, string> = {
  shore_cleanup: 'Shore Clean-up',
  clean_up: 'Clean Up',
  tree_planting: 'Tree Planting',
  land_regeneration: 'Land Regeneration',
  ecosystem_restoration: 'Ecosystem Restoration',
  nature_walk: 'Nature Walk',
  nature_hike: 'Nature Hike',
  camp_out: 'Camp Out',
  retreat: 'Retreat',
  film_screening: 'Film Screening',
  marine_restoration: 'Marine Restoration',
  workshop: 'Workshop',
  spotlighting: 'Spotlighting',
  other: 'Other',
}

function prettyActivity(t: string): string {
  return ACTIVITY_LABELS[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtDate(iso: string): string {
  // Floating local time: the stored wall-clock is the wall-clock (see the
  // collective-map date helper). UTC pin keeps the displayed day stable.
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const DEFAULT_CENTER: MapCenter = { lat: -25.0, lng: 134.0 }

/** Centre + zoom that frames every attended location. MapView has no
 *  fitBounds, so we derive a centre from the bounding box and pick a zoom
 *  from its span - tighter than the national explore map (Jess: "zoomed in
 *  more"). A single location lands at street-ish zoom. */
function computeView(locations: ProfileMapLocation[]): { center: MapCenter; zoom: number } {
  if (locations.length === 0) return { center: DEFAULT_CENTER, zoom: 4 }
  const lats = locations.map((l) => l.lat)
  const lngs = locations.map((l) => l.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
  const span = Math.max(maxLat - minLat, maxLng - minLng)
  const zoom =
    span > 8 ? 4 :
    span > 4 ? 5 :
    span > 2 ? 6 :
    span > 0.8 ? 8 :
    span > 0.25 ? 10 :
    span > 0.05 ? 12 : 13
  return { center, zoom }
}

interface ProfileEventMapProps {
  userId?: string
  /** Own profile shows a gentle empty state; other profiles just hide when empty. */
  isOwnProfile?: boolean
}

export function ProfileEventMap({ userId, isOwnProfile = false }: ProfileEventMapProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useProfileEventMap(userId)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [shareEvent, setShareEvent] = useState<ProfileMapEvent | null>(null)

  const locations = useMemo(() => data?.locations ?? [], [data])
  const { center, zoom } = useMemo(() => computeView(locations), [locations])
  const markers: MapMarker[] = useMemo(
    () => locations.map((l) => ({ id: l.key, position: { lat: l.lat, lng: l.lng }, variant: 'event' as const, label: String(l.events.length) })),
    [locations],
  )
  const selected = locations.find((l) => l.key === selectedKey) ?? null

  if (isLoading) {
    return <div className="h-64 rounded-2xl bg-neutral-100 animate-pulse" aria-hidden="true" />
  }

  if (locations.length === 0) {
    if (!isOwnProfile) return null
    return (
      <div className="rounded-2xl border border-neutral-100 bg-white shadow-sm px-5 py-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <MapPin size={20} />
        </div>
        <p className="text-sm font-semibold text-neutral-900">Your map is waiting</p>
        <p className="mx-auto mt-0.5 max-w-xs text-xs text-neutral-500">
          Every event you show up to drops a pin here, with the photo album and your impact to share.
        </p>
        <button
          onClick={() => navigate('/events')}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold text-white active:scale-[0.98] transition-transform"
        >
          Find an event <ChevronRight size={13} />
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-neutral-100 shadow-sm">
        <MapView
          mode="explore"
          center={center}
          zoom={zoom}
          markers={markers}
          onMarkerClick={(id) => setSelectedKey(id)}
          // Taller on wider screens (Kurt 2026-08-12): a fixed h-64 reads as a
          // thin band on a laptop where the map spans the full column width.
          className="h-64 md:h-80 lg:h-[32rem]"
          aria-label="Map of the places you have attended events"
        />
      </div>
      {data && data.unmappedCount > 0 && (
        <p className="mt-2 px-1 text-[11px] text-neutral-400">
          {data.unmappedCount} attended {data.unmappedCount === 1 ? 'event has' : 'events have'} no saved location yet.
        </p>
      )}

      {/* Location popup: image-forward, immersive event tiles (Kurt 2026-08-12:
          less UI, more image-bleed - same principle as the profile). Each event
          is a full-bleed cover tile; album + share live as glass controls over
          the image rather than a white button bar. */}
      <BottomSheet open={!!selected} onClose={() => setSelectedKey(null)}>
        {selected && (
          <div>
            <div className="mb-3.5">
              <h3 className="font-heading text-xl font-bold text-neutral-900 leading-tight">{selected.label}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                <MapPin size={12} className="text-primary-500" />
                {selected.events.length} {selected.events.length === 1 ? 'event' : 'events'} you showed up to here
              </p>
            </div>

            {/* Full-bleed cover tiles (Kurt 2026-08-12: images should bleed edge
                to edge in the modal). -mx-5 cancels the BottomSheet's px-5 so
                each cover fills the sheet's full width; -mb-6 cancels the
                sheet's bottom padding so the last cover bleeds to the sheet's
                bottom edge (no white bar under the image), and last:rounded-b-md
                rounds that final tile to match the sheet's rounded corners. A
                hairline gap keeps stacked tiles legible. */}
            <div className="-mx-5 -mb-6 space-y-1">
              {selected.events.map((ev) => (
                <div key={ev.id} className="group relative w-full overflow-hidden aspect-[16/10] last:rounded-b-md">
                  {ev.coverImageUrl ? (
                    <img src={ev.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#879e62] via-moss-700 to-primary-800" aria-hidden="true">
                      <div className="absolute -right-4 -top-4 text-white/10 [&>svg]:h-32 [&>svg]:w-32">
                        {getWatermark(ev.activityType)}
                      </div>
                    </div>
                  )}
                  {/* Legibility gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" aria-hidden="true" />

                  {/* Activity pill (glass, top-left) */}
                  <span className="absolute top-2.5 left-2.5 rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {prettyActivity(ev.activityType)}
                  </span>

                  {/* Share (glass icon, top-right) */}
                  <button
                    onClick={() => { setSelectedKey(null); setShareEvent(ev) }}
                    aria-label={`Share your impact from ${ev.title}`}
                    className="absolute top-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white active:scale-[0.94] transition-transform"
                  >
                    <Share2 size={15} />
                  </button>

                  {/* Title + date + album action, overlaid at the bottom */}
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <p className="font-heading text-base font-bold text-white leading-tight drop-shadow line-clamp-2">{ev.title}</p>
                    <p className="mt-0.5 text-xs text-white/85">{fmtDate(ev.dateStart)}</p>
                    <button
                      onClick={() => navigate(ev.albumHref)}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs font-semibold text-white active:scale-[0.97] transition-transform"
                    >
                      <Images size={13} />
                      {ev.photoCount > 0 ? `View album (${ev.photoCount})` : 'View album'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Impact share graphic (reuses the event share sheet - 1:1 / 4:5 / 9:16
          downloadable graphics that surface the event's logged impact). */}
      {shareEvent && (
        <EventShareSheet
          open
          onClose={() => setShareEvent(null)}
          eventId={shareEvent.id}
          title={shareEvent.title}
          dateLabel={fmtDate(shareEvent.dateStart)}
          locationLabel={shareEvent.address ?? ''}
          coverImageUrl={shareEvent.coverImageUrl}
        />
      )}
    </>
  )
}
