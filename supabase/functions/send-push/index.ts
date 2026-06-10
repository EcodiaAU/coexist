// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PushPayload {
  /** Target a single user */
  userId?: string
  /** Target multiple users */
  userIds?: string[]
  /** Target all members of a collective */
  collectiveId?: string
  /** Notification content */
  title: string
  body: string
  /** Deep link data */
  data?: Record<string, string>
  /** Silent notification (data-only, no alert) */
  silent?: boolean
}

interface PushToken {
  token: string
  platform: 'ios' | 'android'
  user_id: string
}

/* ------------------------------------------------------------------ */
/*  FCM HTTP v1 sender                                                 */
/* ------------------------------------------------------------------ */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') ?? ''
const FCM_SERVICE_ACCOUNT_KEY_RAW = Deno.env.get('FCM_SERVICE_ACCOUNT_KEY') ?? ''

// Support both raw JSON and base64-encoded JSON
let FCM_SERVICE_ACCOUNT_KEY: string
try {
  // Try parsing as raw JSON first
  JSON.parse(FCM_SERVICE_ACCOUNT_KEY_RAW)
  FCM_SERVICE_ACCOUNT_KEY = FCM_SERVICE_ACCOUNT_KEY_RAW
} catch {
  // Assume base64-encoded
  FCM_SERVICE_ACCOUNT_KEY = atob(FCM_SERVICE_ACCOUNT_KEY_RAW)
}

// Base64url encoding (RFC 4648 §5) - required for JWT
function base64url(input: string | ArrayBuffer): string {
  let b64: string
  if (typeof input === 'string') {
    b64 = btoa(input)
  } else {
    b64 = btoa(String.fromCharCode(...new Uint8Array(input)))
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Cache the OAuth token to avoid requesting a new one per push send
let cachedAccessToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-minute safety margin)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedAccessToken
  }

  // Use service account key to get OAuth2 token for FCM v1 API
  const key = JSON.parse(FCM_SERVICE_ACCOUNT_KEY)
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )

  // Sign JWT with private key
  const encoder = new TextEncoder()
  const data = encoder.encode(`${header}.${claim}`)

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(key.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, data)
  const jwt = `${header}.${claim}.${base64url(signature)}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const json = await resp.json()
  cachedAccessToken = json.access_token
  tokenExpiresAt = Date.now() + 3600 * 1000 // 1 hour
  return json.access_token
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function sendFcmMessage(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  silent: boolean,
): Promise<'sent' | 'invalid' | 'transient'> {
  const accessToken = await getAccessToken()

  const message: Record<string, unknown> = {
    token,
    data,
  }

  if (!silent) {
    message.notification = { title, body }
    message.android = {
      priority: 'high',
      notification: { sound: 'default', channel_id: 'coexist_default' },
    }
    message.apns = {
      payload: { aps: { sound: 'default', badge: 1 } },
    }
  } else {
    // Silent / data-only
    message.android = { priority: 'high' }
    message.apns = {
      payload: { aps: { 'content-available': 1 } },
    }
  }

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    },
  )

  if (!resp.ok) {
    const err = await resp.text()
    console.error(`[send-push] FCM error for token ${token.slice(0, 12)}...:`, err)
    // Return error detail so caller can distinguish permanent vs transient failures
    try {
      const parsed = JSON.parse(err)
      const errorCode = parsed?.error?.details?.[0]?.errorCode ?? parsed?.error?.status ?? ''
      // Only mark as invalid if the token is permanently unregistered
      if (errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT') {
        return 'invalid'
      }
    } catch { /* non-JSON error response */ }
    return 'transient'
  }
  return 'sent'
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  try {
    // Auth: require service-role key or authenticated user.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization', sent: 0 }), {
        status: 401, headers: JSON_HEADERS,
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Distinguish a trusted internal caller (service-role: crons, DB triggers,
    // sibling edge functions) from an end-user JWT. End-user callers are
    // authorized below (collective-scoped); service-role is unrestricted.
    let isServiceRole = false
    let callerUid: string | null = null
    if (token === serviceRoleKey) {
      isServiceRole = true
    } else {
      // Validate as user token via GoTrue directly
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const gotruRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceRoleKey },
      })
      if (!gotruRes.ok) {
        return new Response(JSON.stringify({ error: 'Invalid token', sent: 0 }), {
          status: 401, headers: JSON_HEADERS,
        })
      }
      const gotruUser = await gotruRes.json().catch(() => null)
      callerUid = gotruUser?.id ?? null
      if (!callerUid) {
        return new Response(JSON.stringify({ error: 'Invalid token', sent: 0 }), {
          status: 401, headers: JSON_HEADERS,
        })
      }
    }

    const payload = (await req.json()) as PushPayload

    // ---- Input validation ----
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (!payload.title || typeof payload.title !== 'string' || payload.title.length > 200) {
      return new Response(JSON.stringify({ error: 'title required (max 200 chars)', sent: 0 }), {
        status: 400, headers: JSON_HEADERS,
      })
    }
    if (!payload.body || typeof payload.body !== 'string' || payload.body.length > 1000) {
      return new Response(JSON.stringify({ error: 'body required (max 1000 chars)', sent: 0 }), {
        status: 400, headers: JSON_HEADERS,
      })
    }
    if (payload.userId && !UUID_RE.test(payload.userId)) {
      return new Response(JSON.stringify({ error: 'Invalid userId', sent: 0 }), {
        status: 400, headers: JSON_HEADERS,
      })
    }
    if (payload.userIds) {
      if (!Array.isArray(payload.userIds) || payload.userIds.length > 500) {
        return new Response(JSON.stringify({ error: 'userIds must be array (max 500)', sent: 0 }), {
          status: 400, headers: JSON_HEADERS,
        })
      }
      if (payload.userIds.some((id: string) => !UUID_RE.test(id))) {
        return new Response(JSON.stringify({ error: 'Invalid UUID in userIds', sent: 0 }), {
          status: 400, headers: JSON_HEADERS,
        })
      }
    }
    if (payload.collectiveId && !UUID_RE.test(payload.collectiveId)) {
      return new Response(JSON.stringify({ error: 'Invalid collectiveId', sent: 0 }), {
        status: 400, headers: JSON_HEADERS,
      })
    }

    // Init Supabase with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolve target user IDs
    let targetUserIds: string[] = []

    if (payload.userId) {
      targetUserIds = [payload.userId]
    } else if (payload.userIds) {
      targetUserIds = payload.userIds
    } else if (payload.collectiveId) {
      const { data: members } = await supabaseAdmin
        .from('collective_members')
        .select('user_id')
        .eq('collective_id', payload.collectiveId)
        .eq('status', 'active')
      targetUserIds = (members ?? []).map((m: { user_id: string }) => m.user_id)
    }

    // ── Authorization (end-user callers only) ──
    // service-role (crons / DB triggers / sibling edge fns) is unrestricted.
    // End-user JWTs: privileged roles (any non-participant: admin/manager/
    // national_leader/leader/co_leader/assist_leader) keep full reach, since
    // leader/admin flows legitimately push to event attendees + staff channels.
    // Plain 'participant' callers (open registration) are scoped: no /admin
    // deep-link, and targets must share an active collective with them. This
    // closes the abuse vector (arbitrary push + forced /admin nav to any user
    // or whole foreign collective) without breaking collective chat, where
    // recipients are always co-members of the caller's collective.
    if (!isServiceRole && callerUid) {
      const route = String(payload.data?.route ?? payload.data?.url ?? '')

      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', callerUid)
        .maybeSingle()
      const callerRole = (callerProfile?.role as string | undefined) ?? 'participant'
      const isPrivileged = callerRole !== 'participant'

      if (!isPrivileged) {
        if (route.startsWith('/admin')) {
          return new Response(JSON.stringify({ error: 'Forbidden', sent: 0 }), {
            status: 403, headers: JSON_HEADERS,
          })
        }

        const { data: myCols } = await supabaseAdmin
          .from('collective_members')
          .select('collective_id')
          .eq('user_id', callerUid)
          .eq('status', 'active')
        const myColIds = (myCols ?? []).map((c: { collective_id: string }) => c.collective_id)

        if (payload.collectiveId && !myColIds.includes(payload.collectiveId)) {
          return new Response(JSON.stringify({ error: 'Forbidden', sent: 0 }), {
            status: 403, headers: JSON_HEADERS,
          })
        }

        const others = targetUserIds.filter((id) => id !== callerUid)
        if (others.length > 0) {
          let reachable = new Set<string>()
          if (myColIds.length > 0) {
            const { data: shared } = await supabaseAdmin
              .from('collective_members')
              .select('user_id')
              .eq('status', 'active')
              .in('collective_id', myColIds)
              .in('user_id', others)
            reachable = new Set((shared ?? []).map((r: { user_id: string }) => r.user_id))
          }
          const unreachable = others.filter((id) => !reachable.has(id))
          if (unreachable.length > 0) {
            return new Response(JSON.stringify({ error: 'Forbidden: targets outside your collectives', sent: 0 }), {
              status: 403, headers: JSON_HEADERS,
            })
          }
        }
      }
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: JSON_HEADERS,
      })
    }

    // Fetch push tokens for target users
    const { data: tokens } = await supabaseAdmin
      .from('push_tokens')
      .select('token, platform, user_id')
      .in('user_id', targetUserIds)

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: JSON_HEADERS,
      })
    }

    // Check notification preferences + quiet hours
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, notification_preferences')
      .in('id', targetUserIds)

    const prefsMap = new Map<string, Record<string, unknown>>()
    for (const p of profiles ?? []) {
      if (p.notification_preferences) {
        prefsMap.set(p.id, p.notification_preferences as Record<string, unknown>)
      }
    }

    // Filter tokens by user preferences
    const notifType = payload.data?.type
    const filteredTokens = (tokens as PushToken[]).filter((t) => {
      const userPrefs = prefsMap.get(t.user_id)
      if (!userPrefs || !notifType) return true

      // Check if notification type is disabled
      if (userPrefs[notifType] === false) return false

      // Master gate: chat_messages toggle disables ALL chat_* subtypes.
      // The "Chat Messages" toggle in /settings/notifications is the primary
      // toggle - if user turned that OFF, they expect silence on every chat
      // event (replies, images, polls, mentions, announcements) regardless of
      // the granular toggle state. Mirrors the UX intent.
      if (
        typeof notifType === 'string' &&
        notifType.startsWith('chat_') &&
        notifType !== 'chat_messages' &&
        userPrefs.chat_messages === false
      ) {
        return false
      }

      // Check quiet hours (using user's timezone, not server UTC)
      if (userPrefs.quiet_hours_enabled) {
        const userTz = (userPrefs.timezone as string) || 'Australia/Sydney'
        const now = new Date()
        // Get current time in the user's timezone
        const userTime = new Intl.DateTimeFormat('en-AU', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: userTz,
        }).format(now)
        const current = userTime // "HH:MM"
        const start = (userPrefs.quiet_hours_start as string) ?? '22:00'
        const end = (userPrefs.quiet_hours_end as string) ?? '07:00'

        // Handle overnight range (e.g. 22:00 - 07:00)
        if (start > end) {
          if (current >= start || current < end) return false
        } else {
          if (current >= start && current < end) return false
        }
      }

      return true
    })

    // Send to all filtered tokens in parallel
    const results = await Promise.allSettled(
      filteredTokens.map((t) =>
        sendFcmMessage(
          t.token,
          payload.title,
          payload.body,
          payload.data ?? {},
          payload.silent ?? false,
        ),
      ),
    )

    const sent = results.filter(
      (r) => r.status === 'fulfilled' && r.value === 'sent',
    ).length

    // Only clean up tokens that are permanently invalid (UNREGISTERED), not transient failures
    const invalidTokens = filteredTokens.filter(
      (_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<string>).value === 'invalid',
    )
    if (invalidTokens.length > 0) {
      await supabaseAdmin
        .from('push_tokens')
        .delete()
        .in('token', invalidTokens.map((t) => t.token))
    }

    return new Response(JSON.stringify({ sent, total: filteredTokens.length }), {
      headers: JSON_HEADERS,
    })
  } catch (err) {
    console.error('[send-push] Error:', err)
    // Return 200 to prevent retries
    return new Response(
      JSON.stringify({ error: 'Internal error', sent: 0 }),
      { status: 200, headers: JSON_HEADERS },
    )
  }
})
