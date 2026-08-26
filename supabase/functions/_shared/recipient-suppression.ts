/**
 * recipient-suppression.ts - who must NOT be emailed, for a batch send.
 *
 * send-email has two delivery paths and they applied different consent rules.
 * The single-send path runs TWO independent gates:
 *
 *   1. marketing types are gated on profiles.marketing_opt_in, and a MISSING
 *      profile row suppresses too (the `!profile` arm)
 *   2. every type carrying a TYPE_TO_PREF_KEY entry is gated on that key AND on
 *      the notification_preferences.email_enabled channel master, and this arm
 *      is NOT limited to marketing
 *
 * The batch path carried only gate 1. That did not matter while no caller used
 * it. On 2026-08-26 commit a2951132 moved cancelEvent and inviteAll onto the
 * batch path, and event_cancelled and event_invite are both `transactional` and
 * both sit in TYPE_TO_PREF_KEY, so two consent settings a member had already
 * chosen stopped being honoured for exactly those two sends: the per-type
 * toggle, and the master email switch.
 *
 * This is the predicate, extracted so it can be tested against the single-send
 * behaviour it has to mirror rather than asserted by reading the handler.
 */

export interface SuppressionProfile {
  id: string
  marketing_opt_in?: boolean | null
  notification_preferences?: Record<string, unknown> | null
}

export interface SuppressionInput {
  /** Every userId named by the batch, including ones with no profile row. */
  ids: string[]
  /** Profile rows actually returned for those ids. */
  profiles: SuppressionProfile[]
  /** True when the template's category is 'marketing'. */
  isMarketing: boolean
  /** TYPE_TO_PREF_KEY[type], or undefined when the type maps to no toggle. */
  prefKey?: string
}

/**
 * Return the ids that must be dropped from the batch.
 *
 * Opt-OUT model throughout: only an explicit `false` suppresses, so a key the
 * member never touched leaves them enabled.
 */
export function suppressedRecipientIds(input: SuppressionInput): Set<string> {
  const { ids, profiles, isMarketing, prefKey } = input
  const out = new Set<string>()
  if (ids.length === 0) return out
  if (!isMarketing && !prefKey) return out

  const seen = new Set<string>()
  for (const p of profiles) {
    seen.add(p.id)
    const prefs = (p.notification_preferences ?? {}) as Record<string, unknown>
    if (isMarketing && p.marketing_opt_in === false) {
      out.add(p.id)
      continue
    }
    if (prefKey && (prefs[prefKey] === false || prefs.email_enabled === false)) {
      out.add(p.id)
    }
  }

  // A marketing send to a userId with no profile row is suppressed by the
  // single path's `!profile` arm, so it is suppressed here too. A TRANSACTIONAL
  // send is not: the single path has no such arm for it, and dropping a
  // cancellation notice because a profile row is missing would be worse than
  // sending it.
  if (isMarketing) {
    for (const id of ids) if (!seen.has(id)) out.add(id)
  }

  return out
}
