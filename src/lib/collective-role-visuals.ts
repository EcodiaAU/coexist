import { Crown, ShieldCheck, ShieldAlert, Users, Settings, Shield } from 'lucide-react'
import { formatRole } from '@/lib/labels-and-enums'
import type { Database } from '@/types/database.types'

type CollectiveRole = Database['public']['Enums']['collective_role']

/**
 * Visual treatment per collective role. This MUST be a total function over
 * every `collective_role` enum value, not a partial map: the membership row is
 * rendered as `<Icon />`, and an unmapped role made `Icon` undefined, which
 * React throws on ("element type is invalid") and takes the whole app down
 * rather than degrading one row. That is exactly how the single legacy
 * `member` row in the live table crashed the admin users page on 2026-09-14 -
 * `member` is an accepted enum value and a documented alias for participant
 * (see ROLE_RANK in lib/constants), it simply had no icon.
 *
 * The DEFAULT branch is the load-bearing part. It keeps the page standing for
 * any value a future migration adds to the enum before this file learns it,
 * so the failure mode of an unknown role is a neutral pill, never a crash.
 */
const COLLECTIVE_ROLE_VISUALS: Record<string, { Icon: typeof Crown; color: string; surface: string }> = {
  leader: {
    Icon: Crown,
    color: 'bg-warning-200 text-warning-800',
    surface: 'bg-warning-50 ring-1 ring-warning-200/60',
  },
  co_leader: {
    Icon: ShieldCheck,
    color: 'bg-neutral-200 text-neutral-800',
    surface: 'bg-neutral-50 ring-1 ring-neutral-200/60',
  },
  assist_leader: {
    Icon: ShieldAlert,
    color: 'bg-info-200 text-info-800',
    surface: 'bg-info-50 ring-1 ring-info-200/60',
  },
  participant: {
    Icon: Users,
    color: 'bg-neutral-200 text-neutral-700',
    surface: 'bg-white ring-1 ring-primary-100/50',
  },
  // Legacy alias for participant, still present on live rows.
  member: {
    Icon: Users,
    color: 'bg-neutral-200 text-neutral-700',
    surface: 'bg-white ring-1 ring-primary-100/50',
  },
  manager: {
    Icon: Settings,
    color: 'bg-plum-200 text-plum-800',
    surface: 'bg-plum-50 ring-1 ring-plum-200/60',
  },
  admin: {
    Icon: Shield,
    color: 'bg-error-200 text-error-800',
    surface: 'bg-error-50 ring-1 ring-error-200/60',
  },
}

const UNKNOWN_COLLECTIVE_ROLE_VISUAL = {
  Icon: Users,
  color: 'bg-neutral-200 text-neutral-700',
  surface: 'bg-white ring-1 ring-neutral-200/60',
} as const

export function collectiveRoleVisual(role: string | null | undefined) {
  if (!role) return UNKNOWN_COLLECTIVE_ROLE_VISUAL
  return COLLECTIVE_ROLE_VISUALS[role] ?? UNKNOWN_COLLECTIVE_ROLE_VISUAL
}

export const collectiveRoleOptions: { value: CollectiveRole; label: string }[] = [
  { value: 'leader', label: 'Leader' },
  { value: 'co_leader', label: 'Co-Leader' },
  { value: 'assist_leader', label: 'Assistant Leader' },
  { value: 'participant', label: 'Participant' },
]

/**
 * Options for the per-membership role Dropdown, guaranteed to contain the row's
 * CURRENT role. Those four above are the assignable set; a row holding anything
 * else (the legacy `member` alias, or a value a later migration adds) matched no
 * option and rendered an EMPTY control, so an admin looking at the row could not
 * read the role it was already on and had no way to tell a blank widget from a
 * missing membership. The current value is prepended as a read-back entry.
 */
export function collectiveRoleOptionsFor(
  current: string | null | undefined,
): { value: string; label: string }[] {
  if (!current || collectiveRoleOptions.some((o) => o.value === current)) {
    return collectiveRoleOptions
  }
  return [{ value: current, label: formatRole(current) }, ...collectiveRoleOptions]
}
