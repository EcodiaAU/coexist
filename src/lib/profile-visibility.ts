/**
 * Profile visibility tiers - participant profile privacy gating.
 *
 * Origin: Tate directive 29 Apr 2026 20:05 AEST. Non-leaders must NOT see
 * semi-sensitive or fully-sensitive information about other users on
 * profile pages (chat avatar tap modal, /profile/:userId route).
 *
 * The DB security boundary lives in get_user_profile_v1() RPC
 * (migration 079). This helper is the matching client-side check, used as
 * defense-in-depth so the UI explicitly hides sections for non-staff
 * viewers and renders [redacted] placeholders where appropriate.
 *
 * Staff-tier roles (CAN see sensitive info):
 *   - assist_leader, co_leader, leader
 *   - national_leader, manager, admin
 * Non-staff roles (CANNOT see sensitive info):
 *   - participant
 */

import type { Database } from '@/types/database.types'

export type UserRole = Database['public']['Enums']['user_role']

// String-keyed set so we are tolerant of database.types.ts being slightly
// stale relative to live enum values (the generated types are known to lag
// behind migration-time renames). The DB enum after migrations 074/076 +
// unified_roles is: participant, assist_leader, co_leader, leader,
// national_leader, manager, admin.
const STAFF_ROLES: ReadonlySet<string> = new Set<string>([
  'assist_leader',
  'co_leader',
  'leader',
  'national_leader',
  'manager',
  'admin',
])

/**
 * True if the viewer (any role at or above assist_leader) is allowed to
 * see another user's sensitive PII. Use this for client-side UI gating
 * only - the canonical security boundary is the get_user_profile_v1 RPC.
 */
export function viewerCanSeeSensitive(viewerRole: UserRole | string | null | undefined): boolean {
  if (!viewerRole) return false
  return STAFF_ROLES.has(viewerRole as string)
}

/**
 * Sentinel string the UI can render in place of redacted fields, so a
 * non-staff viewer sees an explicit "leaders only" marker rather than a
 * blank line that could read as "this user has no <field>".
 */
export const REDACTED_PLACEHOLDER = '[Visible to leaders only]'
