/**
 * Emergency-contact reachability + the safety-gap nudge cohort, Deno side.
 *
 * WHY THIS FILE EXISTS
 *
 * Co-Exist asks for an emergency contact at two points and BOTH of them work:
 * the ticket-purchase gate (65646d56, 2026-08-26) and the app-open backstop
 * `src/components/dietary-gate.tsx` (hardened 8c848446, 2026-08-28, rendered
 * `dismissible={false}`). Neither is failing. What neither can do is reach a
 * member who bought a seat and never opened the app again: the gate only fires
 * on app open, so a pre-gate buyer is never asked by anything and nothing
 * outbound ever chases them.
 *
 * Measured 2026-09-01 against project tjutlbzekfouwsiaplbr, event
 * 02947960 (Wild Mountains Conservation Campout, 2026-09-04): of 22 live
 * seats, the 13 profiles touched since 2026-08-28 carried ZERO gaps and the 9
 * untouched since purchase carried all 4. Every one of those 4 bought before
 * the purchase gate shipped (08-01, 08-07, 08-10, 08-17 vs gate 08-26) and
 * each profile's `updated_at` still equalled its ticket date. Perfect
 * separation: the rule is right, the reach is not. This module is the reach.
 *
 * WHY A TWIN RATHER THAN AN IMPORT
 *
 * Same reason `_shared/ticket-status.ts` is a twin: edge functions bundle from
 * `supabase/functions/`, and a relative import reaching up out of that root
 * (`../../../src/lib/dietary.ts`) is not a shape this repo has ever deployed.
 * Gambling a live client function on an unproven bundler path to save a copied
 * predicate is the wrong trade. `src/test/safety-gap-nudge.test.ts` imports
 * BOTH this module and `@/lib/dietary` and fails the build if the two ever
 * disagree about who has a contact, so the twin cannot drift silently.
 */

/* ------------------------------------------------------------------ */
/*  Who counts as having a reachable contact                           */
/* ------------------------------------------------------------------ */

/** Twin of `hasEmergencyContact` in `src/lib/dietary.ts`. Name AND phone are
 *  both required, because a contact you cannot ring is not a contact, and
 *  whitespace is not an answer. Pinned against the app-side original by
 *  `src/test/safety-gap-nudge.test.ts`. */
export function hasEmergencyContact(
  profile:
    | { emergency_contact_name?: string | null; emergency_contact_phone?: string | null }
    | null
    | undefined,
): boolean {
  return !!(profile?.emergency_contact_name ?? '').trim()
    && !!(profile?.emergency_contact_phone ?? '').trim()
}

/**
 * The strings people type to get past a form they do not want to fill in.
 *
 * A presence test counts every one of these as an answer, and that is not
 * theoretical here: a Co-Exist safety count was overstated in August because
 * three people had typed None / NA into a free-text medical field and the
 * count read them as declared conditions. The real number was one.
 *
 * Lowercased and trimmed before comparison, so `NA`, `n/a`, `N/A ` and `Nil`
 * all land on the same rule.
 */
export const PLACEHOLDER_ANSWERS: readonly string[] = ['none', 'na', 'n/a', 'nil', '-', '.']

/** True when a free-text answer is one of the dodge strings rather than a real
 *  answer. Blank is NOT a placeholder: blank is unanswered, which the base
 *  predicate already catches, and conflating the two would blur two states
 *  that want different copy. */
export function isPlaceholderAnswer(value: string | null | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  if (!v) return false
  return PLACEHOLDER_ANSWERS.includes(v)
}

/**
 * True when a profile has a contact we could ACTUALLY ring in an emergency.
 *
 * Strictly stronger than `hasEmergencyContact`: the base rule AND neither half
 * being a placeholder. This is deliberately the SWEEP-side predicate only, and
 * the app-side gate keeps the looser base rule, for a reason worth stating
 * rather than tidying away later:
 *
 * The gate ARMS on the predicate but its form validation accepts any non-blank
 * string, as does the server gate in `guest-ticket-checkout`. Tightening the
 * shared predicate without also tightening validation on all three intake
 * surfaces would let someone save "None", get re-gated on the next app open,
 * save "None" again, and be trapped in a modal they cannot dismiss. That is a
 * strictly worse failure than the one being fixed. Widening the OUTBOUND
 * cohort has no such trap: the worst case is one extra email whose only ask is
 * "open the app", and the app then shows them the normal gate.
 *
 * Measured cost of the disagreement, 2026-09-01: of 2,662 profiles exactly ONE
 * carries a placeholder contact (`8735e1d0`, name "Na " with a real mobile),
 * ZERO carry a placeholder phone, and that person holds no upcoming seat. So
 * the two predicates disagree about one person who is in nobody's cohort.
 */
export function hasReachableEmergencyContact(
  profile:
    | { emergency_contact_name?: string | null; emergency_contact_phone?: string | null }
    | null
    | undefined,
): boolean {
  if (!hasEmergencyContact(profile)) return false
  return !isPlaceholderAnswer(profile?.emergency_contact_name)
    && !isPlaceholderAnswer(profile?.emergency_contact_phone)
}

/**
 * Twin of `LIVE_REGISTRATION_STATUSES` in `src/lib/dietary.ts`.
 *
 * `invited` is deliberately absent. It is the bulk-import state and carried
 * 4,861 rows as at 2026-08-28, most of whom never accepted; sweeping it would
 * email thousands of people who hold no seat. The live ticket half of the
 * cohort comes from `LIVE_TICKET_STATUSES` in `_shared/ticket-status.ts`,
 * which already exists and already includes the organiser hold `reserved`.
 */
export const LIVE_REGISTRATION_STATUSES = ['registered', 'attended'] as const

/* ------------------------------------------------------------------ */
/*  Cadence                                                            */
/* ------------------------------------------------------------------ */

/**
 * How far ahead of an event the nudge is worth sending.
 *
 * 14 days is the ceiling because it is long enough that a seat bought a month
 * out still gets every step of the cadence below, and short enough that the
 * ask arrives when the event is real to the person rather than as an
 * administrative letter about something abstract.
 */
export const NUDGE_WINDOW_MAX_HOURS = 14 * 24

/**
 * And the floor. Inside 12 hours the member is travelling or packing, an email
 * asking them to open an app will not be actioned, and the person who actually
 * needs the answer at that point is the organiser with the roster in their
 * hand. That handover is deliberate: the sweep chases while chasing still
 * works, and stops before it becomes noise competing with the 2h reminder.
 */
export const NUDGE_WINDOW_MIN_HOURS = 12

/** At most this many nudges per person per event, ever. A safety ask that
 *  arrives a fourth time has stopped being a safety ask. */
export const MAX_SAFETY_NUDGES = 3

/** Minimum real-time gap between one person's nudges for one event. Modelled
 *  on `event-post-impact-log-invite`, which escalates on real-time gaps rather
 *  than on cron fires, so a cron that runs hourly cannot compress a three-step
 *  cadence into three hours. */
export const NUDGE_MIN_GAP_HOURS = 48

/** True when an event is far enough away to be worth nudging and near enough
 *  to be real. Events already started are excluded by the upper test being a
 *  floor on hours-until-start, not an absolute value. */
export function isEventInNudgeWindow(dateStart: string | Date, now: Date): boolean {
  const start = dateStart instanceof Date ? dateStart : new Date(dateStart)
  const hoursUntil = (start.getTime() - now.getTime()) / (3600 * 1000)
  return hoursUntil >= NUDGE_WINDOW_MIN_HOURS && hoursUntil <= NUDGE_WINDOW_MAX_HOURS
}

/* ------------------------------------------------------------------ */
/*  Cohort selection                                                   */
/* ------------------------------------------------------------------ */

export interface SeatRow {
  /** A guest ticket carries no user_id and no profile, so it can never be
   *  swept. Measured 2026-09-01: zero guest tickets on any upcoming ticketed
   *  event, so the residual is empty today, but the type says the truth. */
  user_id: string | null
}

export interface ContactProfileRow {
  id: string
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
}

export interface NudgeLedgerRow {
  user_id: string
  follow_up_number: number
  sent_at: string
}

export interface NudgeTarget {
  userId: string
  /** 0-based step. Doubles as the idempotency key half:
   *  UNIQUE(event_id, user_id, follow_up_number). */
  followUpNumber: number
}

/**
 * Who gets nudged for ONE event on this fire.
 *
 * Pure on purpose: every input is passed in, so the whole selection rule is
 * unit-testable without a database, a network, or a clock. The edge function
 * around it does IO and nothing else.
 *
 * Note what is NOT here. The app-side gate additionally requires
 * `onboarding_completed` and a phone already on file, because those are
 * preconditions for RENDERING a modal (and for not stacking with PhoneGate).
 * Neither has anything to do with whether we owe this person a safety ask, and
 * this sweep exists precisely for people who never open the app, so applying
 * app-render preconditions here would exclude the cohort it is built for.
 */
export function selectSafetyGapCohort(input: {
  seats: readonly SeatRow[]
  profiles: readonly ContactProfileRow[]
  alreadySent: readonly NudgeLedgerRow[]
  now: Date
}): NudgeTarget[] {
  const { seats, profiles, alreadySent, now } = input

  const profileById = new Map<string, ContactProfileRow>()
  for (const p of profiles) profileById.set(p.id, p)

  // One person can hold both a ticket and a registration for the same event.
  // Deduping here is what stops that person being emailed twice per step.
  const seatUserIds = new Set<string>()
  for (const s of seats) {
    if (s.user_id) seatUserIds.add(s.user_id)
  }

  const sentCount = new Map<string, number>()
  const lastSentAt = new Map<string, number>()
  for (const row of alreadySent) {
    sentCount.set(row.user_id, (sentCount.get(row.user_id) ?? 0) + 1)
    const at = new Date(row.sent_at).getTime()
    if (!Number.isNaN(at) && at > (lastSentAt.get(row.user_id) ?? -Infinity)) {
      lastSentAt.set(row.user_id, at)
    }
  }

  const targets: NudgeTarget[] = []
  for (const userId of seatUserIds) {
    const profile = profileById.get(userId)
    // No profile row means nothing to write a contact into and no address to
    // resolve. Skipping is correct; it is not a silent success, the caller
    // counts these.
    if (!profile) continue
    if (hasReachableEmergencyContact(profile)) continue

    const already = sentCount.get(userId) ?? 0
    if (already >= MAX_SAFETY_NUDGES) continue

    const last = lastSentAt.get(userId)
    if (last !== undefined) {
      const hoursSince = (now.getTime() - last) / (3600 * 1000)
      if (hoursSince < NUDGE_MIN_GAP_HOURS) continue
    }

    targets.push({ userId, followUpNumber: already })
  }

  // Deterministic order so a test can assert the list rather than a set, and
  // so two fires over the same data produce the same log line.
  targets.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
  return targets
}

/** Seats with no profile row, for the caller's counters. Kept beside the
 *  selection so "we looked at N seats and could act on M" is answerable from
 *  the log without re-querying. */
export function seatsWithoutProfile(
  seats: readonly SeatRow[],
  profiles: readonly ContactProfileRow[],
): number {
  const known = new Set(profiles.map((p) => p.id))
  const missing = new Set<string>()
  for (const s of seats) {
    if (s.user_id && !known.has(s.user_id)) missing.add(s.user_id)
  }
  return missing.size
}
