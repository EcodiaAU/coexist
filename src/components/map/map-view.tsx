import { Suspense, type ReactNode } from 'react'
import { MapPin as MapPinLucide } from 'lucide-react'
import { cn } from '@/lib/cn'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import type { MapCenter, MapMarker } from './use-map'
import type { AreaGeoJSON } from './map-draw'

/* ------------------------------------------------------------------ */
/*  Re-exports for consumer convenience                                */
/* ------------------------------------------------------------------ */

export type { MapCenter, MapMarker, MarkerVariant } from './use-map'
export type { AreaGeoJSON } from './map-draw'

/* ------------------------------------------------------------------ */
/*  Mode types                                                         */
/* ------------------------------------------------------------------ */

export type MapMode = 'explore' | 'event-detail' | 'collective' | 'draw'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface MapViewProps {
  /** Controls the map's behaviour and visible overlays */
  mode?: MapMode
  center?: MapCenter
  zoom?: number
  markers?: MapMarker[]
  onMarkerClick?: (id: string) => void
  /** Draggable single pin mode (for location picking) */
  draggable?: boolean
  onDragEnd?: (position: MapCenter) => void
  /** Disable zoom/pan interactions (mini-map mode) */
  interactive?: boolean
  /** Draw mode: callback when an area is drawn/edited/deleted */
  onAreaChange?: (area: AreaGeoJSON | null) => void
  loading?: boolean
  children?: ReactNode
  className?: string
  'aria-label'?: string
}

/* ------------------------------------------------------------------ */
/*  Lazy-loaded inner map (avoids Leaflet in main bundle)              */
/* ------------------------------------------------------------------ */

const MapViewInner = lazyWithRetry(() => import('./map-view-inner'))

/* ------------------------------------------------------------------ */
/*  Loading placeholder                                                */
/* ------------------------------------------------------------------ */

function MapPlaceholder({ className, ariaLabel }: { className?: string; ariaLabel: string }) {
  return (
    <div data-eos-id="src/components/map/map-view.tsx#0"
      role="status"
      aria-label={`Loading ${ariaLabel}`}
      className={cn(
        'relative w-full overflow-hidden rounded-md bg-white',
        className,
      )}
    >
      <div data-eos-id="src/components/map/map-view.tsx#1" className="absolute inset-0 animate-pulse">
        <div data-eos-id="src/components/map/map-view.tsx#2" className="h-full w-full bg-primary-200" />
      </div>
      <div data-eos-id="src/components/map/map-view.tsx#3" className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-2 text-neutral-400">
        <MapPinLucide data-eos-id="src/components/map/map-view.tsx#4" size={32} strokeWidth={1.5} aria-hidden="true" />
        <span data-eos-id="src/components/map/map-view.tsx#5" className="text-sm font-medium">Loading map...</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  MapView (public component)                                         */
/* ------------------------------------------------------------------ */

export function MapView({
  mode = 'event-detail',
  center,
  zoom = 13,
  markers,
  onMarkerClick,
  draggable = false,
  onDragEnd,
  interactive = true,
  onAreaChange,
  loading = false,
  children,
  className,
  'aria-label': ariaLabel = 'Map view',
}: MapViewProps) {
  if (loading) {
    return <MapPlaceholder data-eos-id="src/components/map/map-view.tsx#6" className={className} ariaLabel={ariaLabel} />
  }

  return (
    <div data-eos-id="src/components/map/map-view.tsx#7"
      role="region"
      aria-label={ariaLabel}
      className={cn(
        'relative w-full overflow-hidden rounded-md bg-white',
        className,
      )}
    >
      <Suspense data-eos-id="src/components/map/map-view.tsx#8" fallback={<MapPlaceholder data-eos-id="src/components/map/map-view.tsx#9" className="absolute inset-0" ariaLabel={ariaLabel} />}>
        <MapViewInner data-eos-id="src/components/map/map-view.tsx#10"
          mode={mode}
          center={center}
          zoom={zoom}
          markers={markers}
          onMarkerClick={onMarkerClick}
          draggable={draggable}
          onDragEnd={onDragEnd}
          interactive={interactive}
          onAreaChange={onAreaChange}
        />
      </Suspense>
      {children && (
        <div data-eos-id="src/components/map/map-view.tsx#11" className="absolute inset-0 z-[1000] pointer-events-none" aria-label="Map overlay">
          <div data-eos-id="src/components/map/map-view.tsx#12" className="pointer-events-auto">{children}</div>
        </div>
      )}
    </div>
  )
}
