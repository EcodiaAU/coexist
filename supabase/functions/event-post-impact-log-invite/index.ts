// Deno Edge Function
//
// Deploy: SUPABASE_ACCESS_TOKEN=<creds.supabase_access_token> \
//   npx supabase functions deploy event-post-impact-log-invite \
//   --project-ref tjutlbzekfouwsiaplbr --no-verify-jwt
//
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * event-post-impact-log-invite
 *
 * pg_cron-driven hourly sweep (:09). Nudges the LEADERSHIP of each finished
 * event - leader / co_leader / assist_leader of the event's collective - to
 * fill out the event's impact log, with escalating follow-ups until it's done.
 *
 * Completion signal: an `event_impact` row exists for the event. There is one
 * impact log per event (any leader can fill it), so the moment a row appears
 * the nudges stop for the whole leadership team. Matches the canonical
 * "impact logged" signal (migration 20260520000000).
 *
 * Cadence is per-(event, leader), tracked in event_impact_log_invites_sent:
 *   step 0  - >= ~2h after the event ended
 *   step 1  - >= 24h after step 0 was sent
 *   step 2  - >= 48h after step 1 was sent
 *   step 3  - >= 96h after step 2 was sent  (final)
 * Capped at 4 nudges. Gaps are measured in real time from the last sent row,
 * so a backlog event (activated cron, old un-logged event) starts at step 0
 * and escalates one step per qualifying fire rather than blasting all four at
 * once. Events whose end is older than MAX_LOOKBACK_H are abandoned.
 *
 * Push rides the existing 'survey_request' notification toggle (the "Surveys"
 * preference) and deep-links to /events/:id/impact via the explicit `route`
 * field (which the in-app route resolver honours over the type-based default).
 *
 * Auth: service-role bearer. Cron passes it via the plpgsql wrapper.
 */

// Real-time gap (hours) required before each step may fire. GAP_H[0] is measured
// from the event's end; GAP_H[n>0] from the previous step's sent_at.
const GAP_H = [2, 24, 48, 96]
const MAX_STEPS = GAP_H.length
const MAX_LOOKBACK_H = 14 * 24 // stop chasing events that ended > 14 days ago
const HOUR_MS = 60 * 60 * 1000

const COPY: Array<{ title: string; body: (t: string) => string }> = [
  {
    title: 'Log your event’s impact',
    body: (t) => `${t} has wrapped. Take a minute to log its impact so it counts.`,
  },
  {
    title: 'Impact still needs logging',
    body: (t) => `${t} hasn’t had its impact logged yet. It only takes a minute.`,
  },
  {
    title: 'Reminder: log your event’s impact',
    body: (t) => `The impact for ${t} is still missing. Logging it keeps your collective’s numbers accurate.`,
  },
  {
    title: 'Last reminder for this event',
    body: (t) => `Final nudge to log the impact for ${t}. After this we’ll stop reminding you.`,
  },
]

const LEADER_ROLES = ['leader', 'co_leader', 'assist_leader']

Deno.serve(withSentry('event-post-impact-log-invite', async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!serviceRoleKey || token !== serviceRoleKey) {
      return new Response('Forbidden: service-role key required', { status: 403 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
    )

    const now = Date.now()
    const results = { events: 0, nudged: 0, steps: 0, completed_skipped: 0, errors: 0 }

    // Candidate events: started within the lookback window and already begun.
    // Effective end (date_end ?? date_start) is filtered in code below.
    const candidateFloor = new Date(now - (MAX_LOOKBACK_H + 24) * HOUR_MS).toISOString()
    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id, title, date_start, date_end, collective_id')
      .gte('date_start', candidateFloor)
      .lte('date_start', new Date(now).toISOString())

    if (evErr) {
      console.error('[event-post-impact-log-invite] events query failed:', evErr.message)
      return new Response(JSON.stringify({ success: false, error: evErr.message }), { status: 500 })
    }

    if (!events?.length) {
      return new Response(JSON.stringify({ success: true, ...results }), { status: 200 })
    }

    for (
      const e of events as Array<{
        id: string
        title: string
        date_start: string
        date_end: string | null
        collective_id: string | null
      }>
    ) {
      if (!e.collective_id) continue

      const endMs = new Date(e.date_end ?? e.date_start).getTime()
      const hoursSinceEnd = (now - endMs) / HOUR_MS
      // Not finished long enough for the first nudge, or too old to keep chasing.
      if (hoursSinceEnd < GAP_H[0] || hoursSinceEnd > MAX_LOOKBACK_H) continue

      // Completion: any event_impact row for this event => done, stop entirely.
      const { data: impact, error: impErr } = await supabase
        .from('event_impact')
        .select('id')
        .eq('event_id', e.id)
        .limit(1)
        .maybeSingle()
      if (impErr) {
        console.error(`[event-post-impact-log-invite] impact check failed for ${e.id}:`, impErr.message)
        results.errors++
        continue
      }
      if (impact) {
        results.completed_skipped++
        continue
      }

      // Resolve the leadership of the event's collective.
      const { data: leaders, error: ldErr } = await supabase
        .from('collective_members')
        .select('user_id')
        .eq('collective_id', e.collective_id)
        .eq('status', 'active')
        .in('role', LEADER_ROLES)
      if (ldErr) {
        console.error(`[event-post-impact-log-invite] leaders query failed for ${e.id}:`, ldErr.message)
        results.errors++
        continue
      }
      const leaderIds = [...new Set((leaders ?? []).map((l: { user_id: string }) => l.user_id))]
      if (leaderIds.length === 0) continue

      // What's already been sent for this event, per leader.
      const { data: sentRows, error: sentErr } = await supabase
        .from('event_impact_log_invites_sent')
        .select('user_id, follow_up_number, sent_at')
        .eq('event_id', e.id)
        .in('user_id', leaderIds)
      if (sentErr) {
        console.error(`[event-post-impact-log-invite] sent query failed for ${e.id}:`, sentErr.message)
        results.errors++
        continue
      }

      // Per-leader state: how many steps sent + when the last one went out.
      const stateByUser = new Map<string, { count: number; lastSentMs: number }>()
      for (const id of leaderIds) stateByUser.set(id, { count: 0, lastSentMs: 0 })
      for (const r of (sentRows ?? []) as Array<{ user_id: string; follow_up_number: number; sent_at: string }>) {
        const s = stateByUser.get(r.user_id)
        if (!s) continue
        s.count++
        s.lastSentMs = Math.max(s.lastSentMs, new Date(r.sent_at).getTime())
      }

      // Bucket leaders who are due, keyed by the step they're due for.
      const dueByStep = new Map<number, string[]>()
      for (const id of leaderIds) {
        const s = stateByUser.get(id)!
        const step = s.count
        if (step >= MAX_STEPS) continue // capped
        const sinceRefHours = step === 0 ? hoursSinceEnd : (now - s.lastSentMs) / HOUR_MS
        if (sinceRefHours < GAP_H[step]) continue // not yet due
        const bucket = dueByStep.get(step) ?? []
        bucket.push(id)
        dueByStep.set(step, bucket)
      }

      if (dueByStep.size === 0) continue

      let eventNudgedAny = false
      for (const [step, userIds] of dueByStep) {
        const copy = COPY[step]
        try {
          await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userIds,
                title: copy.title,
                body: copy.body(e.title),
                data: {
                  type: 'survey_request',
                  subtype: 'impact_log',
                  event_id: e.id,
                  collective_id: e.collective_id,
                  route: `/events/${e.id}/impact`,
                },
              }),
            },
          )
        } catch (err) {
          console.error(`[event-post-impact-log-invite] push failed for ${e.id} step ${step}:`, (err as Error).message)
          results.errors++
          continue
        }

        // Record what we just sent so the step isn't repeated. Ignore duplicate
        // races on the UNIQUE(event_id, user_id, follow_up_number) constraint.
        const { error: insErr } = await supabase
          .from('event_impact_log_invites_sent')
          .upsert(
            userIds.map((uid) => ({ event_id: e.id, user_id: uid, follow_up_number: step })),
            { onConflict: 'event_id,user_id,follow_up_number', ignoreDuplicates: true },
          )
        if (insErr) {
          console.error(`[event-post-impact-log-invite] sent insert failed for ${e.id} step ${step}:`, insErr.message)
          results.errors++
          continue
        }
        results.nudged += userIds.length
        results.steps++
        eventNudgedAny = true
      }
      if (eventNudgedAny) results.events++
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), { status: 500 })
  }
}))
