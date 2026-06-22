import { describe, it, expect } from 'vitest'
import {
  fetchImpactRows,
  applyBaselineRemainder,
  type ImpactClient,
} from '../../shared/impact-core'
import { sumMetric } from '../../shared/impact-metrics'

/**
 * The shared impact core is now client-injected so the Vite app and the
 * Next.js marketing site share one canonical aggregation. These tests pin
 * the injection contract and the live/legacy split using a minimal mock
 * Supabase query builder (no network).
 */

type Rows = Record<string, unknown>[]

/** Minimal chainable, thenable Supabase builder mock. */
function makeClient(tables: { event_impact?: { live: Rows; legacy: Rows } }): ImpactClient {
  function builder(table: string) {
    // The core fetches live rows via .or(...) and legacy rows via
    // .like('notes','Legacy import:%'), so .like is the discriminator.
    const state: { likePat?: string } = {}
    const b: Record<string, unknown> = {}
    const passthrough = () => b
    for (const m of ['select', 'in', 'eq', 'lt', 'gte', 'range', 'or']) b[m] = passthrough
    b.like = (_col: string, pat: string) => {
      state.likePat = pat
      return b
    }
    // Thenable: resolve with canned data for the table + which filter was used.
    b.then = (resolve: (v: { data: Rows; error: null }) => unknown) => {
      let data: Rows = []
      if (table === 'event_impact') {
        const t = tables.event_impact ?? { live: [], legacy: [] }
        data = state.likePat ? t.legacy : t.live
      }
      return Promise.resolve(resolve({ data, error: null }))
    }
    return b
  }
  return { from: (table: string) => builder(table) } as unknown as ImpactClient
}

describe('applyBaselineRemainder (pure)', () => {
  it('adds the remainder when legacy is below the baseline', () => {
    // live 100, legacy 10, baseline 50 -> 100 + 10 + max(0,50-10)=40 => 150
    expect(applyBaselineRemainder(100, 10, 50, true)).toBe(150)
  })
  it('uses truthful legacy once the baseline is surpassed', () => {
    // live 100, legacy 80, baseline 50 -> 100 + 80 + 0 => 180
    expect(applyBaselineRemainder(100, 80, 50, true)).toBe(180)
  })
  it('skips the baseline entirely when addBaseline=false', () => {
    expect(applyBaselineRemainder(100, 80, 50, false)).toBe(180)
  })
})

describe('fetchImpactRows (client-injected)', () => {
  const live: Rows = [
    { event_id: 'e1', trees_planted: 10, rubbish_kg: 5, notes: null },
    { event_id: 'e2', trees_planted: 4, rubbish_kg: 2, notes: 'normal log' },
  ]
  const legacy: Rows = [
    { event_id: 'e1', trees_planted: 999, rubbish_kg: 100, notes: 'Legacy import: 50 attendees' },
  ]

  it('returns only live rows by default and excludes legacy from rows', async () => {
    const client = makeClient({ event_impact: { live, legacy } })
    const res = await fetchImpactRows(client, { eventIds: ['e1', 'e2'] })
    expect(res.rows).toHaveLength(2)
    expect(res.legacyRows).toHaveLength(0)
    expect(res.eventCount).toBe(2)
    expect(sumMetric(res.rows, 'trees_planted')).toBe(14)
  })

  it('separates legacy rows when includeLegacy=true', async () => {
    const client = makeClient({ event_impact: { live, legacy } })
    const res = await fetchImpactRows(client, { eventIds: ['e1'], includeLegacy: true })
    expect(res.legacyRows).toHaveLength(1)
    expect(sumMetric(res.legacyRows, 'trees_planted')).toBe(999)
  })

  it('short-circuits to an empty result when no events match', async () => {
    const client = makeClient({ event_impact: { live, legacy } })
    const res = await fetchImpactRows(client, { eventIds: [] })
    expect(res.rows).toEqual([])
    expect(res.eventCount).toBe(0)
  })
})
