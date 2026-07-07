// Deno Edge Function — debug-push
//
// One-shot push trigger used during diagnostics. Bypasses the push_tokens
// table, notification_preferences, and quiet_hours so we can send a known
// token directly to FCM and see the raw response (status, error code,
// error body). Auth-gated via service-role key OR a hardcoded debug
// passphrase so we can call it from outside the app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

interface DebugPushPayload {
  /** Optional: send to a stored user's tokens instead of a raw token */
  userId?: string
  /** Optional: send to this raw FCM token (bypasses push_tokens lookup) */
  token?: string
  /** Optional: silent / data-only push */
  silent?: boolean
  title?: string
  body?: string
  /** Optional extra data fields */
  data?: Record<string, string>
}

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') ?? ''
const FCM_SERVICE_ACCOUNT_KEY_RAW = Deno.env.get('FCM_SERVICE_ACCOUNT_KEY') ?? ''
const DEBUG_PUSH_PASSPHRASE = Deno.env.get('DEBUG_PUSH_PASSPHRASE') ?? 'coexist-debug-2026'

let FCM_SERVICE_ACCOUNT_KEY: string
try {
  JSON.parse(FCM_SERVICE_ACCOUNT_KEY_RAW)
  FCM_SERVICE_ACCOUNT_KEY = FCM_SERVICE_ACCOUNT_KEY_RAW
} catch {
  try {
    FCM_SERVICE_ACCOUNT_KEY = atob(FCM_SERVICE_ACCOUNT_KEY_RAW)
  } catch {
    FCM_SERVICE_ACCOUNT_KEY = ''
  }
}

function base64url(input: string | ArrayBuffer): string {
  let b64: string
  if (typeof input === 'string') {
    b64 = btoa(input)
  } else {
    b64 = btoa(String.fromCharCode(...new Uint8Array(input)))
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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

async function getAccessToken(diagnostics: Record<string, unknown>): Promise<string> {
  const key = JSON.parse(FCM_SERVICE_ACCOUNT_KEY)
  diagnostics.fcm_client_email = key.client_email
  diagnostics.fcm_project_in_key = key.project_id

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
  if (!resp.ok) {
    diagnostics.oauth_error = json
    throw new Error('Failed to mint OAuth token: ' + JSON.stringify(json))
  }
  return json.access_token as string
}

async function sendOne(
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  silent: boolean,
): Promise<{ status: number; ok: boolean; response: unknown; tokenPrefix: string }> {
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
      headers: { 'apns-priority': '10' },
      payload: { aps: { alert: { title, body }, sound: 'default', badge: 1 } },
    }
  } else {
    message.android = { priority: 'high' }
    message.apns = {
      headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
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

  let parsed: unknown
  try {
    parsed = await resp.json()
  } catch {
    parsed = await resp.text()
  }
  return {
    status: resp.status,
    ok: resp.ok,
    response: parsed,
    tokenPrefix: token.slice(0, 16),
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-debug-passphrase, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(withSentry('debug-push', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const diagnostics: Record<string, unknown> = {
    received_at: new Date().toISOString(),
    fcm_project_id_env: FCM_PROJECT_ID,
    fcm_service_account_key_present: FCM_SERVICE_ACCOUNT_KEY.length > 0,
    fcm_service_account_key_length: FCM_SERVICE_ACCOUNT_KEY.length,
  }

  try {
    // Auth: accept either service-role key OR debug passphrase header
    const authHeader = req.headers.get('Authorization') ?? ''
    const debugPass = req.headers.get('x-debug-passphrase') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

    const authed =
      (bearer && bearer === serviceRoleKey) ||
      (debugPass && debugPass === DEBUG_PUSH_PASSPHRASE)

    if (!authed) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — supply service-role bearer OR x-debug-passphrase header', diagnostics }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    if (!FCM_PROJECT_ID) {
      return new Response(
        JSON.stringify({ error: 'FCM_PROJECT_ID env var not set', diagnostics }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }
    if (!FCM_SERVICE_ACCOUNT_KEY) {
      return new Response(
        JSON.stringify({ error: 'FCM_SERVICE_ACCOUNT_KEY env var not set or unparseable', diagnostics }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const payload = (await req.json()) as DebugPushPayload
    const title = payload.title ?? 'Co-Exist debug push'
    const body = payload.body ?? 'If you can see this, it works.'
    const silent = payload.silent ?? false
    const data = payload.data ?? { type: 'debug', sent_at: new Date().toISOString() }

    diagnostics.payload_title = title
    diagnostics.payload_body = body
    diagnostics.payload_silent = silent

    // Resolve target tokens
    let tokens: Array<{ token: string; platform?: string; source: 'raw' | 'db' }> = []

    if (payload.token) {
      tokens = [{ token: payload.token, source: 'raw' }]
    } else if (payload.userId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: rows, error } = await supabaseAdmin
        .from('push_tokens')
        .select('token, platform')
        .eq('user_id', payload.userId)
      if (error) {
        diagnostics.db_error = error.message
      }
      diagnostics.tokens_found_in_db = rows?.length ?? 0
      tokens = (rows ?? []).map((r) => ({ token: r.token, platform: r.platform, source: 'db' as const }))
    } else {
      return new Response(
        JSON.stringify({ error: 'Must provide token or userId', diagnostics }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No tokens to send to', diagnostics }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const accessToken = await getAccessToken(diagnostics)
    diagnostics.oauth_token_minted = true

    const results = await Promise.all(
      tokens.map((t) =>
        sendOne(accessToken, t.token, title, body, data, silent).catch((err) => ({
          status: 0,
          ok: false,
          response: { error: String(err) },
          tokenPrefix: t.token.slice(0, 16),
        })),
      ),
    )

    return new Response(
      JSON.stringify({ diagnostics, results, sent_count: results.filter((r) => r.ok).length, total: results.length }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  } catch (err) {
    diagnostics.fatal_error = String(err)
    return new Response(
      JSON.stringify({ error: 'Internal error', diagnostics }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
}))
