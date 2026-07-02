import { describe, it, expect } from 'vitest'
import {
  fetchImpactRows,
  applyBaselineRemainder,
  composeMaxRuleTotal,
  fullyContainedBaselineYears,
  nationalHistoricalRemainder,
  yearCellValue,
  composeSummaryMetrics,
  type CanonicalImpactRow,
  type ImpactClient,
} from '../../shared/impact-core'
import { excludeCancelledYoY } from '@/hooks/use-admin-impact-observations'
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

/* ------------------------------------------------------------------ */
/*  THE RULE - MAX(baseline, recorded)                                 */
/* ------------------------------------------------------------------ */

const y = (year: number, m = 0, d = 1) => new Date(year, m, d).toISOString()
// End-of-year bound matching how getDateRangeBounds forms a window end
// (inclusive to the final millisecond).
const eoy = (year: number) => new Date(year, 11, 31, 23, 59, 59, 999).toISOString()

describe('fullyContainedBaselineYears', () => {
  it('all-time (open bounds) fully contains every baseline year 2022-2025', () => {
    expect(fullyContainedBaselineYears(null, null)).toEqual([2022, 2023, 2024, 2025])
  })
  it('a full 2024 calendar window contains only 2024', () => {
    expect(fullyContainedBaselineYears(y(2024, 0, 1), eoy(2024))).toEqual([2024])
  })
  it('past FY (1 Jul 2024 - 30 Jun 2025) fully contains NO baseline year', () => {
    // Jul-Dec 2024 and Jan-Jun 2025 are both partial -> no full-year lump.
    expect(fullyContainedBaselineYears(y(2024, 6, 1), new Date(2025, 5, 30, 23, 59, 59, 999).toISOString())).toEqual([])
  })
  it('a granular FY (Jul 2025 - Jun 2026) fully contains NO baseline year', () => {
    expect(fullyContainedBaselineYears(y(2025, 6, 1), new Date(2026, 5, 30, 23, 59, 59, 999).toISOString())).toEqual([])
  })

  // Timezone off-by-one regression: window bounds are the exact ISO strings
  // getDateRangeBounds produces for a custom range (UTC 'YYYY-MM-DDT..Z'). A
  // start of EXACTLY 1 Jan of a baseline year must fully contain that year,
  // regardless of the host timezone (compared as calendar dates).
  it('custom 2022-01-01..2025-06-30 includes 2022,2023,2024 and excludes 2025', () => {
    expect(fullyContainedBaselineYears('2022-01-01T00:00:00.000Z', '2025-06-30T23:59:59.999Z'))
      .toEqual([2022, 2023, 2024])
  })
  it('custom 2022-01-01..2025-12-31 includes 2025 (whole 2025 contained)', () => {
    expect(fullyContainedBaselineYears('2022-01-01T00:00:00.000Z', '2025-12-31T23:59:59.999Z'))
      .toEqual([2022, 2023, 2024, 2025])
  })
  it('pre-year start 2021-06-01..2025-06-02 includes 2022,2023,2024 (unchanged)', () => {
    expect(fullyContainedBaselineYears('2021-06-01T00:00:00.000Z', '2025-06-02T23:59:59.999Z'))
      .toEqual([2022, 2023, 2024])
  })
  it('start exactly on Jan 1 is inclusive whether or not it has a time part', () => {
    expect(fullyContainedBaselineYears('2022-01-01', '2022-12-31')).toEqual([2022])
    expect(fullyContainedBaselineYears('2022-01-02T00:00:00.000Z', '2022-12-31T23:59:59.999Z')).toEqual([])
  })
})

describe('composeMaxRuleTotal (per-year MAX then sum - baseline-only years are NOT dropped)', () => {
  const fullAllTime = [2022, 2023, 2024, 2025]

  it('all-time trees compose per year to 56,941 (2022 baseline is NOT dropped)', () => {
    // Recorded by year (real event rows): 2024 estimate lumps 5,627; 2025 real
    // 15,940; 2026 real 18,074. 2022 and 2023 have ZERO event rows.
    const recordedByYear = { 2024: 5_627, 2025: 15_940, 2026: 18_074 }
    const r = composeMaxRuleTotal('trees', recordedByYear, fullAllTime)
    // 17,300(2022 baseline) + 0(2023 blank) + max(3,702,5,627)=5,627 +
    // max(15,635,15,940)=15,940 + 18,074(2026 recorded) = 56,941.
    expect(r.total).toBe(56_941)
    expect(r.flooredYears).toContain(2022) // baseline-only year survived
    expect(r.provenance).toBe('baseline')
  })

  it('all-time attendees include the pre-2025 national counts on top of recorded (per-year path)', () => {
    // Without the whole-history lump floor: per-year composition only.
    // 2025 real 3,154; 2026 real 2,546. Pre-2025 have no event attendee rows.
    const recordedByYear = { 2025: 3_154, 2026: 2_546 }
    const r = composeMaxRuleTotal('attendees', recordedByYear, fullAllTime)
    // 12(2022) + 250(2023) + 1,824(2024) + max(3,134,3,154)=3,154 + 2,546 = 7,786.
    expect(r.total).toBe(12 + 250 + 1_824 + 3_154 + 2_546)
    expect(r.flooredYears.sort()).toEqual([2022, 2023, 2024])
  })

  it('a baseline-only year is NEVER masked by a large recorded total (regression)', () => {
    // The bug: single grand max(totalRecorded 39,641, totalFloor 36,637) would
    // drop 2022's 17,300 entirely. Per-year composition keeps it.
    const recordedByYear = { 2024: 5_627, 2025: 15_940, 2026: 18_074 } // sum 39,641
    const r = composeMaxRuleTotal('trees', recordedByYear, fullAllTime)
    expect(r.total).toBeGreaterThan(39_641) // 56,941 - the 2022 lump is present
  })

  it('a partial-year / baseline-less window uses recorded only (Past FY unchanged)', () => {
    // fullYears empty (no fully-contained baseline year) -> recorded only.
    const recordedByYear = { 2025: 12_000, 2026: 16_024 } // sums 28,024
    const r = composeMaxRuleTotal('trees', recordedByYear, [])
    expect(r.total).toBe(28_024)
    expect(r.provenance).toBe('recorded')
  })

  it('2023 with no recorded rows is no-data, not zero and not a floor', () => {
    const r = composeMaxRuleTotal('trees', {}, [2023])
    expect(r.total).toBe(0)
    expect(r.provenance).toBe('no-data')
  })

  it('recorded stands alone for a baseline-less year (2026)', () => {
    const r = composeMaxRuleTotal('trees', { 2026: 18_074 }, [])
    expect(r.total).toBe(18_074)
    expect(r.provenance).toBe('recorded')
  })
})

describe('composeMaxRuleTotal dual floor (never below Kurt\'s whole-history lump)', () => {
  const fullAllTime = [2022, 2023, 2024, 2025]

  it('all-time attendees are floored by the 5,500 whole-history lump, not just per-year', () => {
    // Per-year composes to 7,786 (see per-year path test), but the regression
    // the coordinator caught is when per-year sums BELOW the lump. Force that
    // shape: tiny 2025 recorded so per-year (5,220) < lump 5,500. The lump
    // floor (5,500 + recorded 2026) must win. Prod baseline invariant: result
    // must be >= 8,008 with the real 2026 attendees (2,546 here -> 8,046).
    const recordedByYear = { 2025: 0, 2026: 2_546 }
    const r = composeMaxRuleTotal('attendees', recordedByYear, fullAllTime, 5_500)
    // per-year would be 12+250+1,824+max(3,134,0)=3,134 + 2,546 = 7,766;
    // lump alt = 5,500 + 2,546 = 8,046. per-year wins here (7,766 vs 8,046? no).
    // 8,046 > 7,766 so the lump floor applies.
    expect(r.total).toBe(8_046)
    expect(r.provenance).toBe('baseline')
    expect(r.total).toBeGreaterThanOrEqual(8_008) // never below prod
  })

  it('lump alternative = lump + recorded AFTER the baseline era (2026+ added on top)', () => {
    // trees lump 36,637 covers 2022-2025; 2026 recorded 18,074 is added on top.
    // But per-year trees (56,941) is higher, so per-year wins - dual floor is a
    // MAX, so the larger of the two always shows.
    const recordedByYear = { 2024: 5_627, 2025: 15_940, 2026: 18_074 }
    const r = composeMaxRuleTotal('trees', recordedByYear, fullAllTime, 36_637)
    expect(r.total).toBe(56_941) // per-year still wins; lump (36,637+18,074=54,711) lower
    expect(r.total).toBeGreaterThanOrEqual(36_637 + 18_074)
  })

  it('the lump floor does NOT apply to a partial window (2024 only)', () => {
    // A window containing only 2024 must not be floored by the 2022-2025 lump.
    const r = composeMaxRuleTotal('attendees', { 2024: 0 }, [2024], 5_500)
    expect(r.total).toBe(1_824) // 2024 national only, not the whole-era lump
  })

  it('the lump floor is a MAX - it never DOUBLE-adds on top of per-year', () => {
    // recorded huge in 2025 so per-year dominates; lump must not stack.
    const recordedByYear = { 2025: 50_000, 2026: 2_546 }
    const r = composeMaxRuleTotal('attendees', recordedByYear, fullAllTime, 5_500)
    // per-year = 12+250+1,824+max(3,134,50,000)=50,000 + 2,546 = 54,632.
    // lump alt = 5,500 + 2,546 = 8,046. MAX -> 54,632, not 54,632+8,046.
    expect(r.total).toBe(12 + 250 + 1_824 + 50_000 + 2_546)
  })
})

describe('By-collective reconciliation (collectives + national-historical == headline)', () => {
  const fullAllTime = [2022, 2023, 2024, 2025]

  it('trees: sum(collective rows) + national-historical remainder == headline', () => {
    // Headline all-time trees (per-year compose): 56,941.
    const headline = composeMaxRuleTotal('trees', { 2024: 5_627, 2025: 15_940, 2026: 18_074 }, fullAllTime, 36_637).total
    expect(headline).toBe(56_941)
    // Per-collective rows only carry the ATTRIBUTABLE recorded (2024 estimate
    // lumps 5,627 + 2025 real 15,940 + 2026 real 18,074 = 39,641). 2022's
    // 17,300 national baseline has no collective attribution.
    const sumOfCollectiveRows = 5_627 + 15_940 + 18_074 // 39,641
    const remainder = nationalHistoricalRemainder(headline, sumOfCollectiveRows)
    expect(remainder).toBe(17_300) // the 2022 national baseline lands in this row
    // The invariant the funder checks: the column ties out to the headline.
    expect(sumOfCollectiveRows + remainder).toBe(headline)
    expect(sumOfCollectiveRows + remainder).toBe(56_941)
  })

  it('attendees: collectives + national-historical remainder == headline', () => {
    // Headline all-time attendees (dual floor): 8,046.
    const headline = composeMaxRuleTotal('attendees', { 2025: 3_278, 2026: 2_546 }, fullAllTime, 5_500).total
    expect(headline).toBe(8_046)
    // Collective rows carry only the recorded 2025+2026 attendees (5,824).
    const sumOfCollectiveRows = 3_278 + 2_546 // 5,824
    const remainder = nationalHistoricalRemainder(headline, sumOfCollectiveRows)
    expect(sumOfCollectiveRows + remainder).toBe(headline)
    expect(remainder).toBe(2_222) // 12+250+1,824 nationals + the 5,500-lump top-up
  })

  it('remainder is clamped at zero (never negative when rows exceed headline)', () => {
    expect(nationalHistoricalRemainder(100, 150)).toBe(0)
  })
})

describe('excludeCancelledYoY (year table matches the headline)', () => {
  it('drops a cancelled event', () => {
    expect(excludeCancelledYoY({ events: { status: 'cancelled' } })).toBe(false)
  })
  it('keeps published and completed events', () => {
    expect(excludeCancelledYoY({ events: { status: 'published' } })).toBe(true)
    expect(excludeCancelledYoY({ events: { status: 'completed' } })).toBe(true)
  })
  it('keeps rows with an unknown/missing status (defensive default)', () => {
    expect(excludeCancelledYoY({ events: {} })).toBe(true)
    expect(excludeCancelledYoY({ events: null })).toBe(true)
  })
  it('a cancelled 80-tree 2026 event is excluded so 2026 is 18,074 not 18,154', () => {
    const rows = [
      { events: { status: 'completed' }, trees_planted: 18_074 },
      { events: { status: 'cancelled' }, trees_planted: 80 },
    ]
    const kept = rows.filter(excludeCancelledYoY)
    expect(sumMetric(kept as unknown as Record<string, unknown>[], 'trees_planted')).toBe(18_074)
  })
})

describe('yearCellValue (no-data sentinel: null-baseline + zero-recorded is NOT 0)', () => {
  it('null baseline + zero recorded -> null (2023 trees / rubbish: no data recorded)', () => {
    expect(yearCellValue(null, 0)).toBeNull()
    expect(yearCellValue(undefined, 0)).toBeNull()
  })
  it('null baseline + positive recorded -> recorded (tracked, no baseline)', () => {
    expect(yearCellValue(null, 42)).toBe(42)
  })
  it('present baseline + zero recorded -> a real (tracked) zero, not null', () => {
    // A baseline of 0 is a stated, tracked figure -> renders 0, not no-data.
    expect(yearCellValue(0, 0)).toBe(0)
  })
  it('present baseline + recorded takes the MAX (never below baseline)', () => {
    expect(yearCellValue(3_702, 5_627)).toBe(5_627) // 2024 trees: recorded wins
    expect(yearCellValue(15_635, 0)).toBe(15_635)   // baseline floors a zero-recorded year
  })
  it('the 2023 row: trees + rubbish are no-data, events/attendees are tracked', () => {
    // 2023 baselines: trees null, rubbish_kg null, events 24, attendees 250.
    expect(yearCellValue(null, 0)).toBeNull()   // trees -> no data
    expect(yearCellValue(null, 0)).toBeNull()   // rubbish -> no data
    expect(yearCellValue(24, 0)).toBe(24)       // events unchanged
    expect(yearCellValue(250, 0)).toBe(250)     // attendees unchanged
  })
})

/* ------------------------------------------------------------------ */
/*  composeSummaryMetrics - the ONE shared path every surface consumes */
/* ------------------------------------------------------------------ */

const WHOLE_HISTORY_LUMP = { trees: 36_637, rubbish_kg: 4_900, events: 340, attendees: 5_500, hours: 11_000 }

/** Build canonical rows: one row per event with its metrics for a given year. */
function rowsFor(spec: { year: number; eventId: string; attendees?: number; hours?: number; trees?: number }[]): CanonicalImpactRow[] {
  return spec.map((s) => ({
    year: s.year,
    eventId: s.eventId,
    attendees: s.attendees ?? 0,
    hours: s.hours ?? 0,
    metric: (key: string) => (key === 'trees_planted' ? (s.trees ?? 0) : 0),
  }))
}

describe('composeSummaryMetrics (insights headline is unchanged after extraction)', () => {
  // The all-time national dataset that reproduces the verified headline. One
  // event per (year, chunk) so the events-count reflects distinct ids.
  const allTimeRows: CanonicalImpactRow[] = [
    // 2024 estimate lumps: 11 events, 5,627 trees, 0 attendees, 7,272 hours.
    ...Array.from({ length: 11 }, (_, i) => ({
      year: 2024, eventId: `e24-${i}`,
      attendees: 0, hours: i === 0 ? 7_272 : 0,
      metric: (k: string) => (k === 'trees_planted' && i === 0 ? 5_627 : 0),
    })),
    // 2025 real: 203 events, 15,940 trees, 3,278 attendees, 10,648 hours.
    ...Array.from({ length: 203 }, (_, i) => ({
      year: 2025, eventId: `e25-${i}`,
      attendees: i === 0 ? 3_278 : 0, hours: i === 0 ? 10_648 : 0,
      metric: (k: string) => (k === 'trees_planted' && i === 0 ? 15_940 : 0),
    })),
    // 2026 real (non-cancelled): 147 events, 18,074 trees, 2,546 attendees, 8,781 hours.
    ...Array.from({ length: 147 }, (_, i) => ({
      year: 2026, eventId: `e26-${i}`,
      attendees: i === 0 ? 2_546 : 0, hours: i === 0 ? 8_781 : 0,
      metric: (k: string) => (k === 'trees_planted' && i === 0 ? 18_074 : 0),
    })),
  ]

  const nationalScope = {
    metricKeys: ['trees_planted'],
    applyNationalBaseline: true,
    effectiveStartIso: null,
    windowEndIso: '2026-12-31T23:59:59.999Z',
    lump: WHOLE_HISTORY_LUMP,
  }

  it('all-time national headline = trees 56,941 / attendances 8,046 / events 498 / hours 26,701', () => {
    const r = composeSummaryMetrics(allTimeRows, nationalScope)
    expect(r.metrics['trees_planted']).toBe(56_941)
    expect(r.totalAttendees).toBe(8_046)
    expect(r.totalEvents).toBe(498)
    expect(r.totalEstimatedHours).toBe(26_701)
  })

  it('FY25/26 (Jul 2025 - Jun 2026) trees = 28,024 (recorded-only, no baseline year)', () => {
    // Granular FY: no fully-contained baseline year -> pure recorded.
    const rows = rowsFor([
      { year: 2025, eventId: 'a', trees: 12_000 },
      { year: 2026, eventId: 'b', trees: 16_024 },
    ])
    const r = composeSummaryMetrics(rows, {
      metricKeys: ['trees_planted'],
      applyNationalBaseline: true,
      effectiveStartIso: '2025-07-01T00:00:00.000Z',
      windowEndIso: '2026-06-30T23:59:59.999Z',
      lump: WHOLE_HISTORY_LUMP,
    })
    expect(r.metrics['trees_planted']).toBe(28_024)
  })

  it('national all-time NEVER renders 0 even with EMPTY rows (floors to baseline)', () => {
    // Regression guard for the /impact/national + home national hero: with the
    // national all-time scope, even zero in-window rows must floor to the
    // stated baseline (2022-2025 per-year + whole-history lump), so a hero card
    // can never show 0 for a live national view. Trees = 17,300+0+3,702+15,635
    // = 36,637 (== the whole-history lump). Attendees floor 5,500, events 340.
    const r = composeSummaryMetrics([], nationalScope)
    expect(r.metrics['trees_planted']).toBe(36_637)
    expect(r.totalAttendees).toBe(5_500)
    expect(r.totalEvents).toBe(340)
    expect(r.metrics['trees_planted']).toBeGreaterThan(0)
  })
})

describe('cross-surface parity: identical rows+scope -> identical totals', () => {
  // Every consumer (insights, home, /admin, /admin/impact, public stats) builds
  // canonical rows from its own query then calls composeSummaryMetrics. Given
  // the SAME rows + scope, they MUST get identical numbers - this is the whole
  // point of the consolidation.
  const rows = rowsFor([
    { year: 2024, eventId: 'x', trees: 5_627 },
    { year: 2025, eventId: 'y', trees: 15_940, attendees: 3_278, hours: 10_648 },
    { year: 2026, eventId: 'z', trees: 18_074, attendees: 2_546, hours: 8_781 },
  ])
  const scope = {
    metricKeys: ['trees_planted'],
    applyNationalBaseline: true,
    effectiveStartIso: null,
    windowEndIso: '2026-12-31T23:59:59.999Z',
    lump: WHOLE_HISTORY_LUMP,
  }

  it('two independent calls with the same inputs are byte-identical', () => {
    const a = composeSummaryMetrics(rows, scope)
    const b = composeSummaryMetrics(rows, scope)
    expect(a).toEqual(b)
    expect(a.metrics['trees_planted']).toBe(56_941)
  })

  it('collective/activity scope returns recorded-only (no national floor)', () => {
    // Same rows, but scoped -> no baseline floor. 2022's 17,300 must NOT appear.
    const scoped = composeSummaryMetrics(rows, {
      metricKeys: ['trees_planted'],
      applyNationalBaseline: false,
      effectiveStartIso: null,
      windowEndIso: '2026-12-31T23:59:59.999Z',
    })
    // recorded trees only: 5,627 + 15,940 + 18,074 = 39,641.
    expect(scoped.metrics['trees_planted']).toBe(39_641)
    expect(scoped.totalEvents).toBe(3)
  })
})
