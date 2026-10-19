import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Merri Mornings, 2026-10-04 (board 7fc10cdb). On a sign-ups-closed event
 * every member who checked themselves in was written as 'waitlisted' while
 * the app showed "You're checked in!": 21 such rows on that one morning.
 * The self check-in is an upsert, and the registration trigger judged it as
 * a fresh claim, so it also demoted a registered member's own seat.
 *
 * Two halves are pinned here, and either one reverted turns this file red:
 *   - the database (newest handle_event_registration migration) admits a
 *     member's own 'attended' write on the event day, refuses it on any
 *     other day, and passes a seat-holder's upsert through unchanged;
 *   - every self check-in path reads the status back and never reports a
 *     write that did not land as 'attended' as a check-in.
 */

const db = vi.hoisted(() => ({
  /** What the next event_registrations upsert reads back. */
  upsertResult: { data: [{ status: 'attended' }] as { status: string }[] | null, error: null as null | { code: string; message: string } },
  upserts: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase', () => {
  // A chainable, awaitable query builder. An upsert only yields its row when
  // the caller asks for it with .select(), exactly like PostgREST.
  function builder(table: string) {
    let op: 'select' | 'upsert' = 'select'
    let selected = false
    const b: Record<string, unknown> = {}
    const chain = () => b
    for (const m of ['eq', 'in', 'not', 'order', 'limit']) b[m] = chain
    b.select = () => { selected = true; return b }
    b.upsert = (row: Record<string, unknown>) => { op = 'upsert'; db.upserts.push(row); return b }
    b.maybeSingle = () => Promise.resolve({ data: null, error: null })
    b.single = () => Promise.resolve({ data: null, error: null })
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
      let v: unknown
      if (table === 'events') {
        v = { data: [{ id: 'e1', title: 'Merri Mornings', status: 'published', date_start: new Date().toISOString() }], error: null }
      } else if (op === 'upsert') {
        v = db.upsertResult.error
          ? { data: null, error: db.upsertResult.error }
          : { data: selected ? db.upsertResult.data : null, error: null }
      } else {
        v = { data: null, error: null }
      }
      return Promise.resolve(v).then(ok, bad)
    }
    return b
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      auth: {
        getSession: () => Promise.resolve({ data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } } }),
        refreshSession: () => Promise.resolve({ data: { session: {} }, error: null }),
      },
      functions: { invoke: vi.fn() },
      channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
      removeChannel: vi.fn(),
    },
  }
})
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOffline: false }) }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))

const { useCheckIn } = await import('@/hooks/use-events')
const { useCodeCheckIn } = await import('@/hooks/use-event-tickets')
const offline = await import('@/lib/offline-sync')
const { CHECK_IN_ERROR_MESSAGES, checkInErrorMessage, selfCheckInErrorKind } = await import('@/lib/constants/check-in')

const NOT_RECORDED = CHECK_IN_ERROR_MESSAGES.not_recorded

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  localStorage.clear()
  db.upserts.length = 0
  db.upsertResult = { data: [{ status: 'attended' }], error: null }
})

describe('the database records a self check-in on a sign-ups-closed event', () => {
  const dir = resolve(__dirname, '../..', 'supabase/migrations')
  const defining = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !/^\d{1,3}_/.test(f)) // 001_initial_schema / 999_backfill sort out of time order
    .sort()
    .filter((f) => /FUNCTION\s+(public\.)?handle_event_registration\s*\(/i.test(readFileSync(resolve(dir, f), 'utf8')))
  const newestFile = defining[defining.length - 1]
  const raw = readFileSync(resolve(dir, newestFile), 'utf8')
  // Comments stripped, so the explanation cannot satisfy its own pin.
  const body = raw
    .slice(raw.search(/FUNCTION\s+(public\.)?handle_event_registration\s*\(/i))
    .replace(/--[^\n]*/g, '')

  it('passes an upsert that collides with a seat-holder through unchanged', () => {
    expect(body).toMatch(
      /IF\s+TG_OP\s*=\s*'INSERT'\s+AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+event_registrations\s+x\s+WHERE\s+x\.event_id\s*=\s*NEW\.event_id\s+AND\s+x\.user_id\s*=\s*NEW\.user_id\s+AND\s+x\.status\s+IN\s*\(\s*'registered'\s*,\s*'attended'\s*\)\s*\)\s*THEN\s+RETURN\s+NEW;/i,
    )
  })

  it("admits a member's own 'attended' on the event day and refuses it on any other day", () => {
    const branch = /IF\s+v_external\s+IS\s+NOT\s+NULL\s+OR\s+v_closed\s+IS\s+TRUE\s+THEN([\s\S]*?)NEW\.status\s*:=\s*'waitlisted';/i.exec(body)?.[1]
    expect(branch, 'no combined closed/external branch in ' + newestFile).toBeTruthy()
    expect(branch).toMatch(/IF\s+NEW\.status\s*=\s*'attended'\s+THEN/i)
    expect(branch).toMatch(/v_event_day\s*>\s*v_today[\s\S]*?Check-in is not available before the day of the event/)
    expect(branch).toMatch(/v_event_day\s*<\s*v_today[\s\S]*?Post-event check-in is available to event leaders and admins only/)
    expect(branch).toMatch(/ERRCODE\s*=\s*'23514'/)
  })

  it('computes the event day exactly as the check-in window trigger does', () => {
    expect(body).toMatch(/\(e\.date_start AT TIME ZONE 'UTC'\)::date/)
    expect(body).toMatch(/\(now\(\) AT TIME ZONE COALESCE\(c\.timezone, 'Australia\/Sydney'\)\)::date/)
  })
})

describe('every self check-in path reads its status back', () => {
  it('useCheckIn (self) reports a write that landed as waitlisted', async () => {
    db.upsertResult = { data: [{ status: 'waitlisted' }], error: null }
    const { result } = renderHook(() => useCheckIn(), { wrapper })
    await expect(result.current.mutateAsync({ eventId: 'e1', userId: 'u1' })).rejects.toThrow(NOT_RECORDED)
  })

  it('useCheckIn (self) succeeds when the row reads attended', async () => {
    const { result } = renderHook(() => useCheckIn(), { wrapper })
    await expect(result.current.mutateAsync({ eventId: 'e1', userId: 'u1' })).resolves.toBeUndefined()
    expect(db.upserts[0]).toMatchObject({ status: 'attended', user_id: 'u1' })
  })

  it('useCodeCheckIn reports a write that landed as waitlisted', async () => {
    db.upsertResult = { data: [{ status: 'waitlisted' }], error: null }
    const { result } = renderHook(() => useCodeCheckIn(), { wrapper })
    await expect(result.current.mutateAsync({ checkInCode: 'ABC' })).rejects.toThrow(NOT_RECORDED)
  })

  it('useCodeCheckIn succeeds when the row reads attended', async () => {
    const { result } = renderHook(() => useCodeCheckIn(), { wrapper })
    await expect(result.current.mutateAsync({ checkInCode: 'ABC' })).resolves.toMatchObject({ eventId: 'e1', userId: 'u1' })
  })

  it('the legacy offline queue drops and reports a replay that landed as waitlisted', async () => {
    db.upsertResult = { data: [{ status: 'waitlisted' }], error: null }
    offline.queueOfflineCheckIn('e1', 'u1')
    const conflicts: string[] = []
    expect(await offline.syncOfflineCheckIns(conflicts)).toBe(0)
    expect(conflicts).toEqual([NOT_RECORDED])
    expect(offline.getPendingCheckInCount()).toBe(0)
  })

  it('the legacy offline queue drops a replay the database refuses for the day, and keeps a transient failure', async () => {
    db.upsertResult = { data: null, error: { code: '23514', message: 'Post-event check-in is available to event leaders and admins only.' } }
    offline.queueOfflineCheckIn('e1', 'u1')
    const conflicts: string[] = []
    expect(await offline.syncOfflineCheckIns(conflicts)).toBe(0)
    expect(conflicts).toEqual([NOT_RECORDED])
    expect(offline.getPendingCheckInCount()).toBe(0)

    db.upsertResult = { data: null, error: { code: 'PGRST301', message: 'timeout' } }
    offline.queueOfflineCheckIn('e2', 'u1')
    expect(await offline.syncOfflineCheckIns([])).toBe(0)
    expect(offline.getPendingCheckInCount()).toBe(1)
  })

  it('the legacy offline queue counts a replay that landed as attended', async () => {
    offline.queueOfflineCheckIn('e1', 'u1')
    const conflicts: string[] = []
    expect(await offline.syncOfflineCheckIns(conflicts)).toBe(1)
    expect(conflicts).toEqual([])
  })

  it('the action queue (processCheckIn, self) reports a replay that landed as waitlisted', async () => {
    db.upsertResult = { data: [{ status: 'waitlisted' }], error: null }
    offline.queueOfflineAction('check-in', { eventId: 'e1', userId: 'u1', isSelf: true, timestamp: new Date().toISOString() })
    const res = await offline.syncAllOfflineActions()
    expect(res.synced).toBe(0)
    expect(res.conflicts).toContain(NOT_RECORDED)
  })

  it('the action queue (processCheckIn, self) counts a replay that landed as attended', async () => {
    offline.queueOfflineAction('check-in', { eventId: 'e1', userId: 'u1', isSelf: true, timestamp: new Date().toISOString() })
    const res = await offline.syncAllOfflineActions()
    expect(res.synced).toBe(1)
    expect(res.conflicts).toEqual([])
  })
})

describe('the check-in screens name an unrecorded check-in', () => {
  it('maps the read-back failure and the day-window refusals', () => {
    expect(selfCheckInErrorKind(NOT_RECORDED)).toBe('not_recorded')
    expect(selfCheckInErrorKind('Check-in is not available before the day of the event. Event date: 2026-10-20, today: 2026-10-19.')).toBe('event_not_active')
    expect(selfCheckInErrorKind('Post-event check-in is available to event leaders and admins only.')).toBe('event_not_active')
    expect(selfCheckInErrorKind('boom')).toBe('generic')
  })

  it('reads the message of a PostgREST error, which supabase-js returns as a plain object', () => {
    // Live 2026-10-19: a check-in on the day before a closed event came back
    // 400 with the window message, and the page said "Something went wrong"
    // because `err instanceof Error` was false for the plain error object.
    const plain = { code: '23514', message: 'Check-in is not available before the day of the event. Event date: 2026-10-20, today: 2026-10-19.', details: null, hint: 'Wait until the event date to check attendees in.' }
    expect(checkInErrorMessage(plain)).toBe(plain.message)
    expect(selfCheckInErrorKind(checkInErrorMessage(plain))).toBe('event_not_active')
    expect(checkInErrorMessage(new Error(NOT_RECORDED))).toBe(NOT_RECORDED)
    expect(checkInErrorMessage(null)).toBe('')
    const page = readFileSync(resolve(__dirname, '../pages/events/check-in.tsx'), 'utf8')
    const sheet = readFileSync(resolve(__dirname, '../components/check-in-sheet.tsx'), 'utf8')
    for (const src of [page, sheet]) {
      expect(src).not.toMatch(/err instanceof Error \? err\.message/)
      expect(src.match(/checkInErrorMessage\(err\)/g)?.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('both screens route the read-back failure to its own message', () => {
    const page = readFileSync(resolve(__dirname, '../pages/events/check-in.tsx'), 'utf8')
    const sheet = readFileSync(resolve(__dirname, '../components/check-in-sheet.tsx'), 'utf8')
    expect(page).toMatch(/msg === CHECK_IN_ERROR_MESSAGES\.not_recorded\)\s*\{[\s\S]{0,200}setErrorKind\('not_recorded'\)/)
    expect(sheet.match(/selfCheckInErrorKind\(/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('event-day roster light mode', () => {
  it('does not count Not attending toward the light-rendering threshold', () => {
    const src = readFileSync(resolve(__dirname, '../pages/events/event-day.tsx'), 'utf8')
    const expr = /const lightRoster = ([\s\S]*?)> ROSTER_LIGHT_THRESHOLD/.exec(src)?.[1]
    expect(expr, 'lightRoster expression not found').toBeTruthy()
    expect(expr).toMatch(/groups\.checkedIn\.length/)
    expect(expr).not.toMatch(/notAttending/)
  })
})
