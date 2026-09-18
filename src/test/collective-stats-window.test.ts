/**
 * Jess's quarterly report (2026-09-18): the collective and insights numbers
 * "had not changed since June". Nothing upstream was frozen; three defects on
 * the reading side made it look that way. These tests pin all three.
 *
 * 1. The collective "Past events" list filtered `.lt('date_end', now)`, which
 *    never matches a NULL date_end. End time is optional on the create form
 *    and most events since late May leave it blank, so every collective page
 *    stopped listing new past events around June.
 * 2. "This Quarter" was a rolling window from the 1st of the month three
 *    months back: in September it covered 1 Jun to today, so a Jul-Sep report
 *    carried June. It is now the calendar quarter, and "Last Quarter" is a
 *    closed window for the report just finished.
 * 3. The attendance figures used today as the end of every non-custom range,
 *    so a closed range (a financial year, last quarter) ran on past its end.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  calendarQuarterBounds,
  getDateRangeBounds,
  getDateRangeStart,
  dateRangeOptions,
} from '@/hooks/use-admin-dashboard'
import { isPastEvent, pastEventsOrFilter, DEFAULT_EVENT_DURATION_MS } from '@/hooks/use-events'
import type { Tables } from '@/types/database.types'

type Event = Tables<'events'>

/* ------------------------------------------------------------------ */
/*  Calendar quarters                                                  */
/* ------------------------------------------------------------------ */

describe('calendarQuarterBounds', () => {
  it('returns the calendar quarter containing the date, as floating-local UTC stamps', () => {
    expect(calendarQuarterBounds(new Date(2026, 8, 18))).toEqual({
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-09-30T23:59:59.999Z',
    })
  })

  it('offset -1 is last quarter (the Apr-Jun report when run in September)', () => {
    expect(calendarQuarterBounds(new Date(2026, 8, 18), -1)).toEqual({
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-06-30T23:59:59.999Z',
    })
  })

  it('wraps the year: last quarter from January is Oct-Dec of the previous year', () => {
    expect(calendarQuarterBounds(new Date(2026, 0, 5), -1)).toEqual({
      start: '2025-10-01T00:00:00.000Z',
      end: '2025-12-31T23:59:59.999Z',
    })
  })

  it('gets month lengths right at every quarter end, leap year included', () => {
    expect(calendarQuarterBounds(new Date(2028, 1, 29)).end).toBe('2028-03-31T23:59:59.999Z')
    expect(calendarQuarterBounds(new Date(2026, 4, 1)).end).toBe('2026-06-30T23:59:59.999Z')
    expect(calendarQuarterBounds(new Date(2026, 11, 31)).start).toBe('2026-10-01T00:00:00.000Z')
  })

  it('an evening event on the last day of the quarter is inside it', () => {
    const q3 = calendarQuarterBounds(new Date(2026, 8, 1))
    const lateOnLastDay = '2026-09-30T18:00:00.000Z' // 6pm wall-clock, stored as UTC
    expect(lateOnLastDay >= q3.start && lateOnLastDay <= q3.end).toBe(true)
    const firstOfNext = '2026-10-01T08:00:00.000Z'
    expect(firstOfNext <= q3.end).toBe(false)
  })
})

describe('date range dropdown', () => {
  afterEach(() => vi.useRealTimers())

  it('"This Quarter" in September starts 1 July, not 1 June', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 18, 12, 0, 0))
    expect(getDateRangeStart('quarter')).toBe('2026-07-01T00:00:00.000Z')
    // Open end: this quarter runs to now.
    expect(getDateRangeBounds('quarter').end).toBeNull()
  })

  it('"Last Quarter" is a closed window with its own end date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 18, 12, 0, 0))
    expect(getDateRangeBounds('past-quarter')).toEqual({
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-06-30T23:59:59.999Z',
    })
    expect(getDateRangeStart('past-quarter')).toBe('2026-04-01T00:00:00.000Z')
  })

  it('offers Last Quarter beside This Quarter', () => {
    const values = dateRangeOptions.map((o) => o.value)
    expect(values).toContain('past-quarter')
    expect(values.indexOf('past-quarter')).toBe(values.indexOf('quarter') + 1)
  })
})

/* ------------------------------------------------------------------ */
/*  Past events: the query filter must agree with isPastEvent          */
/* ------------------------------------------------------------------ */

/**
 * A tiny evaluator for the PostgREST `or` grammar pastEventsOrFilter emits
 * (comma-separated terms, `and(...)` groups, `col.lt.v` and `col.is.null`),
 * so the test checks what the filter SELECTS rather than how it is spelled.
 */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function evalTerm(term: string, row: Record<string, string | null>): boolean {
  if (term.startsWith('and(') && term.endsWith(')')) {
    return splitTopLevel(term.slice(4, -1)).every((t) => evalTerm(t, row))
  }
  const [col, op, ...rest] = term.split('.')
  const value = rest.join('.')
  const cell = row[col]
  if (op === 'is' && value === 'null') return cell === null
  if (op === 'lt') return cell !== null && new Date(cell).getTime() < new Date(value).getTime()
  throw new Error(`unhandled term ${term}`)
}

function selectedByOr(filter: string, row: Record<string, string | null>): boolean {
  return splitTopLevel(filter).some((t) => evalTerm(t, row))
}

function ev(date_start: string, date_end: string | null): Event {
  return { date_start, date_end } as unknown as Event
}

describe('pastEventsOrFilter', () => {
  const now = new Date('2026-09-18T12:00:00.000Z') // wall-clock-as-UTC

  const cases: Array<[string, Event]> = [
    ['NO end date, held weeks ago (Perth 15 Aug)', ev('2026-08-15T08:00:00.000Z', null)],
    ['NO end date, held this morning, over 3h ago', ev('2026-09-18T08:00:00.000Z', null)],
    ['NO end date, started an hour ago (still on)', ev('2026-09-18T11:00:00.000Z', null)],
    ['NO end date, tomorrow', ev('2026-09-19T16:00:00.000Z', null)],
    ['explicit end, ended in July', ev('2026-07-18T08:30:00.000Z', '2026-07-18T10:30:00.000Z')],
    ['explicit end, started but still running', ev('2026-09-18T09:00:00.000Z', '2026-09-18T15:00:00.000Z')],
    ['explicit end, multi-day campout ending next month', ev('2026-09-10T09:00:00.000Z', '2026-10-04T12:00:00.000Z')],
  ]

  it.each(cases)('agrees with isPastEvent: %s', (_label, event) => {
    const row = { date_start: event.date_start, date_end: event.date_end }
    expect(selectedByOr(pastEventsOrFilter(now), row)).toBe(isPastEvent(event, now))
  })

  it('selects the NULL-end events a bare date_end filter dropped', () => {
    const perthAug = { date_start: '2026-08-15T08:00:00.000Z', date_end: null }
    expect(selectedByOr(pastEventsOrFilter(now), perthAug)).toBe(true)
    // The old filter, evaluated by the same evaluator: it drops the row.
    expect(selectedByOr(`date_end.lt.${now.toISOString()}`, perthAug)).toBe(false)
  })

  it('uses the same default duration as isPastEvent for end-less events', () => {
    const cutoff = new Date(now.getTime() - DEFAULT_EVENT_DURATION_MS).toISOString()
    expect(pastEventsOrFilter(now)).toContain(`and(date_end.is.null,date_start.lt.${cutoff})`)
  })
})

describe('collective past-events query', () => {
  it('no longer filters past events on date_end alone', () => {
    const src = readFileSync(resolve(__dirname, '../hooks/use-collective.ts'), 'utf8')
    expect(src).not.toMatch(/\.lt\(\s*['"]date_end['"]/)
    expect(src).toMatch(/pastEventsOrFilter\(/)
  })
})
