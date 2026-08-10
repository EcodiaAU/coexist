// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * public-event-check-in  -  Public QR check-in endpoint for Co-Exist events.
 *
 * Entry point for the /check-in/:token public form. Anyone with the QR link
 * can submit their name + email and be recorded as a walk-in attendee.
 *
 * Routes:
 *   POST /    -  Submit check-in { token, first_name, email, phone?, website_url? }
 *   GET  /info?token=...  -  Fetch event title + collective name for the form header
 *
 * DEPLOY FLAG (load-bearing): this function MUST be deployed with
 * `--no-verify-jwt` (verify_jwt=false). It is a PUBLIC anonymous endpoint - the
 * /check-in/:token page calls it with a plain fetch() and NO apikey/Authorization
 * header (a phone scanning a QR has no Supabase session). With verify_jwt=true the
 * Supabase gateway 401s every request ("Missing authorization header") BEFORE the
 * function runs, so the page shows "Link not found / invalid or has expired" for
 * every valid token. The function self-authenticates (token + honeypot + IP
 * rate-limit + event-day guard), so anonymous gateway access is safe + intended.
 * Regression found + fixed 2026-06-08. Re-deploy: supabase functions deploy
 * public-event-check-in --no-verify-jwt .
 *
 * Security posture:
 *   - CORS open (*)  -  public endpoint, phones scanning QR won't send Origin
 *   - Honeypot field `website_url`: silent drop, bots don't learn they failed
 *   - Rate limit: 5 attempts / IP / event / 15 min via public_check_in_rate_limits
 *   - Date guard: AEST calendar-day must match event.date_start
 *   - Optional JWT: if the scanner is a logged-in app user, also creates an
 *     event_registrations row (status=attended) so they appear on the leader view
 *   - NEVER hardcodes SUPABASE_SERVICE_ROLE_KEY  -  always Deno.env.get()
 *
 * Default: the GET /info route is always safe (read-only). POST only writes on
 * valid token + correct day + within rate limit. Absent params → 400 errors, not
 * silent write defaults (per edge-function-safe-defaults doctrine).
 */

/* ------------------------------------------------------------------ */
/*  CORS helpers                                                       */
/* ------------------------------------------------------------------ */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/* ------------------------------------------------------------------ */
/*  Floating-local date helpers                                        */
/* ------------------------------------------------------------------ */
// date_start stores the host's wall-clock stamped as UTC, so the event's
// calendar day is the UTC slice. "today" is the real current day in the
// event's collective timezone (the scanner is physically at the event).
// Formatting the stored wall-clock in Sydney rolled afternoon events +1 day
// and rejected valid same-day check-ins.

function eventDateUTC(isoString: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString))
}

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

Deno.serve(withSentry('public-event-check-in', async (req: Request) => {
  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)

  // Create a service-role client for all DB operations (bypasses RLS for
  // public_form inserts which have no anonymous INSERT policy).
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceRoleKey)

  /* ---- GET /info?token=... ---- */
  if (req.method === 'GET') {
    const token = url.searchParams.get('token')
    if (!token) {
      return json({ error: 'token required' }, 400)
    }

    const { data: event, error } = await db
      .from('events')
      .select('title, collectives(name, timezone), public_check_in_enabled, status, date_start, address, cover_image_url, activity_type, timezone, public_check_in_token')
      .eq('public_check_in_token', token)
      .single()

    if (error || !event) {
      return json({ error: 'Event not found or check-in disabled' }, 404)
    }
    if (!event.public_check_in_enabled) {
      return json({ error: 'Public check-in is not enabled for this event' }, 404)
    }
    if (['cancelled', 'draft'].includes(event.status)) {
      return json({ error: 'Event not available' }, 404)
    }

    const collective = event.collectives as { name: string; timezone: string | null } | null
    return json({
      event_title: event.title,
      collective_name: collective?.name ?? '',
      cover_image_url: event.cover_image_url ?? null,
      date_start: event.date_start ?? null,
      address: event.address ?? null,
      activity_type: event.activity_type ?? null,
      timezone: event.timezone ?? collective?.timezone ?? null,
    })
  }

  /* ---- POST /  -  submit check-in ---- */
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { token, first_name, email, phone, website_url } = body

  // Required params
  if (!token) return json({ error: 'token required' }, 400)
  if (!first_name?.trim()) return json({ error: 'first_name required' }, 400)
  if (!email?.trim() && !phone?.trim()) {
    return json({ error: 'email or phone required' }, 400)
  }

  // Honeypot: if website_url is non-empty the submitter is likely a bot.
  // Return 200 silently so bots don't learn they failed.
  if (website_url) {
    return json({ ok: true })
  }

  // Look up the event by token
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, date_start, status, public_check_in_enabled, collective_id, collectives(name, timezone)')
    .eq('public_check_in_token', token)
    .single()

  if (eventError || !event) {
    return json({ error: 'Event not found or check-in disabled' }, 404)
  }
  if (!event.public_check_in_enabled) {
    return json({ error: 'Public check-in is not enabled for this event' }, 404)
  }
  if (['cancelled', 'draft'].includes(event.status)) {
    return json({ error: 'This event is not available for check-in' }, 422)
  }

  // Date guard: must be the event's calendar day. Event day = stored wall-clock
  // day (UTC slice); "today" = current day in the event's collective timezone.
  const eventTz = (event.collectives as { timezone?: string } | null)?.timezone ?? 'Australia/Sydney'
  const eventDay = eventDateUTC(event.date_start)
  const today = todayInTz(eventTz)
  // Friendly event-day label (wall-clock UTC slice, matching eventDay) so the
  // off-day error names the actual date instead of a bare "not today".
  const eventDayLabel = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(event.date_start))
  if (eventDay !== today) {
    return json({ error: `Check-in opens on the day of the event, ${eventDayLabel}.`, event_day: eventDay }, 422)
  }

  // Parse client IP from x-forwarded-for (Supabase Edge Runtime sets this)
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const clientIp = forwarded.split(',')[0].trim() || '0.0.0.0'
  const userAgent = req.headers.get('user-agent') ?? ''

  // Rate limit: max 50 successful check-ins per IP per event per 15 minutes.
  // A row is only written on a SUCCESSFUL walk-in (below), so this counter is a
  // legitimate-check-in throttle, not an abuse counter. The old ceiling of 5
  // blocked real group check-ins: at a campout/planting day dozens of phones
  // share one NAT/CGNAT IP, so the 6th genuine attendee got a 429. 50 fits any
  // realistic single-event arrival burst on a shared hotspot, and the partial
  // unique index on event_walk_ins (event_id, lower(email)/phone) means
  // re-scans/double-submits no longer consume budget (they short-circuit on
  // 23505 before the rate-limit row is written).
  const CHECK_IN_RATE_LIMIT = 50
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { count: attemptCount } = await db
    .from('public_check_in_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .eq('ip', clientIp)
    .gte('attempted_at', fifteenMinsAgo)

  if ((attemptCount ?? 0) >= CHECK_IN_RATE_LIMIT) {
    return json({ error: 'Too many check-in attempts, please wait a few minutes' }, 429)
  }

  // Optional JWT: if the user is logged in, also register them as a proper attendee
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const userToken = authHeader.replace('Bearer ', '')
    try {
      const { data: { user } } = await db.auth.getUser(userToken)
      if (user?.id) {
        // Idempotent registration for a logged-in scanner so they appear on the
        // leader roster. In supabase-js v2, onConflict/ignoreDuplicates are
        // UPSERT options - the old `.insert(...).onConflict(...).ignore()` chain
        // does not exist on the insert builder and threw a TypeError that the
        // catch below swallowed, so this whole path was dead (the member was
        // recorded only as an anonymous walk-in). Uses the real
        // event_registrations_event_id_user_id_key unique constraint.
        const { error: regErr } = await db
          .from('event_registrations')
          .upsert(
            {
              event_id: event.id,
              user_id: user.id,
              status: 'attended',
              checked_in_at: new Date().toISOString(),
            },
            { onConflict: 'event_id,user_id', ignoreDuplicates: true },
          )
        if (regErr) {
          console.error('[public-event-check-in] event_registrations upsert failed:', regErr.message)
        }
      }
    } catch (e) {
      // JWT validation failure is non-fatal  -  fall through to walk-in path.
      // Log it so a future silent throw here is visible (the old dead
      // onConflict chain hid exactly this class of bug).
      console.error('[public-event-check-in] optional-JWT registration failed:', (e as Error).message)
    }
  }

  // Record the walk-in
  const { error: walkInError } = await db.from('event_walk_ins').insert({
    event_id: event.id,
    first_name: first_name.trim(),
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    status: 'attended',
    created_via: 'public_form',
    client_ip: clientIp,
    user_agent: userAgent,
  })

  if (walkInError) {
    // Idempotency: a re-scan / double-submit hits the partial unique index on
    // (event_id, lower(email)) or (event_id, phone) for public_form walk-ins
    // (ERRCODE 23505). That is not an error - the person is already on the list.
    // Return a distinct success so the client can say "already checked in", and
    // do NOT record a rate-limit attempt for it (return before the insert below).
    if (walkInError.code === '23505') {
      return json({ ok: true, already_checked_in: true, message: "You're already checked in!" })
    }
    // Day-window trigger fires ERRCODE 22023 if not today (double-guard)
    if (walkInError.code === '22023') {
      return json({ error: `Check-in opens on the day of the event, ${eventDayLabel}.`, event_day: eventDay }, 422)
    }
    console.error('walk_in insert error:', walkInError)
    return json({ error: 'Check-in failed, please try again' }, 500)
  }

  // Record rate-limit attempt
  await db.from('public_check_in_rate_limits').insert({
    ip: clientIp,
    event_id: event.id,
  })

  return json({ ok: true, message: "You're checked in!" })
}))
