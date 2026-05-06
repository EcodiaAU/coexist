// excel-sync gate-logic contract tests.
//
// Run with: `npm test -- excel-sync-gate-logic`
//
// These tests pin the symmetric-selector invariant between the to-excel push
// path and the from-excel reconciliation path of the excel-sync Edge Function
// at supabase/functions/excel-sync/index.ts. They MUST pass before any
// excel-sync deploy. The bug fixed in fork_motntxi7_add578 (2026-05-06) was
// caused by these two selectors drifting: push only included status='completed'
// while reconciliation included both 'published'+'completed', so reconciliation
// cancelled events the push path never made eligible.
//
// The tests use plain predicate functions that mirror the production filters
// in index.ts. If you change the production filters, update the predicates
// here in lockstep AND keep the contract asserts unchanged.

import { describe, it, expect } from 'vitest'

// SYNC_CUTOFF_DATE must match index.ts. Hardcoded literal here is intentional
// (test isolation - we don't want a typo in index.ts to silently change the
// test contract).
const SYNC_CUTOFF_DATE = '2026-05-04'

interface CandidateEvent {
  id: string
  status: 'draft' | 'published' | 'completed' | 'cancelled'
  date_start: string // ISO
  created_at: string // ISO
  collective_forms_migrated_at: string | null // ISO or null
}

/** Mirrors syncToExcel batch-mode filter (index.ts ~line 777-790). */
function isPushEligible(e: CandidateEvent): boolean {
  if (!['published', 'completed'].includes(e.status)) return false
  if (e.date_start < SYNC_CUTOFF_DATE) return false
  if (!e.collective_forms_migrated_at) return false
  if (new Date(e.date_start) < new Date(e.collective_forms_migrated_at)) return false
  return true
}

/** Mirrors syncFromExcel reconciliation candidate filter (index.ts ~line 1262-1290).
 *  Pre-grace-window check; the seenEventIds and grace-period guards are
 *  applied in addition by the production code. This predicate only captures
 *  the SQL-level + JS gate filtering. */
function isReconciliationCandidate(
  e: CandidateEvent,
  runStartedAt: Date,
  graceMs: number,
): boolean {
  if (!['published', 'completed'].includes(e.status)) return false
  if (e.date_start < SYNC_CUTOFF_DATE) return false
  if (!e.collective_forms_migrated_at) return false
  if (new Date(e.date_start) < new Date(e.collective_forms_migrated_at)) return false
  // Grace period - event must be older than `graceMs` to be a candidate.
  if (new Date(e.created_at).getTime() >= runStartedAt.getTime() - graceMs) return false
  return true
}

const SC_MIGRATED = '2026-05-04T00:00:00+00:00'
const NOW = new Date('2026-05-06T03:00:00+00:00')
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

describe('excel-sync gate-logic contract (fork_motntxi7_add578 fix)', () => {
  describe('Symmetric-selector invariant', () => {
    it('every reconciliation candidate must also be push-eligible', () => {
      // The reconciliation predicate must be a SUBSET of the push predicate
      // modulo the grace-period gate. Concretely: if X is reconciled (after grace),
      // X must also be push-eligible. Otherwise reconciliation cancels rows the
      // push path never wrote = the bug.
      const fixtures: CandidateEvent[] = [
        { id: 'p-sc', status: 'published', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-04T00:00:00+00:00', collective_forms_migrated_at: SC_MIGRATED },
        { id: 'c-sc', status: 'completed', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-04T00:00:00+00:00', collective_forms_migrated_at: SC_MIGRATED },
        { id: 'p-future', status: 'published', date_start: '2026-07-04T00:00:00+00:00', created_at: '2026-04-23T00:00:00+00:00', collective_forms_migrated_at: SC_MIGRATED },
      ]
      for (const e of fixtures) {
        if (isReconciliationCandidate(e, NOW, TWO_HOURS_MS)) {
          expect(isPushEligible(e), `event ${e.id} is reconciliation candidate but NOT push-eligible - selectors drifted`).toBe(true)
        }
      }
    })
  })

  describe('Push direction: app-created event flow for activated collectives', () => {
    it('published event for migrated collective IS push-eligible', () => {
      expect(
        isPushEligible({ id: 'mary', status: 'published', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-06T01:57:00+00:00', collective_forms_migrated_at: SC_MIGRATED }),
      ).toBe(true)
    })

    it('completed event for migrated collective IS push-eligible', () => {
      expect(
        isPushEligible({ id: 'c1', status: 'completed', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-06T01:57:00+00:00', collective_forms_migrated_at: SC_MIGRATED }),
      ).toBe(true)
    })

    it('draft event for migrated collective is NOT push-eligible', () => {
      expect(
        isPushEligible({ id: 'd1', status: 'draft', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-06T01:57:00+00:00', collective_forms_migrated_at: SC_MIGRATED }),
      ).toBe(false)
    })

    it('cancelled event for migrated collective is NOT push-eligible', () => {
      expect(
        isPushEligible({ id: 'x1', status: 'cancelled', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-06T01:57:00+00:00', collective_forms_migrated_at: SC_MIGRATED }),
      ).toBe(false)
    })

    it('event for non-migrated collective is NOT push-eligible', () => {
      expect(
        isPushEligible({ id: 'b1', status: 'published', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-06T01:57:00+00:00', collective_forms_migrated_at: null }),
      ).toBe(false)
    })

    it('event before cutoff date is NOT push-eligible', () => {
      expect(
        isPushEligible({ id: 'pre', status: 'published', date_start: '2026-04-30T00:00:00+00:00', created_at: '2026-04-30T00:00:00+00:00', collective_forms_migrated_at: SC_MIGRATED }),
      ).toBe(false)
    })
  })

  describe('Reconciliation: grace-period guard prevents race-cancellation', () => {
    it('event created 2.5 minutes ago is NOT a reconciliation candidate (Mary Cairncross original bug case)', () => {
      // Mary Cairncross original bug: created 01:57:56, cancelled 02:00:29 (2.5 min later)
      const tooFresh: CandidateEvent = {
        id: 'mary-fresh',
        status: 'published',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-05-06T02:57:30+00:00', // 2.5 min before NOW (03:00)
        collective_forms_migrated_at: SC_MIGRATED,
      }
      expect(isReconciliationCandidate(tooFresh, NOW, TWO_HOURS_MS)).toBe(false)
    })

    it('event created 1.5 hours ago is still NOT a reconciliation candidate (under 2h grace)', () => {
      const youngish: CandidateEvent = {
        id: 'youngish',
        status: 'published',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-05-06T01:30:00+00:00', // 1.5h before NOW
        collective_forms_migrated_at: SC_MIGRATED,
      }
      expect(isReconciliationCandidate(youngish, NOW, TWO_HOURS_MS)).toBe(false)
    })

    it('event created 2.5 hours ago IS a reconciliation candidate (past 2h grace)', () => {
      const aged: CandidateEvent = {
        id: 'aged',
        status: 'published',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-05-06T00:30:00+00:00', // 2.5h before NOW
        collective_forms_migrated_at: SC_MIGRATED,
      }
      expect(isReconciliationCandidate(aged, NOW, TWO_HOURS_MS)).toBe(true)
    })
  })

  describe('Activation gate: non-migrated collectives are sheet-canonical', () => {
    it('event for non-migrated collective is NEVER a reconciliation candidate (no false-cancellation of legacy collectives)', () => {
      const brisbane: CandidateEvent = {
        id: 'b1',
        status: 'published',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-04-01T00:00:00+00:00', // very old
        collective_forms_migrated_at: null,
      }
      expect(isReconciliationCandidate(brisbane, NOW, TWO_HOURS_MS)).toBe(false)
    })
  })
})
