import { useEffect, useState } from 'react'

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` has
 * elapsed without a further change. Use to keep a rapidly-changing input (a
 * search box, a multi-select toggled several times in a row) from driving a
 * refetch on every keystroke/toggle.
 *
 * Objects/arrays are compared by reference, so pass a stable value (e.g. from
 * useState) - a new array literal every render would never settle.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}
