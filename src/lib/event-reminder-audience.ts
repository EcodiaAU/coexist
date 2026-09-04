/**
 * event-reminder-audience.ts
 *
 * Who receives a host-initiated event reminder.
 *
 * The reminder branch of useInviteCollective used to have no audience at all,
 * because it only posted an announcement into the collective chat and a chat
 * post has no recipient list. Kurt Jones (Co-Exist) reported the symptom on
 * 2026-09-05: the button that hosts remember as "send everyone an email about
 * this event" stopped emailing anybody. The first invite still emailed, so the
 * capability looked like it had been taken away rather than never extended to
 * the second press.
 *
 * Kept pure and separate from the mutation so the rule is testable without a
 * Supabase client. The rule itself:
 *
 *   - every ACTIVE member of the collective, which is the same population the
 *     first invite emailed, so a host gets what they remember
 *   - minus the host doing the sending, who does not need reminding
 *   - minus anyone who cancelled their registration, because cancelling is a
 *     member saying no and a reminder is not the answer to that
 *
 * Somebody already registered still gets one: the host's words are "remind
 * people to register/come", and the come half is aimed exactly at them.
 * Per-member email preferences are NOT applied here. send-email owns that
 * decision for every channel it serves (TYPE_TO_PREF_KEY), and duplicating the
 * gate in the client is how the two drift apart.
 */

/** A registration row, narrowed to the two fields the rule reads. */
export interface ReminderRegistration {
  user_id: string
  status: string | null
}

/** A collective membership row, narrowed the same way. */
export interface ReminderMember {
  user_id: string
}

/** Statuses that mean this member has opted out of the event. */
export const REMINDER_EXCLUDED_STATUSES = ['cancelled'] as const

export function buildReminderAudience(
  members: ReminderMember[] | null | undefined,
  registrations: ReminderRegistration[] | null | undefined,
  senderId: string,
): string[] {
  const optedOut = new Set(
    (registrations ?? [])
      .filter((r) => r.status !== null && (REMINDER_EXCLUDED_STATUSES as readonly string[]).includes(r.status))
      .map((r) => r.user_id),
  )

  const seen = new Set<string>()
  const audience: string[] = []
  for (const m of members ?? []) {
    if (!m.user_id) continue
    if (m.user_id === senderId) continue
    if (optedOut.has(m.user_id)) continue
    if (seen.has(m.user_id)) continue
    seen.add(m.user_id)
    audience.push(m.user_id)
  }
  return audience
}

/**
 * What the host is told after the send. Built here rather than inline in the
 * component so the wording stays honest about each channel independently: a
 * chat post that was skipped for cooldown must not be reported as sent, which
 * is the failure the old single-sentence toast made easy.
 */
export function describeReminderOutcome(outcome: {
  emailed: number
  chatPosted: boolean
  chatSkippedReason?: string | null
}): string {
  const parts: string[] = []
  if (outcome.emailed > 0) {
    parts.push(`Emailed ${outcome.emailed} member${outcome.emailed === 1 ? '' : 's'}`)
  }
  if (outcome.chatPosted) {
    parts.push(parts.length ? 'and posted to the collective chat' : 'Posted to the collective chat')
  }
  if (parts.length === 0) {
    return outcome.chatSkippedReason ?? 'Nothing was sent - nobody to remind'
  }
  const sentence = `${parts.join(' ')}.`
  return outcome.chatSkippedReason ? `${sentence} ${outcome.chatSkippedReason}` : sentence
}
