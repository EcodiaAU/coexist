'use client'

import dynamic from 'next/dynamic'
import type { CollectiveVM } from '@/lib/queries'

// Leaflet touches `window` at import, so load the map client-only (no SSR).
const Map = dynamic(() => import('./collective-map').then((m) => m.CollectiveMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-3xl bg-cream-soft text-sm text-neutral-400">
      Loading map…
    </div>
  ),
})

export function CollectiveMapClient(props: { collectives: CollectiveVM[]; className?: string }) {
  return <Map {...props} />
}
