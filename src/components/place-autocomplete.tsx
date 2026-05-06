import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Loader2, WifiOff } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Input } from '@/components/input'
import { cn } from '@/lib/cn'
import { useOffline } from '@/hooks/use-offline'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PlaceResult {
  display_name: string
  lat: number
  lng: number
  /** Short label e.g. "Byron Bay, NSW" */
  short_name: string
}

export interface PlaceAutocompleteProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string, place: PlaceResult | null) => void
  /** Bias results to Australia by default */
  countryCode?: string
  icon?: React.ReactNode
  className?: string
  inputClassName?: string
  disabled?: boolean
  /** Compact mode - no floating label */
  compact?: boolean
}

/* ------------------------------------------------------------------ */
/*  Nominatim helpers                                                  */
/* ------------------------------------------------------------------ */

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
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
    county?: string
    municipality?: string
  }
}

function buildShortName(addr: NominatimResult['address']): string {
  const street =
    addr.road || addr.pedestrian || addr.footway || addr.cycleway || addr.path || ''
  const streetLine = addr.house_number && street
    ? `${addr.house_number} ${street}`
    : street
  const locality =
    addr.suburb || addr.city || addr.town || addr.village || addr.hamlet || addr.neighbourhood || addr.municipality || addr.county || ''
  const state = addr.state || ''

  const parts = [streetLine, locality, state].filter(Boolean)
  return parts.join(', ')
}

/* ------------------------------------------------------------------ */
/*  Recent results cache (localStorage, last 10)                       */
/* ------------------------------------------------------------------ */

const CACHE_KEY = 'coexist_place_cache'
const CACHE_MAX = 10

function getCachedResults(): PlaceResult[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as PlaceResult[]) : []
  } catch {
    return []
  }
}

function cacheResult(place: PlaceResult) {
  try {
    const existing = getCachedResults()
    // Deduplicate by lat/lng
    const filtered = existing.filter(
      (p) => !(p.lat === place.lat && p.lng === place.lng),
    )
    const updated = [place, ...filtered].slice(0, CACHE_MAX)
    localStorage.setItem(CACHE_KEY, JSON.stringify(updated))
  } catch {
    // Storage full - silently skip
  }
}

function searchCachedResults(query: string): PlaceResult[] {
  const q = query.toLowerCase()
  return getCachedResults().filter(
    (p) =>
      p.short_name.toLowerCase().includes(q) ||
      p.display_name.toLowerCase().includes(q),
  )
}

/* ------------------------------------------------------------------ */
/*  Nominatim fetch                                                    */
/* ------------------------------------------------------------------ */

async function searchPlaces(
  query: string,
  countryCode: string,
  signal: AbortSignal,
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '10',
    countrycodes: countryCode,
    dedupe: '0',
  })

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      signal,
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'CoExistApp/1.0 (hello@coexistaus.org)',
      },
    },
  )

  if (!res.ok) return []

  const data: NominatimResult[] = await res.json()

  const queryHasNumber = /\d/.test(query)

  const mapped = data.map((r) => ({
    display_name: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    short_name: buildShortName(r.address) || r.display_name.split(',').slice(0, 3).join(',').trim(),
    _hasHouseNumber: !!r.address.house_number,
  }))

  // When the user typed a number, surface results that actually have a
  // house number first - Nominatim otherwise mixes street-only matches in
  // and the picker grabs whichever comes first.
  if (queryHasNumber) {
    mapped.sort((a, b) => Number(b._hasHouseNumber) - Number(a._hasHouseNumber))
  }

  return mapped.map(({ _hasHouseNumber: _ignore, ...rest }) => rest)
}

/* ------------------------------------------------------------------ */
/*  Portal dropdown - escapes overflow:hidden parents                  */
/* ------------------------------------------------------------------ */

function DropdownPortal({
  anchorRef,
  open,
  results,
  highlightIndex,
  onSelect,
  onHighlight,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>
  open: boolean
  results: PlaceResult[]
  highlightIndex: number
  onSelect: (place: PlaceResult) => void
  onHighlight: (i: number) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  // Recalculate position when open or results change
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [open, results, anchorRef])

  // Also track scroll / resize while open
  useEffect(() => {
    if (!open || !anchorRef.current) return
    function update() {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef])

  return createPortal(
    <AnimatePresence>
      {open && results.length > 0 && (
        <motion.ul
          initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          role="listbox"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
          }}
          className="z-[9999] rounded-xl bg-white shadow-lg border border-neutral-100 overflow-hidden max-h-64 overflow-y-auto"
        >
          {results.map((place, i) => (
            <li
              key={`${place.lat}-${place.lng}-${i}`}
              role="option"
              aria-selected={i === highlightIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(place)
              }}
              onMouseEnter={() => onHighlight(i)}
              className={cn(
                'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors text-left',
                i === highlightIndex ? 'bg-neutral-50' : 'hover:bg-neutral-50',
              )}
            >
              <MapPin size={16} className="mt-0.5 shrink-0 text-neutral-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {place.short_name}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {place.display_name}
                </p>
              </div>
            </li>
          ))}
          <li className="px-4 py-1.5 text-[10px] text-neutral-400 text-right">
            Powered by OpenStreetMap
          </li>
        </motion.ul>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PlaceAutocomplete({
  label = 'Location',
  placeholder = 'Search for an address...',
  value,
  onChange,
  countryCode = 'au',
  icon,
  className,
  inputClassName,
  disabled,
  compact,
}: PlaceAutocompleteProps) {
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { isOffline } = useOffline()

  // Close dropdown on outside click / touch
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const doSearch = useCallback(
    (query: string) => {
      // Cancel previous
      abortRef.current?.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)

      if (query.trim().length < 2) {
        setResults([])
        setOpen(false)
        setLoading(false)
        return
      }

      // When offline, search cached results only
      if (isOffline) {
        const cached = searchCachedResults(query)
        setResults(cached)
        setOpen(cached.length > 0)
        setHighlightIndex(-1)
        setLoading(false)
        return
      }

      setLoading(true)

      debounceRef.current = setTimeout(async () => {
        const controller = new AbortController()
        abortRef.current = controller

        try {
          const places = await searchPlaces(query, countryCode, controller.signal)
          setResults(places)
          setOpen(places.length > 0)
          setHighlightIndex(-1)
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            setResults([])
            setOpen(false)
          }
        } finally {
          setLoading(false)
        }
      }, 350)
    },
    [countryCode, isOffline],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const val = e.target.value
      // Always accept freeform text - place is null until a suggestion is selected
      onChange(val, null)
      doSearch(val)
    },
    [onChange, doSearch],
  )

  const handleSelect = useCallback(
    (place: PlaceResult) => {
      onChange(place.short_name, place)
      cacheResult(place)
      setOpen(false)
      setResults([])
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || results.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => (i + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
      } else if (e.key === 'Enter' && highlightIndex >= 0) {
        e.preventDefault()
        handleSelect(results[highlightIndex])
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    },
    [open, results, highlightIndex, handleSelect],
  )

  return (
    <div ref={containerRef} className={cn('relative', className)} onKeyDown={handleKeyDown}>
      <Input
        label={label}
        compact={compact}
        placeholder={isOffline ? 'Type your location manually' : placeholder}
        value={value}
        onChange={handleInputChange}
        icon={
          loading ? (
            <Loader2 size={18} className="animate-spin text-neutral-400" />
          ) : isOffline ? (
            <WifiOff size={18} className="text-neutral-400" />
          ) : (
            icon ?? <MapPin size={18} />
          )
        }
        inputClassName={inputClassName}
        disabled={disabled}
        autoComplete="off"
      />

      {isOffline && value.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1 text-xs text-neutral-500 flex items-center gap-1.5">
          <WifiOff size={12} className="shrink-0" />
          No internet - type your location manually
        </p>
      )}

      <DropdownPortal
        anchorRef={containerRef}
        open={open}
        results={results}
        highlightIndex={highlightIndex}
        onSelect={handleSelect}
        onHighlight={setHighlightIndex}
      />
    </div>
  )
}
