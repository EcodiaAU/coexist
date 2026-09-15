/**
 * event-reminder-audience.ts
 *
 * Who receives a host-initiated event send, and what the host is told
 * afterwards.
 *
 * History, because the rule is the scar tissue:
 *
 * The reminder branch of useInviteCollective used to have no audience at all,
 * because it only posted an announcement into the collective chat and a chat
 * post has no recipient list. Kurt Jones (Co-Exist) reported the symptom on
 * 2026-09-05: the button that hosts remember as "send everyone an email about
 * this event" stopped emailing anybody. The first invite still emailed, so the
 * capability looked like it had been taken away rather than never extended to
 * the second press.
 *
 * 2026-09-15 (Tate): the host action unified on ONE semantic. The tile is
 * always "Invite", a paper plane, and every press picks its own channels -
 * collective chat, email, push - so there is no longer a first-invite audience
 * and a separate reminder audience. There is one rule for every press:
 *
 *   - every ACTIVE member of the collective, which is the same population the
 *     first invite emailed, so a host gets what they remember
 *   - minus the host doing the sending, who does not need inviting
 *   - minus anyone who cancelled their registration, because cancelling is a
 *     member saying no and another send is not the answer to that
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

export function buildInviteAudience(
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

/** Join a list in prose: "a", "a and b", "a, b and c". */
function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * What the host is told after the send. Built here rather than inline in the
 * component so the wording stays honest about each channel independently: a
 * chat post that was skipped for cooldown must not be reported as sent, which
 * is the failure the old single-sentence toast made easy.
 *
 * `invited` is the count of members newly marked invited on the event, which
 * only a first press produces. It leads the sentence when it is non-zero,
 * because "Invited 40 members" is the thing the host wants confirmed and the
 * channels are how it reached them.
 */
export function describeInviteOutcome(outcome: {
  emailed: number
  pushed?: number
  chatPosted: boolean
  chatSkippedReason?: string | null
  invited?: number
}): string {
  const parts: string[] = []
  if (outcome.emailed > 0) parts.push(`emailed ${plural(outcome.emailed, 'member')}`)
  if ((outcome.pushed ?? 0) > 0) parts.push(`sent ${plural(outcome.pushed ?? 0, 'push notification')}`)
  if (outcome.chatPosted) parts.push('posted to the collective chat')

  const invited = outcome.invited ?? 0
  const lead = invited > 0 ? `Invited ${plural(invited, 'member')}` : ''

  const withSkip = (sentence: string) =>
    outcome.chatSkippedReason ? `${sentence} ${outcome.chatSkippedReason}` : sentence

  if (parts.length === 0) {
    if (lead) return withSkip(`${lead}.`)
    return outcome.chatSkippedReason ?? 'Nothing was sent - nobody to invite'
  }

  const joined = joinParts(parts)
  const sentence = lead
    ? `${lead}, ${joined}.`
    : `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`
  return withSkip(sentence)
}
