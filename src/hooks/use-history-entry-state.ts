import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * useState that survives leaving and coming BACK to the same history entry.
 *
 * Tate (2026-09-28): on the admin events page, going into an event and swiping
 * back must land on the same filters, not the defaults. Opening an event
 * leaves the admin layout entirely, so the page unmounts and plain useState
 * starts over. This keeps the value against the router's location.key, the
 * same key useScrollRestoration uses, so:
 *   - back/forward to the SAME entry restores what was set there;
 *   - a fresh visit (a new entry, new key) starts from `initial`.
 *
 * Module memory, not sessionStorage: it only has to outlive a navigation
 * within one app session, and a cold start should begin clean.
 */
const store = new Map<string, unknown>()

export function useHistoryEntryState<T>(name: string, initial: T) {
  const { key } = useLocation()
  const storeKey = `${key}:${name}`
  const [value, setValue] = useState<T>(() =>
    store.has(storeKey) ? (store.get(storeKey) as T) : initial,
  )
  const set = useCallback(
    (next: T) => {
      store.set(storeKey, next)
      setValue(next)
    },
    [storeKey],
  )
  return [value, set] as const
}

/** Test seam: forget everything remembered. */
export function __resetHistoryEntryState() {
  store.clear()
}
