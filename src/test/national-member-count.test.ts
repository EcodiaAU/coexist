import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The national member count (2026-10-07). After the profiles privacy fix anon has
 * no grant on public_profiles, so the old head count there answered 401 and blanked
 * every stat on the logged-out /download page. The count now comes from the
 * owner-rights RPC get_national_member_count, and a failure of that one number
 * degrades the Volunteers stat alone.
 */

const rpc = vi.fn()
const from = vi.fn()

/** A PostgREST-shaped builder: every filter returns itself, awaiting resolves `result`. */
function builder(result: unknown) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte']) b[m] = () => b
  b.single = () => Promise.resolve(result)
  b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad)
  return b
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (...a: unknown[]) => from(...a),
  },
}))
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/hooks/use-impact-metric-defs', () => ({ fetchActiveMetricKeys: vi.fn(async () => []) }))
vi.mock('@/lib/impact-query', () => ({
  fetchImpactRows: vi.fn(),
  fetchBaselineSettings: vi.fn(async () => null),
  fetchCanonicalImpactRows: vi.fn(async () => ({ rows: [], eventIds: [] })),
  composeSummaryMetrics: vi.fn(() => ({
    totalAttendees: 40,
    totalEstimatedHours: 120,
    totalEvents: 7,
    metrics: { trees_planted: 1500, rubbish_kg: 30, invasive_weeds_pulled: 0, coastline_cleaned_m: 0 },
  })),
  BASELINE_TREES: 0,
  BASELINE_RUBBISH_KG: 0,
  BASELINE_EVENTS: 0,
  BASELINE_ATTENDEES: 0,
  BASELINE_HOURS: 0,
}))

const { useNationalImpact } = await import('@/hooks/use-impact')

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

function wireTables() {
  from.mockImplementation((table: string) => {
    if (table === 'collectives') return builder({ count: 12, error: null })
    if (table === 'app_settings') return builder({ data: { value: { count: 87 } }, error: null })
    if (table === 'public_profiles') return builder({ count: null, error: { code: '42501', message: 'permission denied for view public_profiles' } })
    return builder({ data: [], error: null })
  })
}

describe('useNationalImpact member count', () => {
  beforeEach(() => {
    rpc.mockReset()
    from.mockReset()
    wireTables()
  })

  it('reads the national figure from get_national_member_count, never from public_profiles', async () => {
    rpc.mockResolvedValue({ data: 3344, error: null })
    const { result } = renderHook(() => useNationalImpact(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(rpc).toHaveBeenCalledWith('get_national_member_count')
    expect(from).not.toHaveBeenCalledWith('public_profiles')
    expect(result.current.data?.totalMembers).toBe(3344)
  })

  it('a failed member count degrades Volunteers alone; the other three stats still render', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useNationalImpact(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    warn.mockRestore()

    expect(result.current.isError).toBe(false)
    expect(result.current.data?.totalMembers).toBeNull()
    expect(result.current.data?.treesPlanted).toBe(1500)
    expect(result.current.data?.eventsHeld).toBe(7)
    expect(result.current.data?.collectivesCount).toBe(12)
  })
})

/* ------------------------------------------------------------------ */
/*  Drift guards                                                       */
/* ------------------------------------------------------------------ */

const root = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

describe('profiles privacy fix: app reads that must not regress', () => {
  it('no national count is taken over public_profiles', () => {
    const src = read('src/hooks/use-impact.ts')
    expect(src).not.toMatch(/from\('public_profiles'\)\s*\.select\([^)]*count/)
  })

  it('the cancellation mail never inner-joins its recipients to the directory view', () => {
    // public_profiles shows a leader only their co-members, so an inner join drops
    // every other recipient from the cancellation email without an error.
    expect(read('src/hooks/use-events.ts')).not.toContain('public_profiles!inner')
  })

  it('the count RPC is anon-executable and anon still has no grant on public_profiles', () => {
    const fn = read('supabase/migrations/20261007110000_national_member_count.sql')
    expect(fn).toMatch(/SECURITY DEFINER/)
    expect(fn).toMatch(/SET search_path TO 'public'/)
    expect(fn).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_national_member_count\(\) TO anon, authenticated;/)

    const view = read('supabase/migrations/20261007080800_profiles_directory_definer_view.sql')
    expect(view).toMatch(/REVOKE ALL ON public\.public_profiles FROM anon, authenticated;/)
    expect(view).toMatch(/GRANT SELECT ON public\.public_profiles TO authenticated;/)
    expect(view).not.toMatch(/GRANT[^;]*ON public\.public_profiles TO[^;]*anon/)
    expect(view).toMatch(/auth\.uid\(\) IS NOT NULL/)
  })
})
