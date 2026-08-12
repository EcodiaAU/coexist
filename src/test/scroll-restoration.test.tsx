import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollRestoration } from '@/hooks/use-scroll-restoration'

/**
 * Deterministic proof of the scroll-restoration primitive's logic, independent
 * of the browser: a headless CDP diagnostic already confirmed the live scroll
 * container (#main-content) genuinely scrolls (range ~1286px on /profile) and
 * the hook attaches to that exact ref; this locks the save/restore behaviour
 * the hook is responsible for - restore only on POP, reset on PUSH, and
 * per-location.key scoping so distinct history entries do not cross-restore.
 */

let mockKey = 'k1'
let mockNavType: 'POP' | 'PUSH' | 'REPLACE' = 'PUSH'

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ key: mockKey, pathname: '/p', search: '', hash: '', state: null }),
  useNavigationType: () => mockNavType,
}))

beforeEach(() => {
  // Run rAF callbacks synchronously so save-throttle + restore-retry resolve
  // within the test tick.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top
  el.dispatchEvent(new Event('scroll'))
}

describe('useScrollRestoration', () => {
  it('restores the saved position on POP back to the same history entry', () => {
    const ref = { current: document.createElement('div') }

    // Enter the list (PUSH): starts at top.
    mockNavType = 'PUSH'; mockKey = 'list'
    const first = renderHook(() => useScrollRestoration(ref))
    expect(ref.current.scrollTop).toBe(0)

    // User scrolls the list, then navigates into a detail (unmount saves).
    scrollTo(ref.current, 640)
    first.unmount()

    // Back to the list entry (POP, same key): position restored.
    mockNavType = 'POP'; mockKey = 'list'
    renderHook(() => useScrollRestoration(ref))
    expect(ref.current.scrollTop).toBe(640)
  })

  it('starts a forward (PUSH) navigation at the top, not a stale saved offset', () => {
    const ref = { current: document.createElement('div') }
    ref.current.scrollTop = 500 // pretend a prior offset lingers on the element

    mockNavType = 'PUSH'; mockKey = 'fresh-entry'
    renderHook(() => useScrollRestoration(ref))
    expect(ref.current.scrollTop).toBe(0)
  })

  it('does not cross-restore between different history entries of the same path', () => {
    const refA = { current: document.createElement('div') }
    mockNavType = 'PUSH'; mockKey = 'entryA'
    const a = renderHook(() => useScrollRestoration(refA))
    scrollTo(refA.current, 900)
    a.unmount()

    // A second entry for the same route (different key) must not inherit A's 900.
    const refB = { current: document.createElement('div') }
    mockNavType = 'POP'; mockKey = 'entryB'
    renderHook(() => useScrollRestoration(refB))
    expect(refB.current.scrollTop).toBe(0)
  })
})
