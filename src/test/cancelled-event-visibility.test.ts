import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  isEventGone,
  rsvpBlockedForEvent,
  landingAfterCancel,
  canReadCancelledEvents,
  RLS_ADMIN_ROLES,
  splitTicketsByEventDate,
} from '@/lib/cancelled-event'

/**
 * Cancelled events are admin-only in RLS (migration 20261009120000, reported by
 * Jess on 2026-10-09: a Melbourne City assist_leader still saw the cancelled
 * Organ Pipes Nature Hike). For a member or collective leader a cancelled event
 * reads as null; an admin still reads it with status 'cancelled'. These tests
 * pin the client side of both shapes.
 */

/* ------------------------------------------------------------------ */
/*  Pure rules                                                         */
/* ------------------------------------------------------------------ */

describe('cancelled-event rules', () => {
  it('an event is gone when RLS hid it (null) or it is cancelled', () => {
    expect(isEventGone(null)).toBe(true)
    expect(isEventGone(undefined)).toBe(true)
    expect(isEventGone({ status: 'cancelled' })).toBe(true)
    expect(isEventGone({ status: 'published' })).toBe(false)
    expect(isEventGone({ status: 'draft' })).toBe(false)
  })

  it('an RSVP is refused only once the event lookup has resolved', () => {
    // In flight: the caller routes to the event page, which knows more.
    expect(rsvpBlockedForEvent(false, null)).toBe(false)
    // Resolved to null: hidden by RLS (a cancelled event, for a non-admin).
    expect(rsvpBlockedForEvent(true, null)).toBe(true)
    // An admin reads the cancelled row itself.
    expect(rsvpBlockedForEvent(true, { status: 'cancelled' })).toBe(true)
    expect(rsvpBlockedForEvent(true, { status: 'published' })).toBe(false)
  })

  it('a non-admin leader leaves the event they cancelled; an admin stays on the banner', () => {
    for (const role of ['participant', 'assist_leader', 'co_leader', 'leader', null, undefined]) {
      expect(landingAfterCancel(role)).toBe('/leader/events')
    }
    for (const role of ['national_leader', 'manager', 'admin']) {
      expect(landingAfterCancel(role)).toBeNull()
    }
  })

  it('the client admin set mirrors is_admin_or_staff, not useAuth().isStaff', () => {
    // isStaff is rank >= 3 and so includes the global 'leader' role, which RLS
    // hides cancelled events from. Using it would strand those leaders.
    expect(canReadCancelledEvents('leader')).toBe(false)
    expect([...RLS_ADMIN_ROLES].sort()).toEqual(['admin', 'manager', 'national_leader'])
  })

  it('My Tickets drops event-less tickets, so the empty state can read the rendered sets', () => {
    const now = new Date('2026-10-09T00:00:00Z')
    const tickets = [
      { id: 'a', event_date: '2026-10-20T09:00:00Z' },
      { id: 'b', event_date: '2026-09-01T09:00:00Z' },
      { id: 'c', event_date: null },
    ]
    const { upcoming, past } = splitTicketsByEventDate(tickets, now)
    expect(upcoming.map((t) => t.id)).toEqual(['a'])
    expect(past.map((t) => t.id)).toEqual(['b'])

    // A member whose only tickets are for cancelled events: both sets empty,
    // which is what flips the page to the empty state instead of a blank page.
    const onlyCancelled = splitTicketsByEventDate([{ event_date: null }, { event_date: null }], now)
    expect(onlyCancelled.upcoming.length + onlyCancelled.past.length).toBe(0)
    expect(splitTicketsByEventDate(undefined, now)).toEqual({ upcoming: [], past: [] })
  })
})

/* ------------------------------------------------------------------ */
/*  Admin reads: the hooks filter cancelled rows themselves           */
/* ------------------------------------------------------------------ */

type Call = [string, unknown[]]
let calls: Record<string, Call[]> = {}
let results: Record<string, unknown> = {}

/** A PostgREST-shaped builder that records every filter call per table. */
function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'in', 'or', 'order', 'limit', 'gte', 'lte', 'not', 'is']) {
    b[m] = (...args: unknown[]) => {
      ;(calls[table] ??= []).push([m, args])
      return b
    }
  }
  const result = () => results[table] ?? { data: [], error: null }
  b.maybeSingle = () => Promise.resolve(result())
  b.single = () => Promise.resolve(result())
  b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad)
  return b
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}))
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'admin-1' }, isStaff: true }) }))
vi.mock('@/lib/leader-event-scope', () => ({ fetchHostedEventIds: vi.fn(async () => ['e1', 'e2']) }))

const { useMyUpcomingEvents } = await import('@/hooks/use-home-feed')
const { useEventCalendar } = await import('@/hooks/use-leader-dashboard')
const { useMyEvents } = await import('@/hooks/use-events')

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

const hasCall = (table: string, method: string, args: unknown[]) =>
  (calls[table] ?? []).some(([m, a]) => m === method && JSON.stringify(a) === JSON.stringify(args))

describe('admin views exclude cancelled events', () => {
  beforeEach(() => {
    calls = {}
    results = {}
  })

  it('Home "Your upcoming events" filters the inner events embed on status', async () => {
    const { result } = renderHook(() => useMyUpcomingEvents(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(hasCall('event_registrations', 'neq', ['events.status', 'cancelled'])).toBe(true)
  })

  it('the leader calendar excludes cancelled events', async () => {
    const { result } = renderHook(() => useEventCalendar('c1', new Date(2026, 9, 1)), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(hasCall('events', 'neq', ['status', 'cancelled'])).toBe(true)
  })

  it.each(['upcoming', 'invited', 'past'] as const)('My Events %s drops cancelled and hidden events', async (tab) => {
    const future = '2099-01-01T09:00:00Z'
    const past = '2020-01-01T09:00:00Z'
    const date = tab === 'past' ? past : future
    results.event_registrations = {
      data: [
        { id: 'r1', status: 'registered', events: { id: 'live', status: 'published', date_start: date, date_end: null } },
        { id: 'r2', status: 'registered', events: { id: 'gone', status: 'cancelled', date_start: date, date_end: null } },
        { id: 'r3', status: 'registered', events: null },
      ],
      error: null,
    }
    const { result } = renderHook(() => useMyEvents(tab), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const ids = (result.current.data ?? []).map((r) => (r as { id: string }).id)
    expect(ids).not.toContain('gone')
    expect(ids).toContain('live')
  })
})

/* ------------------------------------------------------------------ */
/*  Drift guards: the pages still route through the rules above       */
/* ------------------------------------------------------------------ */

const { readFileSync, readdirSync } = await import('node:fs')
const { resolve } = await import('node:path')
const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')

describe('cancelled-event wiring', () => {
  it('My Tickets computes its empty state from the rendered sets, not the raw ticket count', () => {
    const src = read('src/pages/events/my-tickets.tsx')
    expect(src).toContain('splitTicketsByEventDate(tickets)')
    expect(src).toContain('upcoming.length + past.length === 0')
    expect(src).not.toContain('!tickets?.length')
  })

  it('the announcement Going button refuses a cancelled or hidden event', () => {
    expect(read('src/pages/chat/chat-message-list.tsx')).toContain('rsvpBlockedForEvent(eventResolved, eventDetail)')
  })

  it('a leader who cancels is moved off the event they can no longer read', () => {
    expect(read('src/pages/events/event-detail.tsx')).toContain('landingAfterCancel(globalRole)')
  })
})

describe('RLS_ADMIN_ROLES parity with the database', () => {
  it('matches the role set in the newest is_admin_or_staff definition', () => {
    const dir = resolve(__dirname, '../..', 'supabase/migrations')
    const defining = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => /FUNCTION\s+(public\.)?is_admin_or_staff\s*\(/i.test(readFileSync(resolve(dir, f), 'utf8')))
    const newest = readFileSync(resolve(dir, defining[defining.length - 1]), 'utf8')
    const body = newest.slice(newest.search(/FUNCTION\s+(public\.)?is_admin_or_staff\s*\(/i))
    const roles = /role::text\s+IN\s*\(([^)]*)\)/i.exec(body)?.[1]
    expect(roles, 'could not read the role list from ' + defining[defining.length - 1]).toBeTruthy()
    const dbRoles = [...roles!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(dbRoles).toEqual([...RLS_ADMIN_ROLES].sort())
  })
})
