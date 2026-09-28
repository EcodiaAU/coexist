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

// Move the router and the browser's live history entry together, the way a
// real navigation does (BrowserRouter keeps the entry key in history.state).
function enter(key: string, nav: 'POP' | 'PUSH' | 'REPLACE') {
  mockKey = key
  mockNavType = nav
  window.history.replaceState({ key }, '')
}

function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top
  el.dispatchEvent(new Event('scroll'))
}

describe('useScrollRestoration', () => {
  it('restores the saved position on POP back to the same history entry', () => {
    const ref = { current: document.createElement('div') }

    // Enter the list (PUSH): starts at top.
    enter('list', 'PUSH')
    const first = renderHook(() => useScrollRestoration(ref))
    expect(ref.current.scrollTop).toBe(0)

    // User scrolls the list, then navigates into a detail (unmount saves).
    scrollTo(ref.current, 640)
    first.unmount()

    // Back to the list entry (POP, same key): position restored.
    enter('list', 'POP')
    renderHook(() => useScrollRestoration(ref))
    expect(ref.current.scrollTop).toBe(640)
  })

  it('starts a forward (PUSH) navigation at the top, not a stale saved offset', () => {
    const ref = { current: document.createElement('div') }
    ref.current.scrollTop = 500 // pretend a prior offset lingers on the element

    enter('fresh-entry', 'PUSH')
    renderHook(() => useScrollRestoration(ref))
    expect(ref.current.scrollTop).toBe(0)
  })

  it('does not cross-restore between different history entries of the same path', () => {
    const refA = { current: document.createElement('div') }
    enter('entryA', 'PUSH')
    const a = renderHook(() => useScrollRestoration(refA))
    scrollTo(refA.current, 900)
    a.unmount()

    // A second entry for the same route (different key) must not inherit A's 900.
    const refB = { current: document.createElement('div') }
    enter('entryB', 'POP')
    renderHook(() => useScrollRestoration(refB))
    expect(refB.current.scrollTop).toBe(0)
  })

  it('jumps instantly on both restore and reset, overriding the CSS smooth scroll', () => {
    // globals.css sets scroll-behavior: smooth on every .overflow-y-auto
    // container, so anything but an explicit instant jump glides visibly.
    const calls: ScrollToOptions[] = []
    const withScrollTo = () => {
      const el = document.createElement('div')
      el.scrollTo = ((opts: ScrollToOptions) => { calls.push(opts); el.scrollTop = opts.top ?? 0 }) as typeof el.scrollTo
      return { current: el }
    }

    const ref = withScrollTo()
    enter('instant-list', 'PUSH')
    const first = renderHook(() => useScrollRestoration(ref))
    scrollTo(ref.current, 720)
    first.unmount()

    enter('instant-list', 'POP')
    const back = withScrollTo()
    renderHook(() => useScrollRestoration(back))
    expect(back.current.scrollTop).toBe(720)

    expect(calls.map(c => c.top)).toEqual([0, 720])
    expect(calls.every(c => c.behavior === 'instant')).toBe(true)
  })

  it('ignores scroll events that land after the browser has left the entry', () => {
    // Leaving admin events, the exit animation keeps the shell mounted while
    // the hero grows its back button and scroll anchoring moves the list 56px.
    const ref = { current: document.createElement('div') }
    enter('left-list', 'PUSH')
    const first = renderHook(() => useScrollRestoration(ref))
    scrollTo(ref.current, 1400)

    window.history.replaceState({ key: 'the-event' }, '') // navigation happened
    scrollTo(ref.current, 1456) // exit-animation reflow
    first.unmount()

    const back = { current: document.createElement('div') }
    enter('left-list', 'POP')
    renderHook(() => useScrollRestoration(back))
    expect(back.current.scrollTop).toBe(1400)
  })

  describe('while the page settles after a back swipe', () => {
    let frames: FrameRequestCallback[] = []
    const flush = () => { const run = frames; frames = []; run.forEach((f) => f(0)) }
    const flushAll = () => { for (let i = 0; i < 100 && frames.length; i++) flush() }

    beforeEach(() => {
      frames = []
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
      vi.stubGlobal('cancelAnimationFrame', () => {})
    })

    function returnTo(key: string, saved: number) {
      const ref = { current: document.createElement('div') }
      enter(key, 'PUSH')
      const first = renderHook(() => useScrollRestoration(ref))
      flushAll()
      scrollTo(ref.current, saved)
      first.unmount()
      const back = { current: document.createElement('div') }
      enter(key, 'POP')
      renderHook(() => useScrollRestoration(back))
      return back.current
    }

    it('holds the saved offset when content lands above it, with anchoring off, then lets go', () => {
      const el = returnTo('settle-list', 900)
      expect(el.style.overflowAnchor).toBe('none')
      flush()
      expect(el.scrollTop).toBe(900)

      el.scrollTop = 1320 // the admin hero arrives and anchoring drags the offset
      flush()
      expect(el.scrollTop).toBe(900)

      flushAll()
      expect(el.style.overflowAnchor).toBe('')
    })

    it('hands control straight back when the user touches the list', () => {
      const el = returnTo('touch-list', 900)
      flush()
      el.dispatchEvent(new Event('touchstart'))
      el.scrollTop = 500 // the user's own scroll
      flushAll()
      expect(el.scrollTop).toBe(500)
      expect(el.style.overflowAnchor).toBe('')
    })
  })
})
