import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import type { Database } from '@/types/database.types'

type CollectiveRole = Database['public']['Enums']['collective_role']

/**
 * The leader seat of a collective, moved in one place.
 *
 * WHY THIS EXISTS. Promoting someone to leader demotes the sitting leader to
 * co_leader, and until 2026-09-15 that demotion wrote no audit row of its own and
 * the leader seat could be vacated with nothing recording it. Melbourne City, 775
 * members, sat with no named leader for eight weeks as a result: Jess made Ben
 * Hobbs-Gordon leader on 2026-06-24, a promotion on 2026-07-19 demoted him one
 * second later, and when that promotion was reversed the next day nobody was
 * restored. Nothing looked broken from inside the app, because co_leader and
 * assist_leader carry identical power to leader, so only the collective page
 * (which reads collectives.leader_id) showed it, and only to members.
 *
 * The logic also lived twice, copied between the collective-members screen and the
 * user-roles screen, which is how a fix to one would have missed the other.
 *
 * Three guarantees:
 *   1. Every automatic demotion writes its own audit row naming who caused it.
 *   2. collectives.leader_id never points at somebody who is not the leader.
 *   3. Vacating the seat is recorded as a first-class event, so a collective
 *      losing its leader is queryable rather than inferable from a timestamp
 *      collision between two unrelated rows.
 */
export async function applyLeaderTransition(
  collectiveId: string,
  userId: string,
  role: CollectiveRole,
): Promise<void> {
  if (role === 'leader') {
    // Read the sitting leaders BEFORE demoting them, so the audit row can name
    // them. A blind update cannot say who it moved.
    const { data: sitting } = await supabase
      .from('collective_members')
      .select('user_id')
      .eq('collective_id', collectiveId)
      .eq('role', 'leader')
      .neq('user_id', userId)

    const { error: demoteError } = await supabase
      .from('collective_members')
      .update({ role: 'co_leader' as CollectiveRole })
      .eq('collective_id', collectiveId)
      .eq('role', 'leader')
      .neq('user_id', userId)
    if (demoteError) throw demoteError

    const { error: leaderError } = await supabase
      .from('collectives')
      .update({ leader_id: userId })
      .eq('id', collectiveId)
    if (leaderError) throw leaderError

    for (const row of sitting ?? []) {
      await logAudit({
        action: 'member_role_changed',
        target_type: 'collective_member',
        target_id: row.user_id,
        details: {
          collective_id: collectiveId,
          new_role: 'co_leader',
          reason: 'auto_demoted_by_leader_promotion',
          promoted_user_id: userId,
        },
      })
    }
    return
  }

  // Moving somebody OFF the leader tier. If they are the named leader, the seat is
  // now empty and the pointer must not keep naming them: a stale leader_id is what
  // makes a headless collective look staffed.
  const { data: collective } = await supabase
    .from('collectives')
    .select('leader_id')
    .eq('id', collectiveId)
    .maybeSingle()

  if (collective?.leader_id !== userId) return

  const { error: clearError } = await supabase
    .from('collectives')
    .update({ leader_id: null })
    .eq('id', collectiveId)
  if (clearError) throw clearError

  await logAudit({
    action: 'collective_leader_vacated',
    target_type: 'collective',
    target_id: collectiveId,
    details: {
      collective_id: collectiveId,
      previous_leader_id: userId,
      new_role: role,
      note: 'The collective now has no named leader. Co-leaders and assistant leaders keep full operational access; only the named-leader seat is empty.',
    },
  })
}
