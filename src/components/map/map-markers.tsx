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
      map.removeLayer(clusterGroupRef.current)
      clusterGroupRef.current = null
    }

    if (!markers?.length) return

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

    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current)
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

  useEffect(() => {
    if (!map || !center) return

    const icon = createPinIcon('event')

    if (markerRef.current) {
      markerRef.current.setLatLng([center.lat, center.lng])
      return
    }

    const marker = L.marker([center.lat, center.lng], {
      icon,
      draggable: true,
    }).addTo(map)

    marker.on('dragend', () => {
      const pos = marker.getLatLng()
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
