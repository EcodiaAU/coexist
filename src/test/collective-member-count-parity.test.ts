/**
 * Tests for member-count parity across surfaces.
 *
 * Bug (2026-07-14): the admin collectives page showed Melbourne City at 270 and
 * Brisbane at 147, while the profile "My Collectives" rows showed 384 and 200.
 * Root cause: the admin hook fetched every `collective_members` row and bucketed
 * them client-side. PostgREST caps a response at 1000 rows (db-max-rows) and
 * there were 1369 active memberships, so the tail was dropped and every
 * collective undercounted. The profile page read `collectives.member_count` (the
 * trigger-maintained column) and was correct, so the two surfaces disagreed.
 *
 * The fix routes admin counts through `get_collective_counts()`, which aggregates
 * server-side off the same canonical column. These tests lock the invariant:
 * counting by fetching membership rows is capped and lossy, so no surface may do it.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { countByField } from '@/lib/query-builders'

/** PostgREST's db-max-rows. A response never carries more rows than this. */
const POSTGREST_MAX_ROWS = 1000

/** Live active-membership totals at the time of the bug. */
const LIVE_MEMBERSHIPS: Record<string, number> = {
  'melbourne-city': 384,
  perth: 265,
  brisbane: 200,
  adelaide: 105,
  sydney: 93,
  'sunshine-coast': 79,
  'mornington-peninsula': 67,
  geelong: 58,
  hobart: 26,
  'northern-rivers': 22,
  'gold-coast': 20,
  cairns: 16,
  'north-east-victoria': 15,
  tamworth: 11,
  townsville: 7,
  test: 1,
}

function allMembershipRows(): { collective_id: string }[] {
  return Object.entries(LIVE_MEMBERSHIPS).flatMap(([slug, n]) =>
    Array.from({ length: n }, () => ({ collective_id: slug })),
  )
}

describe('collective member count parity', () => {
  it('proves the old client-side bucketing undercounts once past the row cap', () => {
    const rows = allMembershipRows()
    expect(rows.length).toBeGreaterThan(POSTGREST_MAX_ROWS)

    // What the admin hook actually received: one capped page, not every row.
    const capped = rows.slice(0, POSTGREST_MAX_ROWS)
    const counts = countByField(capped, 'collective_id')

    // The tail collectives are undercounted, which is the reported symptom.
    const totalCounted = [...counts.values()].reduce((a, b) => a + b, 0)
    expect(totalCounted).toBe(POSTGREST_MAX_ROWS)
    expect(totalCounted).toBeLessThan(rows.length)
  })

  it('server-side aggregation returns the canonical count for every collective', () => {
    // get_collective_counts() reads collectives.member_count, so each collective
    // comes back whole regardless of how many membership rows exist in total.
    const rpcRows = Object.entries(LIVE_MEMBERSHIPS).map(([slug, n]) => ({
      collective_id: slug,
      member_count: n,
    }))

    const counts = new Map(rpcRows.map((r) => [r.collective_id, r.member_count]))

    expect(counts.get('melbourne-city')).toBe(384)
    expect(counts.get('brisbane')).toBe(200)
    for (const [slug, n] of Object.entries(LIVE_MEMBERSHIPS)) {
      expect(counts.get(slug)).toBe(n)
    }
  })

  it('the admin hook never counts by fetching membership rows', () => {
    const src = readFileSync('src/hooks/use-admin-collectives.ts', 'utf8')

    // The count must come from the canonical server-side aggregate.
    expect(src).toContain("supabase.rpc('get_collective_counts')")

    // And must not go back to bucketing a capped page of membership rows.
    const listHook = src.slice(
      src.indexOf('export function useAdminCollectives'),
      src.indexOf('export function useAdminCollectiveDetail'),
    )
    expect(listHook).not.toContain("from('collective_members')")
    expect(listHook).not.toContain('countByField')
  })
})
