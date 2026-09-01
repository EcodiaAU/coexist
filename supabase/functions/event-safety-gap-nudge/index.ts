// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { selectInChunks } from '../_shared/select-in-chunks.ts'
import { LIVE_TICKET_STATUSES } from '../_shared/ticket-status.ts'
import {
  isEventInNudgeWindow,
  LIVE_REGISTRATION_STATUSES,
  MAX_SAFETY_NUDGES,
  NUDGE_WINDOW_MAX_HOURS,
  NUDGE_WINDOW_MIN_HOURS,
  seatsWithoutProfile,
  selectSafetyGapCohort,
  type ContactProfileRow,
  type NudgeLedgerRow,
  type SeatRow,
} from '../_shared/safety-contact.ts'

/**
 * event-safety-gap-nudge - scheduled Supabase Edge Function.
 *
 * THE HOLE THIS CLOSES
 *
 * Two enforcement points already collect an emergency contact and both work:
 * the ticket-purchase gate (65646d56) and the app-open backstop
 * `dietary-gate.tsx` (8c848446). Both only fire when the person OPENS THE APP.
 * A member who bought a seat and never came back is asked by nothing, and
 * until this function nothing outbound ever chased them. Proven 2026-09-01 on
 * Wild Mountains (event 02947960): of 22 live seats the 13 profiles touched
 * since the gate shipped had zero gaps, and all 4 gaps sat in the 9 profiles
 * untouched since purchase. The rule is right, the reach was missing.
 *
 * SCOPE, AND WHY IT IS NARROWER THAN "EVERY EVENT"
 *
 * `events.is_ticketed = true` is load-bearing and must not be relaxed. It is
 * exactly the eligibility the app-open gate uses (dietary-gate.tsx queries
 * `.eq('events.is_ticketed', true)`), so the email chases precisely the people
 * that gate would ask and nobody else. Measured 2026-09-01: with the filter,
 * 4 upcoming events / 60 live seats / 6 gaps. WITHOUT it, 30 events and 279
 * gaps, of which Merri Mornings alone is 108 of 148 - a mass-mailout to people
 * attending a two-hour beach clean-up who were never asked for a contact and
 * do not need to be. If a future change widens this, widen the app gate first.
 *
 * CADENCE + IDEMPOTENCY
 *
 * Up to MAX_SAFETY_NUDGES per person per event, at least NUDGE_MIN_GAP_HOURS
 * apart, only while the event sits inside the nudge window. The ledger is
 * `event_safety_nudges_sent`, UNIQUE (event_id, user_id, follow_up_number),
 * mirroring `event_impact_log_invites_sent`.
 *
 * The claim is written BEFORE the send, which deliberately inverts the order
 * `event-reminders` uses. That file sends first because a lost PUSH is
 * invisible and re-firing is cheap. Here the failure directions are reversed:
 * a duplicate safety email teaches the member that this ask is noise, and the
 * cost of a lost one is a delay of NUDGE_MIN_GAP_HOURS before the next step
 * asks again. So this sweep is at-most-once by construction: claim the row,
 * send only what you claimed, and let the cadence cover a drop.
 *
 * SCHEDULE: hourly at :27 (migration 20260901120000). Probed against cron.job
 * on 2026-09-01: :17 is carpool-archive-sweep, and the other event jobs sit at
 * :07/:22/:37/:52 (event-day-notify), :09 (impact-log), :23 (photo), :41
 * (survey) and every 30 minutes (reminders). :27 was the widest free gap.
 */

/**
 * Service-role client, made through a named factory so `Db` below is the type
 * of the client this file ACTUALLY builds.
 *
 * `ReturnType<typeof createClient>` is not that type: with no explicit generic
 * arguments it resolves the schema to `never`, so every helper typed with it
 * rejects the real client and every `.upsert()` payload becomes `never[]`.
 * That is why `deno check supabase/functions/event-reminders/index.ts` reports
 * 9 errors today on code that is deployed and working. Deriving the type from
 * the factory keeps this function type-clean, which is the only way a future
 * type error here will be visible rather than lost in a known-noisy baseline.
 */
function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

type Db = ReturnType<typeof serviceClient>

interface EventRow {
  id: string
  title: string
  date_start: string
  address: string | null
  timezone: string | null
  collectives: { timezone: string | null; slug: string | null } | null
}

/**
 * Widest AU UTC offset the SQL pre-filter has to cover, +8 (Perth) to +11
 * (Hobart in DST). Twinned from event-reminders, and load-bearing for the same
 * reason: the exact boundary is decided per event in the audience's own frame,
 * so the SQL either side of it must be WIDER than the real window or an event
 * gets dropped before the accurate test ever sees it.
 */
const TZ_PADDING_HOURS = 12

/**
 * Effective audience IANA timezone. Twin of the helper in event-reminders and
 * event-day-notify: the floating-local model leaves `events.timezone` NULL or
 * 'UTC' on new events, so the collective's tz is the meaningful one.
 */
function audienceTzFor(event: EventRow): string {
  const eTz = event.timezone
  if (eTz && eTz !== 'UTC') return eTz
  return event.collectives?.timezone || 'Australia/Brisbane'
}

/**
 * A Date whose UTC slice equals the current WALL-CLOCK time in `tz`.
 *
 * This is not decoration. `events.date_start` is stored wall-clock-as-UTC
 * (floating-local, since 2026-05-26), so comparing it against real UTC `now`
 * measures a gap that is wrong by the audience's own offset. Measured on Wild
 * Mountains (2026-09-04 14:00 local, +10): comparing against real now, the 12h
 * floor below stops the sweep 2.0 hours before the event actually starts, not
 * 12. That is precisely the collision with the 2h reminder the floor exists to
 * avoid, and event-reminders documents the same trap ("would fire the
 * audience-offset hours late, 10h for AEST").
 */
function wallClockNowInTz(tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}.000Z`,
  )
}

/**
 * Test / non-production events must never fire live mail to real members.
 * The canonical marker is the collective slug 'test'. The SQL selection
 * already filters it out through the `collectives!inner` join; this is the
 * null-safe second line of defence, same shape as event-reminders.
 */
function isTestEvent(event: EventRow): boolean {
  return event.collectives?.slug === 'test'
}

Deno.serve(withSentry('event-safety-gap-nudge', async (req: Request) => {
  try {
    // Cron invocations carry the service-role key. Mirrors event-reminders:
    // this function reads every attendee's contact details, so an anon caller
    // must never reach the body.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (authHeader.replace('Bearer ', '') !== serviceRoleKey) {
      return new Response('Forbidden: service-role key required', { status: 403 })
    }

    const supabase = serviceClient()

    const now = new Date()
    const results = {
      events_considered: 0,
      events_in_window: 0,
      seats: 0,
      seats_without_profile: 0,
      nudges_claimed: 0,
      emails_sent: 0,
      errors: 0,
    }

    // Pre-filter in SQL on the same window the pure predicate enforces. The
    // exact boundary is re-checked per event by isEventInNudgeWindow so the
    // rule lives in one place and the SQL is only a cheap narrowing.
    // Padded on BOTH sides: the accurate test below runs in the audience's own
    // wall-clock frame, which can sit up to TZ_PADDING_HOURS either side of
    // real UTC. Narrowing here to the exact window would drop an event before
    // the accurate test could judge it.
    const windowStart = new Date(
      now.getTime() + (NUDGE_WINDOW_MIN_HOURS - TZ_PADDING_HOURS) * 3600 * 1000,
    )
    const windowEnd = new Date(
      now.getTime() + (NUDGE_WINDOW_MAX_HOURS + TZ_PADDING_HOURS) * 3600 * 1000,
    )

    const { data: events, error: eventsErr } = await supabase
      .from('events')
      .select('id, title, date_start, address, timezone, collectives!inner(timezone, slug)')
      .eq('status', 'published')
      .eq('is_ticketed', true)
      .neq('collectives.slug', 'test')
      .gte('date_start', windowStart.toISOString())
      .lte('date_start', windowEnd.toISOString())

    if (eventsErr) {
      console.error('[event-safety-gap-nudge] event query failed:', eventsErr.message)
      return new Response(
        JSON.stringify({ success: false, error: eventsErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    for (const event of ((events ?? []) as unknown) as EventRow[]) {
      results.events_considered++
      if (isTestEvent(event)) continue
      // The window is judged in the AUDIENCE's wall-clock frame, because
      // date_start is stored in that frame. The cadence below is deliberately
      // NOT: `event_safety_nudges_sent.sent_at` defaults to the database's real
      // now(), so measuring the 48h gap against a shifted clock would move
      // every gap by the audience offset. Two clocks, two jobs.
      if (!isEventInNudgeWindow(event.date_start, wallClockNowInTz(audienceTzFor(event)))) continue
      results.events_in_window++

      const outcome = await nudgeEvent(supabase, event, now)
      results.seats += outcome.seats
      results.seats_without_profile += outcome.seatsWithoutProfile
      results.nudges_claimed += outcome.claimed
      results.emails_sent += outcome.sent
      results.errors += outcome.errors
    }

    console.log('[event-safety-gap-nudge]', JSON.stringify(results))

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[event-safety-gap-nudge] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}))

// ── One event ──

async function nudgeEvent(
  supabase: Db,
  event: EventRow,
  now: Date,
): Promise<{ seats: number; seatsWithoutProfile: number; claimed: number; sent: number; errors: number }> {
  const empty = { seats: 0, seatsWithoutProfile: 0, claimed: 0, sent: 0, errors: 0 }

  // A seat is a live ticket OR a live registration. Both tables are read
  // because a ticketed event carries either artefact depending on how the
  // person got in (paid checkout, free claim, admin registration, organiser
  // hold), exactly as the app-open gate reads both.
  const [ticketsRes, regsRes] = await Promise.all([
    supabase
      .from('event_tickets')
      .select('user_id')
      .eq('event_id', event.id)
      .in('status', LIVE_TICKET_STATUSES as unknown as string[]),
    supabase
      .from('event_registrations')
      .select('user_id')
      .eq('event_id', event.id)
      .in('status', LIVE_REGISTRATION_STATUSES as unknown as string[]),
  ])

  if (ticketsRes.error || regsRes.error) {
    // An unanswered question is not an empty answer. Bail on this event and
    // let the next hourly fire retry; nothing has been claimed or sent.
    console.error(
      `[event-safety-gap-nudge] seat query failed for event ${event.id}:`,
      ticketsRes.error?.message ?? regsRes.error?.message,
    )
    return { ...empty, errors: 1 }
  }

  const seats: SeatRow[] = [
    ...((ticketsRes.data ?? []) as SeatRow[]),
    ...((regsRes.data ?? []) as SeatRow[]),
  ]
  if (!seats.length) return empty

  const userIds = [...new Set(seats.map((s) => s.user_id).filter((id): id is string => !!id))]
  if (!userIds.length) return { ...empty, seats: seats.length }

  // Chunked because PostgREST echoes the whole `.in()` filter back in a
  // content-location response header, and a large one-shot list blows Deno's
  // 16KiB header cap (Sentry COEXIST-1D). Today's largest ticketed cohort is
  // 22, but the helper costs nothing and the cap is not ours to assume.
  const { rows: profiles, error: profileErr } = await selectInChunks<ContactProfileRow>(
    userIds,
    (chunk) =>
      supabase
        .from('profiles')
        .select('id, emergency_contact_name, emergency_contact_phone')
        .in('id', chunk),
  )
  if (profileErr) {
    console.error(`[event-safety-gap-nudge] profile query failed for event ${event.id}:`, profileErr)
    return { ...empty, seats: seats.length, errors: 1 }
  }

  const { data: ledger, error: ledgerErr } = await supabase
    .from('event_safety_nudges_sent')
    .select('user_id, follow_up_number, sent_at')
    .eq('event_id', event.id)
  if (ledgerErr) {
    // Without the ledger there is no way to tell a first nudge from a fourth,
    // and guessing would re-send. Retry next fire.
    console.error(`[event-safety-gap-nudge] ledger read failed for event ${event.id}:`, ledgerErr.message)
    return { ...empty, seats: seats.length, errors: 1 }
  }

  const targets = selectSafetyGapCohort({
    seats,
    profiles,
    alreadySent: (ledger ?? []) as NudgeLedgerRow[],
    now,
  })
  const noProfile = seatsWithoutProfile(seats, profiles)
  if (!targets.length) return { ...empty, seats: seats.length, seatsWithoutProfile: noProfile }

  // CLAIM FIRST. `ignoreDuplicates` makes the write race-safe against a second
  // concurrent fire, and `.select()` returns ONLY the rows this call actually
  // inserted, so the send loop below can never mail a step somebody else
  // already claimed. This is the whole idempotency mechanism: the ledger is
  // not a record of what was sent, it is the permit to send.
  const { data: claimedRows, error: claimErr } = await supabase
    .from('event_safety_nudges_sent')
    .upsert(
      targets.map((t) => ({
        event_id: event.id,
        user_id: t.userId,
        follow_up_number: t.followUpNumber,
      })),
      { onConflict: 'event_id,user_id,follow_up_number', ignoreDuplicates: true },
    )
    .select('user_id, follow_up_number')

  if (claimErr) {
    console.error(`[event-safety-gap-nudge] claim failed for event ${event.id}:`, claimErr.message)
    return { ...empty, seats: seats.length, seatsWithoutProfile: noProfile, errors: targets.length }
  }

  const claimed = (claimedRows ?? []) as { user_id: string; follow_up_number: number }[]
  if (!claimed.length) return { ...empty, seats: seats.length, seatsWithoutProfile: noProfile }

  const eventDate = new Date(event.date_start).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  let sent = 0
  let errors = 0
  for (const row of claimed) {
    // send-email resolves the address and honours suppression from the user id
    // alone, the same call shape event-reminders uses. The type is absent from
    // TYPE_TO_PREF_KEY on purpose: this is duty-of-care, not a newsletter.
    const { error: emailErr } = await supabase.functions.invoke('send-email', {
      // supabase-js >= 2.112.2 drops the Authorization header when the project
      // key is new-format (sb_secret_), so the callee answers a silent 401.
      // patterns/unpinned-cdn-import-plus-key-format-migration-is-a-two-input-latent-bug-2026-08-26.md
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
      body: {
        type: 'safety_contact_missing',
        userId: row.user_id,
        data: {
          event_title: event.title,
          event_date: eventDate,
          event_location: event.address ?? '',
          event_url: `https://app.coexistaus.org/events/${event.id}`,
          follow_up_number: row.follow_up_number,
          nudges_total: MAX_SAFETY_NUDGES,
        },
      },
    })
    if (emailErr) {
      // The claim stands. A dropped email costs this person one step of the
      // cadence, which is the trade this function chose on purpose; re-sending
      // it would need the claim released, and a released claim is how a
      // duplicate storm starts.
      console.error(
        `[event-safety-gap-nudge] email failed for user ${row.user_id} event ${event.id}:`,
        emailErr.message,
      )
      errors++
      continue
    }
    sent++
  }

  return {
    seats: seats.length,
    seatsWithoutProfile: noProfile,
    claimed: claimed.length,
    sent,
    errors,
  }
}
