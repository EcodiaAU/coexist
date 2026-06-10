import { useMap } from './use-map'
import { useMapMarkers, useDraggablePin } from './map-markers'
import { useMapDraw } from './map-draw'
import type { MapCenter, MapMarker } from './use-map'
import type { MapMode } from './map-view'
import type { AreaGeoJSON } from './map-draw'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MapViewInnerProps {
  mode: MapMode
  center?: MapCenter
  zoom: number
  markers?: MapMarker[]
  onMarkerClick?: (id: string) => void
  draggable?: boolean
  onDragEnd?: (position: MapCenter) => void
  interactive?: boolean
  onAreaChange?: (area: AreaGeoJSON | null) => void
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MapViewInner({
  mode,
  center,
  zoom,
  markers,
  onMarkerClick,
  draggable = false,
  onDragEnd,
  interactive = true,
  onAreaChange,
}: MapViewInnerProps) {
  const { containerRef, mapRef, mapReady } = useMap({
    center,
    zoom,
    interactive,
  })

  const map = mapReady ? mapRef.current : null

  // Clustered markers (for explore, collective, event-detail with multiple markers)
  useMapMarkers({
    map: !draggable && mode !== 'draw' ? map : null,
    markers,
    onMarkerClick,
    fitBounds: mode === 'explore' || mode === 'collective',
  })

  // Draggable pin (for event creation location picking)
  useDraggablePin({
    map: draggable ? map : null,
    center,
    onDragEnd,
  })

  // Drawing tools (for impact logging GPS polygons)
  useMapDraw({
    map: mode === 'draw' ? map : null,
    onAreaChange,
  })

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-[200px]"
      style={{ zIndex: 0 }}
    />
  )
}
