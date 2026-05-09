import { useCallback, useEffect, useRef, useState } from 'react'
import type { MapCenter } from '@/components/map/use-map'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LocationSyncStatus =
  | 'idle'
  | 'searching'
  | 'no-result'
  | 'synced'

export interface NominatimReverseResult {
  display_name: string
  address: {
    house_number?: string
    road?: string
    pedestrian?: string
    footway?: string
    cycleway?: string
    path?: string
    neighbourhood?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    hamlet?: string
    state?: string
    postcode?: string
    country?: string
  }
}

interface NominatimForwardResult {
  lat: string
  lon: string
  display_name: string
  address?: NominatimReverseResult['address']
}

interface UseLocationSyncOpts {
  /** Current address text in the form */
  address: string
  /** Current pin lat in the form (null if unset) */
  lat: number | null
  /** Current pin lng in the form (null if unset) */
  lng: number | null
  /**
   * Apply a partial update to the form fields. The hook calls this when
   * forward-geocoding succeeds (lat/lng updates) or when reverse-geocoding
   * succeeds and the address is safe to overwrite.
   */
  onChange: (updates: { address?: string; lat?: number; lng?: number }) => void
  /** Country bias for Nominatim (default 'au'). */
  countryCode?: string
  /** Debounce window for forward-geocode after typing stops (ms). */
  debounceMs?: number
}

export interface LocationSyncReturn {
  /**
   * Pin-the-address sync status. 'searching' = forward-geocode in flight,
   * 'no-result' = address typed but Nominatim found nothing, 'synced' =
   * pin matches address, 'idle' = nothing to report.
   */
  status: LocationSyncStatus
  /**
   * Call this when the user types into the address text field. Resets the
   * debounce window. Pass `null` for `place` if the value came from free-typed
   * text; the hook will forward-geocode after `debounceMs`.
   */
  onAddressTyped: (value: string) => void
  /**
   * Call this when the user picks a Nominatim suggestion. The hook records
   * the chosen address as the "synced" baseline so subsequent pin drags can
   * decide whether to overwrite.
   */
  onAddressSelected: (value: string, place: { lat: number; lng: number }) => void
  /**
   * Call this when the user drags the pin. The hook reverse-geocodes and
   * pushes the resulting address back into the form IF it's safe to overwrite
   * (address is empty, or matches the last synced reverse-geocode). Otherwise
   * it surfaces a `pendingReverseAddress` for the consumer to render an
   * "Update address from pin?" affordance.
   */
  onPinDragged: (pos: MapCenter) => void
  /**
   * If the user dragged the pin but the form's address is a venue name we
   * don't want to clobber, this holds the reverse-geocoded street address
   * waiting for explicit user confirmation. Null when no pending overwrite.
   */
  pendingReverseAddress: string | null
  /** Accept the pending reverse-geocoded address into the form. */
  acceptPendingReverse: () => void
  /** Discard the pending reverse-geocoded address. */
  dismissPendingReverse: () => void
}

/* ------------------------------------------------------------------ */
/*  Nominatim helpers                                                  */
/* ------------------------------------------------------------------ */

const NOMINATIM_HEADERS: HeadersInit = {
  'Accept-Language': 'en',
  'User-Agent': 'CoExistApp/1.0 (hello@coexistaus.org)',
}

function buildShortNameFromAddress(addr: NominatimReverseResult['address']): string {
  const street =
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    addr.cycleway ||
    addr.path ||
    ''
  const streetLine =
    addr.house_number && street ? `${addr.house_number} ${street}` : street
  const locality =
    addr.suburb ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.neighbourhood ||
    ''
  const state = addr.state || ''
  const parts = [streetLine, locality, state].filter(Boolean)
  return parts.join(', ')
}

async function forwardGeocodeTopResult(
  query: string,
  countryCode: string,
  signal: AbortSignal,
): Promise<{ lat: number; lng: number; address: string } | null> {
  if (query.trim().length < 3) return null
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    addressdetails: '1',
    countrycodes: countryCode,
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { signal, headers: NOMINATIM_HEADERS },
  )
  if (!res.ok) return null
  const data = (await res.json()) as NominatimForwardResult[]
  if (!data.length) return null
  const top = data[0]
  const short = top.address
    ? buildShortNameFromAddress(top.address)
    : top.display_name.split(',').slice(0, 3).join(',').trim()
  return {
    lat: parseFloat(top.lat),
    lng: parseFloat(top.lon),
    address: short || top.display_name,
  }
}

async function reverseGeocodeCoords(
  lat: number,
  lng: number,
  signal: AbortSignal,
): Promise<{ address: string } | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
    addressdetails: '1',
    zoom: '18',
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params}`,
    { signal, headers: NOMINATIM_HEADERS },
  )
  if (!res.ok) return null
  const data = (await res.json()) as NominatimReverseResult
  if (!data) return null
  const short = buildShortNameFromAddress(data.address)
  return { address: short || data.display_name }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Bidirectional sync between an address text field and a draggable map pin.
 *
 * - User types address: after `debounceMs` of inactivity, top Nominatim hit
 *   moves the pin (lat/lng updated via `onChange`). On no-result, status
 *   flips to 'no-result' and the consumer can render a hint.
 * - User drags pin: Nominatim reverse-geocodes immediately. If the form's
 *   address is empty or matches a previously-synced reverse value, the
 *   address text auto-updates. Otherwise the new street address is held in
 *   `pendingReverseAddress` for explicit user acceptance, preserving any
 *   typed venue name (e.g. "Brisbane City Hall").
 */
export function useLocationSync({
  address,
  lat,
  lng,
  onChange,
  countryCode = 'au',
  debounceMs = 500,
}: UseLocationSyncOpts): LocationSyncReturn {
  const [status, setStatus] = useState<LocationSyncStatus>('idle')
  const [pendingReverseAddress, setPendingReverseAddress] =
    useState<string | null>(null)

  // Address text values that the hook itself wrote (so we can detect "is it
  // safe to overwrite" without clobbering a user-typed venue name).
  const lastSyncedAddressRef = useRef<string | null>(null)

  // In-flight controllers for forward / reverse geocode.
  const forwardAbortRef = useRef<AbortController | null>(null)
  const reverseAbortRef = useRef<AbortController | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The latest "owner" of the address text. 'user-typed' = freeform text
  // pending forward-geocode. 'pin-source' = address text was written by the
  // hook from a reverse-geocode. 'autocomplete' = user picked from dropdown.
  const addressOwnerRef = useRef<'user-typed' | 'pin-source' | 'autocomplete'>(
    'user-typed',
  )

  // Cancel everything on unmount.
  useEffect(() => {
    return () => {
      forwardAbortRef.current?.abort()
      reverseAbortRef.current?.abort()
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  /* ---- forward geocode (address -> pin) -------------------------- */

  const runForwardGeocode = useCallback(
    (query: string) => {
      forwardAbortRef.current?.abort()
      const controller = new AbortController()
      forwardAbortRef.current = controller
      setStatus('searching')

      forwardGeocodeTopResult(query, countryCode, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          if (!result) {
            setStatus('no-result')
            return
          }
          // Only push the pin update; do not overwrite the address text the
          // user is typing (we keep their phrasing).
          onChange({ lat: result.lat, lng: result.lng })
          // Record the sync baseline so a subsequent pin-drag knows whether
          // this address was hook-driven (safe to overwrite) or user-typed.
          lastSyncedAddressRef.current = query
          setStatus('synced')
        })
        .catch((err: unknown) => {
          if (
            err &&
            typeof err === 'object' &&
            'name' in err &&
            (err as { name: string }).name === 'AbortError'
          ) {
            return
          }
          setStatus('no-result')
        })
    },
    [countryCode, onChange],
  )

  const onAddressTyped = useCallback(
    (value: string) => {
      addressOwnerRef.current = 'user-typed'
      setPendingReverseAddress(null)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      if (value.trim().length < 3) {
        setStatus('idle')
        return
      }
      setStatus('searching')
      debounceTimerRef.current = setTimeout(() => {
        runForwardGeocode(value)
      }, debounceMs)
    },
    [debounceMs, runForwardGeocode],
  )

  const onAddressSelected = useCallback(
    (value: string, place: { lat: number; lng: number }) => {
      addressOwnerRef.current = 'autocomplete'
      lastSyncedAddressRef.current = value
      setPendingReverseAddress(null)
      setStatus('synced')
      // Cancel any pending forward-geocode triggered by mid-typing.
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      forwardAbortRef.current?.abort()
      onChange({ address: value, lat: place.lat, lng: place.lng })
    },
    [onChange],
  )

  /* ---- reverse geocode (pin -> address) -------------------------- */

  const onPinDragged = useCallback(
    (pos: MapCenter) => {
      // Always commit the new lat/lng first (cheap, local).
      onChange({ lat: pos.lat, lng: pos.lng })

      reverseAbortRef.current?.abort()
      const controller = new AbortController()
      reverseAbortRef.current = controller
      setStatus('searching')

      reverseGeocodeCoords(pos.lat, pos.lng, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          if (!result) {
            setStatus('no-result')
            return
          }
          const currentAddress = address.trim()
          const lastSynced = lastSyncedAddressRef.current?.trim() ?? null
          const safeToOverwrite =
            currentAddress.length === 0 ||
            (lastSynced !== null && currentAddress === lastSynced.trim()) ||
            addressOwnerRef.current === 'pin-source'

          if (safeToOverwrite) {
            addressOwnerRef.current = 'pin-source'
            lastSyncedAddressRef.current = result.address
            onChange({ address: result.address })
            setPendingReverseAddress(null)
            setStatus('synced')
          } else {
            // Preserve the user's venue name; surface the new street address
            // as a pending overwrite the consumer can accept.
            setPendingReverseAddress(result.address)
            setStatus('synced')
          }
        })
        .catch((err: unknown) => {
          if (
            err &&
            typeof err === 'object' &&
            'name' in err &&
            (err as { name: string }).name === 'AbortError'
          ) {
            return
          }
          setStatus('no-result')
        })
    },
    [address, onChange],
  )

  const acceptPendingReverse = useCallback(() => {
    if (!pendingReverseAddress) return
    addressOwnerRef.current = 'pin-source'
    lastSyncedAddressRef.current = pendingReverseAddress
    onChange({ address: pendingReverseAddress })
    setPendingReverseAddress(null)
  }, [pendingReverseAddress, onChange])

  const dismissPendingReverse = useCallback(() => {
    setPendingReverseAddress(null)
  }, [])

  // If the parent form changes lat/lng externally (e.g. event load on edit
  // page), record that as the new baseline so the next pin-drag doesn't
  // immediately fire a "pending overwrite" prompt against an unrelated
  // historical address.
  useEffect(() => {
    if (lat != null && lng != null && address && !lastSyncedAddressRef.current) {
      lastSyncedAddressRef.current = address
    }
    // We deliberately depend on lat/lng presence, not the values themselves;
    // the goal is one-time baseline capture on first hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat == null, lng == null])

  return {
    status,
    onAddressTyped,
    onAddressSelected,
    onPinDragged,
    pendingReverseAddress,
    acceptPendingReverse,
    dismissPendingReverse,
  }
}
