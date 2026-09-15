/**
 * The leader seat: every automatic demotion is recorded, and the leader_id pointer
 * never names somebody who is not the leader.
 *
 * Regression origin: Melbourne City (775 members) sat with no named leader for
 * eight weeks in 2026. A promotion demoted the sitting leader with no audit row,
 * the promotion was reversed the next day, and nobody was restored or notified.
 * Only the collective page reads leader_id, and co-leaders retain identical power,
 * so nothing inside the app looked wrong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const audits: Array<Record<string, unknown>> = []
const updates: Array<{ table: string; payload: Record<string, unknown> }> = []

let sittingLeaders: Array<{ user_id: string }> = []
let currentLeaderId: string | null = null

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(async (entry: Record<string, unknown>) => { audits.push(entry) }),
}))

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ neq: async () => ({ data: sittingLeaders, error: null }) }),
        maybeSingle: async () => ({ data: { leader_id: currentLeaderId }, error: null }),
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      updates.push({ table, payload })
      const term = async () => ({ error: null })
      const chain: Record<string, unknown> = {}
      chain.eq = () => chain
      chain.neq = () => chain
      chain.then = (res: (v: { error: null }) => unknown) => term().then(res)
      return chain
    },
  })
  return { supabase: { from } }
})

const { applyLeaderTransition } = await import('@/lib/collective-leader-transition')

beforeEach(() => {
  audits.length = 0
  updates.length = 0
  sittingLeaders = []
  currentLeaderId = null
})

describe('applyLeaderTransition', () => {
  it('audits the sitting leader it demotes, naming who caused it', async () => {
    sittingLeaders = [{ user_id: 'ben' }]
    await applyLeaderTransition('melbourne', 'tate', 'leader')

    const demotion = audits.find((a) => (a.details as Record<string, unknown>)?.reason === 'auto_demoted_by_leader_promotion')
    expect(demotion, 'the silent demotion must now leave a record').toBeTruthy()
    expect(demotion!.target_id).toBe('ben')
    expect((demotion!.details as Record<string, string>).promoted_user_id).toBe('tate')
  })

  it('points leader_id at the new leader', async () => {
    await applyLeaderTransition('melbourne', 'tate', 'leader')
    expect(updates.some((u) => u.table === 'collectives' && u.payload.leader_id === 'tate')).toBe(true)
  })

  it('writes nothing when a promotion displaces nobody', async () => {
    sittingLeaders = []
    await applyLeaderTransition('melbourne', 'tate', 'leader')
    expect(audits.filter((a) => (a.details as Record<string, unknown>)?.reason === 'auto_demoted_by_leader_promotion')).toHaveLength(0)
  })

  it('clears leader_id and records the vacancy when the named leader is moved off the seat', async () => {
    currentLeaderId = 'tate'
    await applyLeaderTransition('melbourne', 'tate', 'participant')

    expect(updates.some((u) => u.table === 'collectives' && u.payload.leader_id === null),
      'a stale leader_id is what makes a headless collective look staffed').toBe(true)
    const vacated = audits.find((a) => a.action === 'collective_leader_vacated')
    expect(vacated, 'losing the leader must be queryable, not inferable from a timestamp collision').toBeTruthy()
    expect((vacated!.details as Record<string, string>).previous_leader_id).toBe('tate')
  })

  it('leaves the seat alone when demoting somebody who was never the named leader', async () => {
    currentLeaderId = 'ben'
    await applyLeaderTransition('melbourne', 'someone-else', 'participant')

    expect(updates.some((u) => u.table === 'collectives')).toBe(false)
    expect(audits.some((a) => a.action === 'collective_leader_vacated')).toBe(false)
  })
})
