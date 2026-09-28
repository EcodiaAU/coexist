import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, renderHook } from '@testing-library/react'
import { useHistoryEntryState, __resetHistoryEntryState } from '@/hooks/use-history-entry-state'

/**
 * Tate 2026-09-28: on the admin events page, open an event, swipe back, and
 * land in the same place with the same filters. Opening an event leaves the
 * admin layout, so both the page and the layout's scroll container remount.
 */

let mockKey = 'list-1'
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ key: mockKey, pathname: '/admin/events', search: '', hash: '', state: null }),
}))

beforeEach(() => {
  __resetHistoryEntryState()
  mockKey = 'list-1'
})

describe('useHistoryEntryState', () => {
  it('gives the filters back when the same history entry remounts (swipe back)', () => {
    const first = renderHook(() => useHistoryEntryState<'upcoming' | 'past'>('status', 'upcoming'))
    act(() => first.result.current[1]('past'))
    expect(first.result.current[0]).toBe('past')
    first.unmount() // tapped into an event: the admin page is gone

    const back = renderHook(() => useHistoryEntryState<'upcoming' | 'past'>('status', 'upcoming'))
    expect(back.result.current[0]).toBe('past')
  })

  it('starts from the default on a fresh visit (a new history entry)', () => {
    const first = renderHook(() => useHistoryEntryState('search', ''))
    act(() => first.result.current[1]('myall'))
    first.unmount()

    mockKey = 'list-2'
    const fresh = renderHook(() => useHistoryEntryState('search', ''))
    expect(fresh.result.current[0]).toBe('')
  })

  it('keeps separate values per name on the same entry', () => {
    const a = renderHook(() => useHistoryEntryState('search', ''))
    const b = renderHook(() => useHistoryEntryState('status', 'upcoming'))
    act(() => a.result.current[1]('grampians'))
    expect(b.result.current[0]).toBe('upcoming')
  })
})

describe('admin events back-nav wiring', () => {
  const layout = readFileSync('src/components/admin-layout.tsx', 'utf8')
  const page = readFileSync('src/pages/admin/events.tsx', 'utf8')

  it('the admin scroll container restores its position per history entry', () => {
    expect(layout).toMatch(/useScrollRestoration\(scrollRef\)/)
  })

  it('the layout no longer forces the top on every route change (that undid the restore)', () => {
    expect(layout).not.toMatch(/scrollRef\.current\?\.scrollTo\(\{ top: 0/)
  })

  it('search and status filter are remembered per history entry', () => {
    expect(page).toMatch(/useHistoryEntryState\('admin-events-search', ''\)/)
    expect(page).toMatch(/useHistoryEntryState<StatusFilter>\('admin-events-status', 'upcoming'\)/)
  })

  it('a remounted admin shell paints the hero it last showed on its first frame', () => {
    // Seeded from the cache, but the route still decides fullBleed on the first frame.
    expect(layout).toMatch(/\(\) => \(\{ \.\.\.\(lastHeaderByPath\.get\(location\.pathname\) \?\? \{ title: '' \}\), fullBleed: isFullBleedRoute \}\)/)
    expect(layout).toMatch(/if \(pathRef\.current\.startsWith\('\/admin'\)\) lastHeaderByPath\.set\(pathRef\.current, opts\)/)
  })
})
