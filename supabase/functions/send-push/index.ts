// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { selectInChunks } from '../_shared/select-in-chunks.ts'

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
  /** Target all members of a chat channel (staff / campout / carpool group chat) */
  channelId?: string
  /** Notification content */
  title: string
  body: string
  /** Deep link data */
  data?: Record<string, string>
  /** Silent notification (data-only, no alert) */
  silent?: boolean
  /**
   * Broadcast mode: also write an in-app notification feed row for every
   * resolved recipient (service role, RLS-safe). Used by the leader broadcast
   * in campout / carpool channels, where the client cannot read the channel
   * membership (chat_channel_members RLS) to build the rows itself. The push
   * itself is pref/quiet-hours filtered; the in-app feed row is written for
   * every recipient (minus sender / blockers), matching the collective
   * broadcast which inserts feed rows for all members regardless of push prefs.
   */
  inApp?: { type: string }
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

Deno.serve(withSentry('send-push', async (req: Request) => {
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
    if (payload.channelId && !UUID_RE.test(payload.channelId)) {
      return new Response(JSON.stringify({ error: 'Invalid channelId', sent: 0 }), {
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
    } else if (payload.channelId) {
      // Resolve channel members SERVER-SIDE (service role bypasses RLS). This is
      // the ONLY way campout / carpool group-chat push reaches everyone: the
      // chat_channel_members SELECT policy is (user_id = auth.uid() OR
      // is_admin_or_staff), so a ticket-holder participant sender can read only
      // their OWN membership row client-side and would resolve an empty
      // recipient set. Exclude the sender from their own push below.
      const { data: members } = await supabaseAdmin
        .from('chat_channel_members')
        .select('user_id')
        .eq('channel_id', payload.channelId)
      targetUserIds = (members ?? [])
        .map((m: { user_id: string }) => m.user_id)
        .filter((id: string) => id !== callerUid)
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

        if (payload.channelId) {
          // Channel push (staff / campout / carpool group chat): authorize by
          // MEMBERSHIP in that channel, not by shared collective. Campout &
          // carpool channels are cross-collective by design (their members are
          // ticket holders drawn from many regions - live data: a single campout
          // channel spans 14-16 distinct collectives), so the shared-collective
          // check below would 403 every participant-sent campout message. Targets
          // are resolved server-side from chat_channel_members, so a member can
          // only notify the channel they belong to - no arbitrary-recipient
          // injection. The /admin route guard above still applies.
          const { data: myMembership } = await supabaseAdmin
            .from('chat_channel_members')
            .select('user_id')
            .eq('channel_id', payload.channelId)
            .eq('user_id', callerUid)
            .maybeSingle()
          if (!myMembership) {
            return new Response(JSON.stringify({ error: 'Forbidden: not a member of this channel', sent: 0 }), {
              status: 403, headers: JSON_HEADERS,
            })
          }
        } else {
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
              // CHUNKED, and the error is READ. Until 2026-08-30 this was one
              // `.in('user_id', others)` carrying every co-member's UUID, and
              // PostgREST echoes the whole filter back in a `content-location`
              // response header: at ~400 recipients that header alone was 15.6KB
              // and the response headers totalled 16.5KB, past Deno's 16KiB cap,
              // so the fetch THREW. The error was discarded, `reachable` stayed
              // empty, every co-member read as unreachable, and the sender got
              // 403 "targets outside your collectives". Chat push was dead for
              // Perth (398 members) and Melbourne City (660). Sentry COEXIST-1D.
              const { rows: shared, error } = await selectInChunks<{ user_id: string }>(
                others,
                (batch) =>
                  supabaseAdmin
                    .from('collective_members')
                    .select('user_id')
                    .eq('status', 'active')
                    .in('collective_id', myColIds)
                    .in('user_id', batch),
              )
              if (error) {
                // A membership check that did not complete is NOT a finding that
                // the recipients are strangers. Fail closed (nothing is sent) but
                // say so distinguishably, so this can never again be read as an
                // authorization verdict against the sender.
                console.error('[send-push] membership check failed:', error)
                return new Response(
                  JSON.stringify({ error: 'push_authorization_check_failed', sent: 0 }),
                  { status: 503, headers: JSON_HEADERS },
                )
              }
              reachable = new Set(shared.map((r) => r.user_id))
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
    }

    // Exclude recipients who have BLOCKED the sender. Block filtering was
    // client-side display-only (use-chat.ts hides blocked users' messages);
    // push recipients were all active members minus the sender, with no
    // user_blocks exclusion, so a blocked user still received notifications
    // from the very person who blocked them. This is the authoritative gate.
    // Only applies to a personal sender (callerUid); service-role / system
    // broadcasts have no sender to have been blocked.
    if (callerUid && targetUserIds.length > 0) {
      // Chunked for the same header-echo reason as the membership check above.
      // Unread, this query's failure silently decided nobody had blocked the
      // sender, which pushes a blocked user a notification from the very person
      // they blocked. Fail closed: send nothing rather than send to a blocker.
      const { rows: blockedBy, error: blockErr } = await selectInChunks<{ blocker_id: string }>(
        targetUserIds,
        (batch) =>
          supabaseAdmin
            .from('user_blocks')
            .select('blocker_id')
            .eq('blocked_id', callerUid)
            .in('blocker_id', batch),
      )
      if (blockErr) {
        console.error('[send-push] block check failed:', blockErr)
        return new Response(
          JSON.stringify({ error: 'push_block_check_failed', sent: 0 }),
          { status: 503, headers: JSON_HEADERS },
        )
      }
      const blockers = new Set(blockedBy.map((b) => b.blocker_id))
      if (blockers.size > 0) {
        targetUserIds = targetUserIds.filter((id) => !blockers.has(id))
      }
    }

    // Broadcast in-app feed rows (service role, RLS-safe). Written for EVERY
    // resolved recipient before the push token/pref filter, so a channel
    // broadcast lands in the in-app feed even for members with no push token or
    // push disabled - the same guarantee the collective broadcast gives by
    // inserting notification rows client-side. Only when the caller asked for it.
    if (payload.inApp && typeof payload.inApp.type === 'string' && targetUserIds.length > 0) {
      await supabaseAdmin.from('notifications').insert(
        targetUserIds.map((uid: string) => ({
          user_id: uid,
          type: payload.inApp!.type,
          title: payload.title,
          body: payload.body,
          data: payload.data ?? {},
        })),
      )
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: JSON_HEADERS,
      })
    }

    // Fetch push tokens for target users. Chunked for the header-echo reason
    // above; unread, a failure here returned a cheerful sent:0 for a collective
    // whose members all have devices.
    const { rows: tokens, error: tokenErr } = await selectInChunks<PushToken>(
      targetUserIds,
      (batch) =>
        supabaseAdmin
          .from('push_tokens')
          .select('token, platform, user_id')
          .in('user_id', batch),
    )
    if (tokenErr) {
      console.error('[send-push] push_tokens lookup failed:', tokenErr)
      return new Response(
        JSON.stringify({ error: 'push_token_lookup_failed', sent: 0 }),
        { status: 503, headers: JSON_HEADERS },
      )
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: JSON_HEADERS,
      })
    }

    // Check notification preferences + quiet hours. Chunked for the header-echo
    // reason above; unread, a failure here emptied prefsMap, which reads as
    // "nobody set a preference" and pushes every member through quiet hours.
    const { rows: profiles, error: prefsErr } = await selectInChunks<
      { id: string; notification_preferences: unknown }
    >(
      targetUserIds,
      (batch) =>
        supabaseAdmin
          .from('profiles')
          .select('id, notification_preferences')
          .in('id', batch),
    )
    if (prefsErr) {
      console.error('[send-push] preferences lookup failed:', prefsErr)
      return new Response(
        JSON.stringify({ error: 'push_preferences_lookup_failed', sent: 0 }),
        { status: 503, headers: JSON_HEADERS },
      )
    }

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
      // The fifth instance of the same class, and the densest: an FCM token runs
      // ~163 characters against a UUID's 36, so 20 tokens already weigh about
      // what 100 UUIDs do. Chunked at 20 to match that budget. The error is
      // LOGGED and never returned: the pushes have already gone out by this
      // point, so a failed cleanup is a stale row to sweep later, not a reason
      // to tell the caller the send failed. Exposure on a DELETE is unproven
      // (a prod DELETE is not something to probe for curiosity), but the rule
      // this function now follows is chunk any .in() built from a list that
      // scales with the data, and this is one.
      const { error: cleanupErr } = await selectInChunks<never>(
        invalidTokens.map((t) => t.token),
        (batch) =>
          supabaseAdmin
            .from('push_tokens')
            .delete()
            .in('token', batch) as unknown as PromiseLike<{ data: never[] | null; error: unknown }>,
        20,
      )
      if (cleanupErr) {
        console.error('[send-push] invalid-token cleanup failed:', cleanupErr)
      }
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
}))
