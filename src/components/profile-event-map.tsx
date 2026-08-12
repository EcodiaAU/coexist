import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Images, Share2, MapPin, ChevronRight } from 'lucide-react'
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
          className="h-64"
          aria-label="Map of the places you have attended events"
        />
      </div>
      {data && data.unmappedCount > 0 && (
        <p className="mt-2 px-1 text-[11px] text-neutral-400">
          {data.unmappedCount} attended {data.unmappedCount === 1 ? 'event has' : 'events have'} no saved location yet.
        </p>
      )}

      {/* Location popup: the events you attended at this spot */}
      <BottomSheet open={!!selected} onClose={() => setSelectedKey(null)}>
        {selected && (
          <div className="px-4 pb-2">
            <div className="mb-3 flex items-start gap-2">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <MapPin size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="font-heading text-base font-bold text-neutral-900 leading-tight">{selected.label}</h3>
                <p className="text-xs text-neutral-500">
                  {selected.events.length} {selected.events.length === 1 ? 'event' : 'events'} attended
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {selected.events.map((ev) => (
                <div key={ev.id} className="rounded-2xl border border-neutral-100 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-primary-100">
                      {ev.coverImageUrl ? (
                        <img src={ev.coverImageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-primary-400 [&>svg]:h-6 [&>svg]:w-6">
                          {getWatermark(ev.activityType)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-sm font-bold text-neutral-900">{ev.title}</p>
                      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <Calendar size={11} />
                        {fmtDate(ev.dateStart)} · {prettyActivity(ev.activityType)}
                      </p>
                    </div>
                  </div>
                  <div className="flex divide-x divide-neutral-100 border-t border-neutral-100">
                    <button
                      onClick={() => navigate(ev.albumHref)}
                      className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-neutral-700 active:bg-neutral-50 transition-colors"
                    >
                      <Images size={14} className="text-sky-600" />
                      {ev.photoCount > 0 ? `Album (${ev.photoCount})` : 'Album'}
                    </button>
                    <button
                      onClick={() => { setSelectedKey(null); setShareEvent(ev) }}
                      className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-neutral-700 active:bg-neutral-50 transition-colors"
                    >
                      <Share2 size={14} className="text-primary-600" />
                      Share impact
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
