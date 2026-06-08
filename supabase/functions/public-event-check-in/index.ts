// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req: Request) => {
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
      .select('title, collectives(name), public_check_in_enabled, status, date_start, public_check_in_token')
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

    return json({
      event_title: event.title,
      collective_name: (event.collectives as { name: string } | null)?.name ?? '',
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
  if (eventDay !== today) {
    return json({ error: 'Check-in is only available on the day of the event' }, 422)
  }

  // Parse client IP from x-forwarded-for (Supabase Edge Runtime sets this)
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const clientIp = forwarded.split(',')[0].trim() || '0.0.0.0'
  const userAgent = req.headers.get('user-agent') ?? ''

  // Rate limit: max 5 attempts per IP per event per 15 minutes
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { count: attemptCount } = await db
    .from('public_check_in_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .eq('ip', clientIp)
    .gte('attempted_at', fifteenMinsAgo)

  if ((attemptCount ?? 0) >= 5) {
    return json({ error: 'Too many check-in attempts, please wait a few minutes' }, 429)
  }

  // Optional JWT: if the user is logged in, also register them as a proper attendee
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const userToken = authHeader.replace('Bearer ', '')
    try {
      const { data: { user } } = await db.auth.getUser(userToken)
      if (user?.id) {
        // Insert event_registrations (ON CONFLICT DO NOTHING  -  idempotent)
        await db.from('event_registrations').insert({
          event_id: event.id,
          user_id: user.id,
          status: 'attended',
          checked_in_at: new Date().toISOString(),
        }).onConflict('user_id, event_id').ignore()
      }
    } catch {
      // JWT validation failure is non-fatal  -  fall through to walk-in path
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
    // Day-window trigger fires ERRCODE 22023 if not today (double-guard)
    if (walkInError.code === '22023') {
      return json({ error: 'Check-in is only available on the day of the event' }, 422)
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
})
