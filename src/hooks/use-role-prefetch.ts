import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'

/* ------------------------------------------------------------------ */
/*  Role-based chunk prefetch                                          */
/*                                                                     */
/*  Downloads the JS chunks for each role's most-used pages first,     */
/*  then falls back to the remaining common set. The priority list     */
/*  matches what's visible in the sidebar + bottom tab bar per role.   */
/*                                                                     */
/*  Webpack/Vite deduplicates dynamic imports that resolve to the      */
/*  same module, so a chunk appearing in both priority and secondary   */
/*  only downloads once.                                               */
/* ------------------------------------------------------------------ */

type ChunkImport = () => Promise<unknown>

/* ── Shared across every role ── */

const COMMON: ChunkImport[] = [
  () => import('@/pages/home'),
  () => import('@/pages/chat/index'),
  () => import('@/pages/updates/index'),
]

/* ── Per-role priority imports (nav-visible pages) ── */

const PARTICIPANT_PRIORITY: ChunkImport[] = [
  ...COMMON,
  () => import('@/pages/events/index'),
  () => import('@/pages/shop/index'),
]

const LEADER_PRIORITY: ChunkImport[] = [
  ...COMMON,
  () => import('@/pages/leader/index'),
  () => import('@/pages/leader/events'),
  () => import('@/pages/leader/tasks'),
]

const STAFF_PRIORITY: ChunkImport[] = [
  ...COMMON,
  () => import('@/pages/admin/index'),
  () => import('@/pages/admin/collectives'),
  () => import('@/pages/admin/events'),
  () => import('@/pages/admin/create'),
]

/* ── Secondary imports (remaining common pages, all roles) ── */

const SECONDARY: ChunkImport[] = [
  () => import('@/pages/profile/index'),
  () => import('@/pages/notifications/index'),
  () => import('@/pages/settings/index'),
  () => import('@/pages/events/event-detail'),
  () => import('@/pages/collectives/collective-detail'),
  () => import('@/pages/donate/index'),
  () => import('@/pages/profile/view-profile'),
  () => import('@/pages/profile/edit-profile'),
  () => import('@/pages/chat/chat-room'),
  () => import('@/pages/events/create-event'),
  () => import('@/pages/referral/index'),
  () => import('@/pages/tasks/index'),
  () => import('@/pages/contact'),
  () => import('@/pages/partners'),
  () => import('@/pages/leadership'),
  () => import('@/pages/lead-a-collective'),
  () => import('@/pages/reports/index'),
  () => import('@/pages/impact/national'),
  () => import('@/pages/shop/index'),
  () => import('@/pages/events/index'),
]

function scheduleIdle(cb: () => void) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(cb)
  } else {
    setTimeout(cb, 100)
  }
}

function getPriorityImports(
  isStaff: boolean,
  isLeader: boolean,
): ChunkImport[] {
  // Staff/admin takes precedence - they spend most time in admin suite
  if (isStaff) return STAFF_PRIORITY
  if (isLeader) return LEADER_PRIORITY
  return PARTICIPANT_PRIORITY
}

/**
 * Prefetches page chunks in priority order based on the user's role.
 *
 * Phase 1 (idle): role's priority pages - the tabs/sidebar they actually see.
 * Phase 2 (idle after phase 1): remaining common pages for cross-navigation.
 *
 * Each import() is a no-op if the chunk is already cached, so duplicates
 * between priority and secondary are harmless.
 */
export function useRolePrefetch() {
  const { profile, collectiveRoles, isStaff } = useAuth()
  const didPrefetch = useRef(false)

  const isLeader = collectiveRoles.some((m) =>
    ['leader', 'co_leader', 'assist_leader'].includes(m.role),
  )

  useEffect(() => {
    // Wait for auth to settle (profile loaded)
    if (!profile || didPrefetch.current) return
    didPrefetch.current = true

    const priority = getPriorityImports(isStaff, isLeader)

    // Phase 1: role-specific priority pages
    scheduleIdle(() => {
      for (const load of priority) load()

      // Phase 2: remaining secondary pages
      scheduleIdle(() => {
        for (const load of SECONDARY) load()
      })
    })
  }, [profile, isStaff, isLeader])
}
