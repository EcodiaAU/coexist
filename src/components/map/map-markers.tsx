import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import { createPinIcon, createClusterIcon } from '@/lib/leaflet-icons'
import type { MapCenter, MapMarker } from './use-map'

/* ------------------------------------------------------------------ */
/*  Clustered markers overlay                                          */
/* ------------------------------------------------------------------ */

interface MapMarkersProps {
  map: L.Map | null
  markers?: MapMarker[]
  onMarkerClick?: (id: string) => void
  /** Fit bounds to markers when there are multiple */
  fitBounds?: boolean
}

export function useMapMarkers({ map, markers, onMarkerClick, fitBounds = true }: MapMarkersProps) {
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  const onMarkerClickRef = useRef(onMarkerClick)
  onMarkerClickRef.current = onMarkerClick

  useEffect(() => {
    if (!map) return

    // Clean previous cluster group
    if (clusterGroupRef.current) {
      try { map.removeLayer(clusterGroupRef.current) } catch { /* layer already gone */ }
      clusterGroupRef.current = null
    }

    if (!markers?.length) return

    // Defer the cluster add by one frame after the map signals ready.
    // On iOS WKWebView, the container's layout sometimes isn't fully
    // committed by the time React's mapReady state flips, so panes can
    // still be missing their _leaflet_pos. markercluster's onAdd / first
    // animation then tries to read `someElement._leaflet_pos` where the
    // element is undefined - throws as a render-phase error caught by the
    // route ErrorBoundary, killing the page on second visit. Forcing one
    // more invalidateSize + a rAF-deferred add + try/catch with retry
    // bulletproofs against the race.
    let rafId: number | null = null
    let cancelled = false
    let retries = 0

    const applyCluster = () => {
      if (cancelled) return
      rafId = null
      try {
        // Re-assert size in case container layout shifted (KeepAlive
        // display:none -> visible toggle, address bar collapse, etc).
        map.invalidateSize()

        const group = L.markerClusterGroup({
          iconCreateFunction: createClusterIcon,
          maxClusterRadius: 50,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          animate: true,
        })

        for (const m of markers) {
          const icon = createPinIcon(m.variant ?? 'default')
          const leafletMarker = L.marker([m.position.lat, m.position.lng], { icon })

          if (m.label) {
            leafletMarker.bindTooltip(m.label, {
              direction: 'top',
              offset: [0, -46],
              className: 'coexist-tooltip',
            })
          }

          leafletMarker.on('click', () => {
            onMarkerClickRef.current?.(m.id)
          })

          group.addLayer(leafletMarker)
        }

        map.addLayer(group)
        clusterGroupRef.current = group

        // Fit bounds if multiple markers
        if (fitBounds && markers.length > 1) {
          const bounds = L.latLngBounds(markers.map((m) => [m.position.lat, m.position.lng]))
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
        }
      } catch (err) {
        // Most common observed failure: TypeError reading _leaflet_pos on an
        // undefined pane element when iOS hasn't laid out the container yet.
        // Retry once on the next frame; if it still fails, surface and stop -
        // a permanent rejection means the map is genuinely broken (not racing)
        // and silent infinite retry would mask that.
        if (retries < 1) {
          retries += 1
          rafId = requestAnimationFrame(applyCluster)
        } else {
          console.error('[map-markers] cluster add failed after retry', err)
        }
      }
    }

    rafId = requestAnimationFrame(applyCluster)

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (clusterGroupRef.current) {
        try { map.removeLayer(clusterGroupRef.current) } catch { /* map already torn down */ }
        clusterGroupRef.current = null
      }
    }
  }, [map, markers, fitBounds])
}

/* ------------------------------------------------------------------ */
/*  Draggable single pin                                               */
/* ------------------------------------------------------------------ */

interface DraggablePinProps {
  map: L.Map | null
  center?: MapCenter
  onDragEnd?: (position: MapCenter) => void
}

export function useDraggablePin({ map, center, onDragEnd }: DraggablePinProps) {
  const markerRef = useRef<L.Marker | null>(null)
  const onDragEndRef = useRef(onDragEnd)
  onDragEndRef.current = onDragEnd
  // Track whether the last position change came from a drag (vs. external prop update).
  // When it did, we skip setLatLng so we don't snap the marker back to the form
  // state that was just written by the drag itself.
  const draggedRef = useRef(false)

  useEffect(() => {
    if (!map || !center) return

    const icon = createPinIcon('event')

    if (markerRef.current) {
      if (!draggedRef.current) {
        // External center change (e.g. autocomplete selection) - move the marker.
        markerRef.current.setLatLng([center.lat, center.lng])
      }
      draggedRef.current = false
      return
    }

    const marker = L.marker([center.lat, center.lng], {
      icon,
      draggable: true,
    }).addTo(map)

    marker.on('dragend', () => {
      const pos = marker.getLatLng()
      draggedRef.current = true
      onDragEndRef.current?.({ lat: pos.lat, lng: pos.lng })
    })

    markerRef.current = marker

    return () => {
      map.removeLayer(marker)
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center?.lat, center?.lng])
}
