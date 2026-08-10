// Shared, unit-tested guard helpers for the D3 remediation (2026-08-10).
// Kept pure (no Deno.env / no network) so supabase/functions/_tests can exercise
// the exact logic the edge functions run.

/** Global role rank (mirrors src/lib/constants.ts ROLE_RANK). */
export const ROLE_RANK: Record<string, number> = {
  participant: 0,
  member: 0,
  assist_leader: 1,
  co_leader: 2,
  leader: 3,
  national_leader: 3,
  national_staff: 3,
  manager: 4,
  national_admin: 4,
  admin: 5,
  super_admin: 5,
}

/**
 * True iff callerRole is STRICTLY higher rank than targetRole. Unknown roles
 * rank -1. Used by delete-user so a deleter can only remove a strictly
 * lower-ranked account (no upward, no lateral, no self-delete).
 */
export function outranks(
  callerRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  const c = ROLE_RANK[callerRole ?? ''] ?? -1
  const t = ROLE_RANK[targetRole ?? ''] ?? -1
  return c > t
}

/**
 * Collapse whitespace/newlines and cap length so user-authored text cannot
 * inject structure into a staff notification body or a push payload.
 */
export function sanitizeReportReason(reason: string | null | undefined, max = 280): string {
  return String(reason ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Constant-time string compare (length is not treated as secret here). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}
