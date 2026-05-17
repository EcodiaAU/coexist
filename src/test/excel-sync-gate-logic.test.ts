// excel-sync gate-logic contract tests.
//
// Run with: `npm test -- excel-sync-gate-logic`
//
// These tests pin the symmetric-selector invariant between the to-excel push
// path and the from-excel reconciliation path of the excel-sync Edge Function
// at supabase/functions/excel-sync/index.ts. They MUST pass before any
// excel-sync deploy.
//
// History of selector drift bugs:
//   - fork_motntxi7_add578 (2026-05-06): push only included 'completed'
//     while reconciliation included 'published'+'completed'. Fixed by
//     aligning status set.
//   - PR #19 (2026-05-11): reconciliation cancelled all future events
//     because the date-coverage filter was missing. Fixed by adding
//     `date_start < runStartedAt`.
//   - Lilydale incident (2026-05-17): reconciliation cancelled an event
//     15 min after `date_start` because the leader had not yet submitted
//     impact, so the row was never pushed. The old grace was anchored to
//     `event.created_at` - wrong dimension. Fixed by anchoring grace to
//     `event_impact.logged_at` and adding an impact-data existence gate.
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
  created_by: string | null
  collective_forms_migrated_at: string | null // ISO or null
  /** Whether an event_impact row exists for this event. The to-excel APPEND
   *  path requires this; reconciliation must require it too. */
  has_impact_data: boolean
  /** When the event_impact row was logged. Reconciliation must wait long
   *  enough after impact submission for to-excel to have pushed the row. */
  impact_logged_at: string | null
}

/** UUID v5 detector - matches isSyntheticFormsUuid in index.ts. */
function isSyntheticFormsUuid(id: string): boolean {
  return id.length >= 15 && id.charAt(14) === '5'
}

/** Mirrors syncToExcel batch-mode push-eligibility (index.ts ~line 844-857
 *  for the SQL filter + line 884-895 for the synthetic skip + line 948 for
 *  the APPEND gate). For the contract test, "push-eligible" means the event
 *  CAN appear on the sheet via either APPEND or UPDATE. APPEND requires
 *  `has_impact_data && date_start in past`; UPDATE has no gates beyond the
 *  outer SQL+synthetic filters. */
function isPushEligible(e: CandidateEvent, now: Date): boolean {
  if (!['published', 'completed'].includes(e.status)) return false
  if (e.date_start < SYNC_CUTOFF_DATE) return false
  if (!e.collective_forms_migrated_at) return false
  if (new Date(e.date_start) < new Date(e.collective_forms_migrated_at)) return false
  if (e.created_by === null || isSyntheticFormsUuid(e.id)) return false
  return true
}

/** Mirrors syncToExcel APPEND-eligibility (index.ts ~line 948).
 *  This is the strict subset of push-eligibility that NEW rows must pass. */
function isAppendEligible(e: CandidateEvent, now: Date): boolean {
  if (!isPushEligible(e, now)) return false
  if (!e.has_impact_data) return false
  if (new Date(e.date_start) > now) return false // hasHappened
  return true
}

/** Mirrors syncFromExcel reconciliation candidate predicate (index.ts
 *  ~line 1503-1556). Pre-seenEventIds check; production code additionally
 *  excludes events that appeared in the sheet during this run. */
function isReconciliationCandidate(
  e: CandidateEvent,
  runStartedAt: Date,
  impactGraceMs: number,
): boolean {
  if (!['published', 'completed'].includes(e.status)) return false
  if (e.date_start < SYNC_CUTOFF_DATE) return false
  if (new Date(e.date_start) >= runStartedAt) return false // future-event gate
  if (!e.collective_forms_migrated_at) return false
  if (new Date(e.date_start) < new Date(e.collective_forms_migrated_at)) return false
  if (e.created_by === null || isSyntheticFormsUuid(e.id)) return false
  if (!e.has_impact_data) return false
  if (!e.impact_logged_at) return false
  if (new Date(e.impact_logged_at).getTime() >= runStartedAt.getTime() - impactGraceMs) return false
  return true
}

const SC_MIGRATED = '2026-05-04T00:00:00+00:00'
const NOW = new Date('2026-05-18T03:00:00+00:00')
const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const REAL_USER = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee' // v4 UUID
const SYNTHETIC = 'aaaaaaaa-bbbb-5ccc-dddd-eeeeeeeeeeee' // v5 UUID

describe('excel-sync gate-logic contract', () => {
  describe('Symmetric-selector invariant', () => {
    it('every reconciliation candidate must also be append-eligible (gate-symmetry)', () => {
      // Reconciliation cancels events that the APPEND path would have pushed
      // if they had data. If reconciliation cancels an event that APPEND would
      // never have pushed, the selectors have drifted = the bug class.
      const fixtures: CandidateEvent[] = [
        { id: REAL_USER, status: 'published', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-04T00:00:00+00:00', created_by: REAL_USER, collective_forms_migrated_at: SC_MIGRATED, has_impact_data: true, impact_logged_at: '2026-05-09T12:00:00+00:00' },
        { id: REAL_USER, status: 'completed', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-04T00:00:00+00:00', created_by: REAL_USER, collective_forms_migrated_at: SC_MIGRATED, has_impact_data: true, impact_logged_at: '2026-05-10T08:00:00+00:00' },
        { id: REAL_USER, status: 'published', date_start: '2026-07-04T00:00:00+00:00', created_at: '2026-04-23T00:00:00+00:00', created_by: REAL_USER, collective_forms_migrated_at: SC_MIGRATED, has_impact_data: false, impact_logged_at: null },
      ]
      for (const e of fixtures) {
        if (isReconciliationCandidate(e, NOW, SIX_HOURS_MS)) {
          expect(isAppendEligible(e, NOW), `event ${e.id} is reconciliation candidate but NOT append-eligible - selectors drifted`).toBe(true)
        }
      }
    })
  })

  describe('Future-event gate (PR #19, 11 May 2026)', () => {
    it('future event is NEVER a reconciliation candidate even with full impact data', () => {
      const future: CandidateEvent = {
        id: REAL_USER,
        status: 'published',
        date_start: '2026-06-04T00:00:00+00:00', // 17 days in future
        created_at: '2026-04-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-01T00:00:00+00:00',
      }
      expect(isReconciliationCandidate(future, NOW, SIX_HOURS_MS)).toBe(false)
    })
  })

  describe('Impact-data gate (Lilydale fix, 17 May 2026)', () => {
    it('event without an event_impact row is NEVER a reconciliation candidate', () => {
      // Lilydale case: event started 15 min ago, leader still on-site,
      // no impact submitted yet. The to-excel APPEND path skips this event
      // (hasImpactData=false), so the sheet never had it, so absence from
      // the sheet does not mean deletion.
      const lilydale: CandidateEvent = {
        id: REAL_USER,
        status: 'published',
        date_start: '2026-05-18T02:45:00+00:00', // 15 min before NOW
        created_at: '2026-03-26T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: false,
        impact_logged_at: null,
      }
      expect(isReconciliationCandidate(lilydale, NOW, SIX_HOURS_MS)).toBe(false)
    })

    it('event with FRESH impact (logged minutes ago) is NOT a reconciliation candidate (grace window)', () => {
      const fresh: CandidateEvent = {
        id: REAL_USER,
        status: 'completed',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-03-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-18T02:55:00+00:00', // 5 min before NOW
      }
      expect(isReconciliationCandidate(fresh, NOW, SIX_HOURS_MS)).toBe(false)
    })

    it('event with MATURE impact (logged 7h ago) IS a reconciliation candidate after grace', () => {
      const mature: CandidateEvent = {
        id: REAL_USER,
        status: 'completed',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-03-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-17T20:00:00+00:00', // 7h before NOW
      }
      expect(isReconciliationCandidate(mature, NOW, SIX_HOURS_MS)).toBe(true)
    })

    it('leaders submitting impact DAYS late are still safe (gate triggers only after impact submission + grace)', () => {
      // Event was on 5 May. Leader submits impact 13 days later (18 May).
      // From-excel runs immediately after impact submission - reconciliation
      // must wait for the grace period before it can cancel. This protects
      // the race where impact is logged BUT to-excel has not yet pushed.
      const lateSubmission: CandidateEvent = {
        id: REAL_USER,
        status: 'completed',
        date_start: '2026-05-05T00:00:00+00:00',
        created_at: '2026-03-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-18T02:30:00+00:00', // 30 min before NOW
      }
      expect(isReconciliationCandidate(lateSubmission, NOW, SIX_HOURS_MS)).toBe(false)
    })
  })

  describe('Synthetic-event gate', () => {
    it('synthetic event (UUID v5) is NEVER a reconciliation candidate', () => {
      // Synthetic events originate from the sheet via from-excel reverse-sync.
      // They are skipped by to-excel and must be skipped by reconciliation too.
      const synthetic: CandidateEvent = {
        id: SYNTHETIC,
        status: 'completed',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-04-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-09T12:00:00+00:00',
      }
      expect(isReconciliationCandidate(synthetic, NOW, SIX_HOURS_MS)).toBe(false)
    })

    it('event with created_by=NULL (legacy synthetic) is NEVER a reconciliation candidate', () => {
      const legacySynthetic: CandidateEvent = {
        id: REAL_USER,
        status: 'completed',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-04-01T00:00:00+00:00',
        created_by: null,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-09T12:00:00+00:00',
      }
      expect(isReconciliationCandidate(legacySynthetic, NOW, SIX_HOURS_MS)).toBe(false)
    })
  })

  describe('Activation gate: non-migrated collectives are sheet-canonical', () => {
    it('event for non-migrated collective is NEVER a reconciliation candidate', () => {
      const brisbane: CandidateEvent = {
        id: REAL_USER,
        status: 'published',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-04-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: null,
        has_impact_data: true,
        impact_logged_at: '2026-05-09T12:00:00+00:00',
      }
      expect(isReconciliationCandidate(brisbane, NOW, SIX_HOURS_MS)).toBe(false)
    })

    it('event predating collective cutover is NEVER a reconciliation candidate', () => {
      const preCutover: CandidateEvent = {
        id: REAL_USER,
        status: 'completed',
        date_start: '2026-05-02T00:00:00+00:00', // before SC_MIGRATED
        created_at: '2026-04-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-09T12:00:00+00:00',
      }
      expect(isReconciliationCandidate(preCutover, NOW, SIX_HOURS_MS)).toBe(false)
    })
  })

  describe('Status gate', () => {
    it('draft event is NEVER a reconciliation candidate', () => {
      const draft: CandidateEvent = {
        id: REAL_USER,
        status: 'draft',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-04-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-09T12:00:00+00:00',
      }
      expect(isReconciliationCandidate(draft, NOW, SIX_HOURS_MS)).toBe(false)
    })

    it('already-cancelled event is NEVER a reconciliation candidate (idempotency)', () => {
      const cancelled: CandidateEvent = {
        id: REAL_USER,
        status: 'cancelled',
        date_start: '2026-05-09T00:00:00+00:00',
        created_at: '2026-04-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: SC_MIGRATED,
        has_impact_data: true,
        impact_logged_at: '2026-05-09T12:00:00+00:00',
      }
      expect(isReconciliationCandidate(cancelled, NOW, SIX_HOURS_MS)).toBe(false)
    })
  })

  describe('Cutover-date gate', () => {
    it('event with date_start before SYNC_CUTOFF_DATE is NEVER a reconciliation candidate', () => {
      const preCutoff: CandidateEvent = {
        id: REAL_USER,
        status: 'completed',
        date_start: '2026-04-30T00:00:00+00:00',
        created_at: '2026-04-01T00:00:00+00:00',
        created_by: REAL_USER,
        collective_forms_migrated_at: '2026-04-01T00:00:00+00:00',
        has_impact_data: true,
        impact_logged_at: '2026-05-01T12:00:00+00:00',
      }
      expect(isReconciliationCandidate(preCutoff, NOW, SIX_HOURS_MS)).toBe(false)
    })
  })

  describe('Health-guard contract', () => {
    // The production code skips the entire reconciliation phase if no
    // to-excel run is recorded in excel_sync_runs within the health window.
    // This is the structural protection against the >grace-period to-excel
    // outage scenario. The contract is: reconciliation MUST NOT run when
    // the sheet is potentially stale.
    function shouldReconcile(recentToExcelRunCount: number): boolean {
      return recentToExcelRunCount > 0
    }

    it('reconciliation is SKIPPED when no to-excel run in health window', () => {
      expect(shouldReconcile(0)).toBe(false)
    })

    it('reconciliation RUNS when at least one to-excel run is in the health window', () => {
      expect(shouldReconcile(1)).toBe(true)
    })
  })

  describe('Push-eligibility helpers', () => {
    it('completed event for migrated collective IS push-eligible', () => {
      expect(isPushEligible({ id: REAL_USER, status: 'completed', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-06T01:57:00+00:00', created_by: REAL_USER, collective_forms_migrated_at: SC_MIGRATED, has_impact_data: true, impact_logged_at: '2026-05-09T12:00:00+00:00' }, NOW)).toBe(true)
    })

    it('event for non-migrated collective is NOT push-eligible', () => {
      expect(isPushEligible({ id: REAL_USER, status: 'published', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-06T01:57:00+00:00', created_by: REAL_USER, collective_forms_migrated_at: null, has_impact_data: false, impact_logged_at: null }, NOW)).toBe(false)
    })

    it('event without impact data IS push-eligible (UPDATE path) but NOT append-eligible', () => {
      const e: CandidateEvent = { id: REAL_USER, status: 'published', date_start: '2026-05-09T00:00:00+00:00', created_at: '2026-05-06T01:57:00+00:00', created_by: REAL_USER, collective_forms_migrated_at: SC_MIGRATED, has_impact_data: false, impact_logged_at: null }
      expect(isPushEligible(e, NOW)).toBe(true) // UPDATE path doesn't gate on impact
      expect(isAppendEligible(e, NOW)).toBe(false) // APPEND path does
    })
  })
})
