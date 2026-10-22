/**
 * mailchimp.ts - the Co-Exist to Mailchimp member sync, pure parts.
 *
 * WHAT THIS IS. Co-Exist sends its own mail through Resend (send-email,
 * send-campaign). Mailchimp is ADDITIVE: an audience that mirrors who our
 * members are, so Co-Exist staff can use Mailchimp for anything Resend is not
 * doing. Nothing here sends mail, and nothing here touches the Resend path.
 *
 * Everything in this file is deterministic or takes its I/O injected, so the
 * rules that decide what a member looks like in Mailchimp are tested directly
 * (supabase/functions/_tests/mailchimp.test.ts) rather than by reading a handler.
 *
 * THE FOUR RULES THAT MATTER, each with a test:
 *
 *  1. IDENTITY. Mailchimp keys a member on md5(lowercase(email)). Every email
 *     is normalised once (normaliseEmail) and hashed from that form, so a
 *     mixed-case address in Co-Exist can never make a second Mailchimp member.
 *
 *  2. A SYNC NEVER RE-SUBSCRIBES SOMEONE MAILCHIMP HAS UNSUBSCRIBED. Mailchimp
 *     is where people press "unsubscribe" on Mailchimp mail. If a webhook was
 *     ever missed, Co-Exist could still read "opted in" for that person, and a
 *     naive PUT {status:'subscribed'} would quietly put them back on the list,
 *     which is a Spam Act problem, not a bug. So an existing member only moves
 *     to 'subscribed' when the change that queued them was a CONSENT change in
 *     Co-Exist (they ticked marketing back on). Every other write sends
 *     status_if_new, which Mailchimp applies to new members only.
 *
 *  3. CO-EXIST OWNS ONLY THE TAGS IT PUSHED. Kurt's team may tag people inside
 *     Mailchimp. A sync removes a tag only if Co-Exist added it last time and
 *     no longer has it (removedTags), never a tag it never pushed.
 *
 *  4. A WEBHOOK IS TRUSTED ONLY IF IT PROVES ITSELF. Mailchimp signs deliveries
 *     with HMAC-SHA256 over "{t}.{raw body}" in X-Mailchimp-Signature, using a
 *     signing secret returned once when the webhook is created. We also put a
 *     random token in the webhook URL and check the audience id, so a forged
 *     POST cannot unsubscribe a member.
 */

import { crypto as stdCrypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.208.0/encoding/hex.ts'

/* ------------------------------------------------------------------ */
/*  Identity                                                           */
/* ------------------------------------------------------------------ */

/** lower(trim()). The single normal form an address is compared and hashed in. */
export function normaliseEmail(email: string | null | undefined): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/** Mailchimp's subscriber_hash: md5 of the lowercased address, hex. */
export async function subscriberHash(email: string): Promise<string> {
  const digest = await stdCrypto.subtle.digest(
    'MD5',
    new TextEncoder().encode(normaliseEmail(email)),
  )
  return encodeHex(new Uint8Array(digest))
}

/**
 * The data centre an API key belongs to is its suffix ("...-us9" -> "us9").
 * A configured server prefix that disagrees with the key is a misconfiguration
 * that would 401 every call, so it is caught here instead.
 */
export function resolveServerPrefix(apiKey: string, configured?: string | null): string {
  const fromKey = (apiKey.split('-').pop() ?? '').trim()
  const conf = (configured ?? '').trim()
  if (!/^[a-z]{2}\d{1,3}$/.test(fromKey)) {
    throw new Error('MAILCHIMP_API_KEY does not end in a data-centre suffix like -us9')
  }
  if (conf && conf !== fromKey) {
    throw new Error(`MAILCHIMP_SERVER_PREFIX (${conf}) does not match the API key's data centre (${fromKey})`)
  }
  return fromKey
}

/* ------------------------------------------------------------------ */
/*  Mapping a Co-Exist contact onto a Mailchimp member                 */
/* ------------------------------------------------------------------ */

/** One row of public.mailchimp_contacts(), already resolved per address. */
export interface CoexistContact {
  email: string
  profile_id: string | null
  first_name: string | null
  last_name: string | null
  /** 'profile' or 'newsletter' (a website signup with no app account). */
  source: string
  /** What Co-Exist says: 'subscribed' or 'unsubscribed'. */
  status: 'subscribed' | 'unsubscribed'
  tags: string[]
}

export interface DesiredMember {
  email: string
  status: 'subscribed' | 'unsubscribed'
  merge_fields: Record<string, string>
  tags: string[]
}

function cleanTag(t: string): string {
  return t.replace(/\s+/g, ' ').trim()
}

/** Distinct, trimmed, non-empty, sorted. Mailchimp caps a tag name at 100 chars. */
export function normaliseTags(tags: (string | null | undefined)[] | null | undefined): string[] {
  const out = new Map<string, string>()
  for (const raw of tags ?? []) {
    if (typeof raw !== 'string') continue
    const t = cleanTag(raw).slice(0, 100)
    if (!t) continue
    const key = t.toLowerCase()
    if (!out.has(key)) out.set(key, t)
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b))
}

export function toDesiredMember(c: CoexistContact): DesiredMember {
  const merge: Record<string, string> = {}
  // Only send a name we actually hold: a null must never blank a name someone
  // typed into Mailchimp by hand.
  if (c.first_name && c.first_name.trim()) merge.FNAME = c.first_name.trim()
  if (c.last_name && c.last_name.trim()) merge.LNAME = c.last_name.trim()
  return {
    email: normaliseEmail(c.email),
    status: c.status === 'unsubscribed' ? 'unsubscribed' : 'subscribed',
    merge_fields: merge,
    tags: normaliseTags(c.tags),
  }
}

/**
 * A stable fingerprint of what we would push. Unchanged fingerprint means a
 * full sync can skip the member without spending an API call.
 */
export async function fingerprint(m: DesiredMember): Promise<string> {
  const canonical = JSON.stringify({
    e: m.email,
    s: m.status,
    f: m.merge_fields.FNAME ?? '',
    l: m.merge_fields.LNAME ?? '',
    t: m.tags,
  })
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return encodeHex(new Uint8Array(d))
}

/** Tags Co-Exist pushed last time and no longer holds (rule 3). Case-insensitive. */
export function removedTags(previouslySynced: string[] | null | undefined, desired: string[]): string[] {
  const keep = new Set(desired.map((t) => t.toLowerCase()))
  return normaliseTags(previouslySynced).filter((t) => !keep.has(t.toLowerCase()))
}

/**
 * The body for PUT /lists/{id}/members/{hash} (rule 2).
 *
 * - unsubscribed is always asserted: honouring an opt-out is never wrong.
 * - subscribed is asserted only when allowResubscribe, i.e. the queue row came
 *   from a consent change in Co-Exist. Otherwise status_if_new alone, so an
 *   existing unsubscribed/cleaned member is left exactly as Mailchimp has them.
 */
export function upsertBody(
  m: DesiredMember,
  allowResubscribe: boolean,
  /** The member is 'cleaned' (hard-bounced) in Mailchimp: its status is Mailchimp's to keep. */
  statusLocked = false,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email_address: m.email,
    status_if_new: m.status,
  }
  if (Object.keys(m.merge_fields).length) body.merge_fields = m.merge_fields
  if (!statusLocked && (m.status === 'unsubscribed' || allowResubscribe)) body.status = m.status
  return body
}

/* ------------------------------------------------------------------ */
/*  HTTP client                                                        */
/* ------------------------------------------------------------------ */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface MailchimpError {
  status: number
  title: string
  detail: string
}

export class MailchimpApiError extends Error {
  status: number
  title: string
  detail: string
  constructor(e: MailchimpError) {
    super(`${e.status} ${e.title}: ${e.detail}`.slice(0, 400))
    this.status = e.status
    this.title = e.title
    this.detail = e.detail
  }
}

export interface MailchimpMember {
  id?: string
  email_address: string
  status: string
  merge_fields?: Record<string, unknown>
  tags?: { id?: number; name: string }[]
  last_changed?: string
}

export interface ClientOptions {
  apiKey: string
  serverPrefix: string
  fetchImpl?: FetchLike
  /** Injected so tests do not actually wait out a backoff. */
  sleep?: (ms: number) => Promise<void>
  maxAttempts?: number
}

export function createMailchimpClient(opts: ClientOptions) {
  const base = `https://${opts.serverPrefix}.api.mailchimp.com/3.0`
  const doFetch: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init))
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const maxAttempts = opts.maxAttempts ?? 4
  const auth = 'Basic ' + btoa(`coexist:${opts.apiKey}`)

  /**
   * One request with retry on 429 and 5xx (Mailchimp allows 10 concurrent
   * connections per account and answers 429 past that). 4xx other than 429 is
   * a real answer and is thrown immediately as a MailchimpApiError.
   */
  async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T | null> {
    let last: MailchimpError = { status: 0, title: 'no attempt', detail: '' }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let resp: Response
      try {
        resp = await doFetch(base + path, {
          method,
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      } catch (e) {
        last = { status: 0, title: 'network', detail: (e as Error).message }
        await sleep(400 * (attempt + 1))
        continue
      }
      if (resp.status === 204) return null
      const text = await resp.text()
      let parsed: Record<string, unknown> = {}
      try { parsed = text ? JSON.parse(text) : {} } catch { parsed = { detail: text } }
      if (resp.ok) return parsed as T
      last = {
        status: resp.status,
        title: String(parsed.title ?? resp.statusText ?? ''),
        detail: String(parsed.detail ?? '').slice(0, 300),
      }
      if (resp.status === 429 || resp.status >= 500) {
        const ra = Number(resp.headers.get('retry-after') || '0')
        await sleep(Math.min(8000, ra > 0 ? ra * 1000 : 500 * 2 ** attempt))
        continue
      }
      throw new MailchimpApiError(last)
    }
    throw new MailchimpApiError(last)
  }

  async function memberPath(listId: string, email: string) {
    return `/lists/${encodeURIComponent(listId)}/members/${await subscriberHash(email)}`
  }

  return {
    request,
    ping: () => request<{ health_status: string }>('GET', '/ping'),
    getList: (listId: string) =>
      request<{ id: string; name: string; stats: { member_count: number; unsubscribe_count: number; cleaned_count: number } }>(
        'GET',
        `/lists/${encodeURIComponent(listId)}?fields=id,name,stats.member_count,stats.unsubscribe_count,stats.cleaned_count`,
      ),
    listAudiences: () =>
      request<{ lists: { id: string; name: string }[] }>('GET', '/lists?fields=lists.id,lists.name&count=100'),

    /** GET one member, or null when Mailchimp has never seen the address. */
    async getMember(listId: string, email: string): Promise<MailchimpMember | null> {
      try {
        return await request<MailchimpMember>(
          'GET',
          (await memberPath(listId, email)) + '?fields=email_address,status,merge_fields,tags,last_changed',
        )
      } catch (e) {
        if (e instanceof MailchimpApiError && e.status === 404) return null
        throw e
      }
    },

    /**
     * First-time add with tags in one call. Mailchimp answers 400 "Member
     * Exists" when the address is already on the audience (added by hand, or by
     * a previous run whose state row was lost), and we fall back to the PUT
     * upsert, so a re-run is always safe. Returns which path landed.
     */
    async addOrUpsert(
      listId: string,
      m: DesiredMember,
    ): Promise<{ path: 'created' | 'updated'; member: MailchimpMember | null }> {
      try {
        const member = await request<MailchimpMember>('POST', `/lists/${encodeURIComponent(listId)}/members`, {
          email_address: m.email,
          status: m.status,
          ...(Object.keys(m.merge_fields).length ? { merge_fields: m.merge_fields } : {}),
          ...(m.tags.length ? { tags: m.tags } : {}),
        })
        return { path: 'created', member }
      } catch (e) {
        if (!(e instanceof MailchimpApiError) || e.status !== 400 || !/member exists/i.test(e.title)) throw e
        // Existing member we have no state for: never force a re-subscribe (rule 2).
        const member = await request<MailchimpMember>('PUT', await memberPath(listId, m.email), upsertBody(m, false))
        return { path: 'updated', member }
      }
    },

    /** Idempotent add-or-update by subscriber hash. */
    async upsert(listId: string, m: DesiredMember, allowResubscribe: boolean, statusLocked = false): Promise<MailchimpMember | null> {
      return await request<MailchimpMember>('PUT', await memberPath(listId, m.email), upsertBody(m, allowResubscribe, statusLocked))
    },

    /** POST .../tags. Active adds, inactive removes. 204 on success. */
    async setTags(listId: string, email: string, add: string[], remove: string[]): Promise<void> {
      const tags = [
        ...add.map((name) => ({ name, status: 'active' })),
        ...remove.map((name) => ({ name, status: 'inactive' })),
      ]
      if (!tags.length) return
      // is_syncing: tag changes made by a sync must not fire Mailchimp automations.
      await request('POST', (await memberPath(listId, email)) + '/tags', { tags, is_syncing: true })
    },

    /** Archive (DELETE). Reversible in Mailchimp, unlike delete-permanent. 404 is fine. */
    async archive(listId: string, email: string): Promise<'archived' | 'absent'> {
      try {
        await request('DELETE', await memberPath(listId, email))
        return 'archived'
      } catch (e) {
        if (e instanceof MailchimpApiError && (e.status === 404 || e.status === 405)) return 'absent'
        throw e
      }
    },

    listMembers: (listId: string, count = 100, offset = 0) =>
      request<{ members: MailchimpMember[]; total_items: number }>(
        'GET',
        `/lists/${encodeURIComponent(listId)}/members?count=${count}&offset=${offset}` +
          '&fields=members.email_address,members.status,members.merge_fields,members.tags,members.last_changed,total_items',
      ),

    listWebhooks: (listId: string) =>
      request<{ webhooks: { id: string; url: string }[] }>('GET', `/lists/${encodeURIComponent(listId)}/webhooks`),
    deleteWebhook: (listId: string, id: string) =>
      request('DELETE', `/lists/${encodeURIComponent(listId)}/webhooks/${encodeURIComponent(id)}`),
    createWebhook: (listId: string, url: string) =>
      request<{ id: string; url: string; signing_secret?: string }>(
        'POST',
        `/lists/${encodeURIComponent(listId)}/webhooks`,
        {
          url,
          events: { subscribe: false, unsubscribe: true, profile: false, cleaned: true, upemail: false, campaign: false },
          // api:false so our own sync writes never echo back as webhooks (no loop).
          sources: { user: true, admin: true, api: false },
        },
      ),
  }
}

export type MailchimpClient = ReturnType<typeof createMailchimpClient>

/* ------------------------------------------------------------------ */
/*  Webhook                                                            */
/* ------------------------------------------------------------------ */

export interface WebhookEvent {
  type: string
  fired_at: string
  data: Record<string, string>
}

/**
 * Mailchimp posts application/x-www-form-urlencoded with bracket keys:
 * type=unsubscribe&fired_at=...&data[email]=a@b&data[list_id]=...&data[merges][FNAME]=...
 * Nested keys flatten to "merges.FNAME".
 */
export function parseWebhookForm(raw: string): WebhookEvent {
  const params = new URLSearchParams(raw)
  const data: Record<string, string> = {}
  for (const [k, v] of params) {
    const m = k.match(/^data\[([^\]]+)\](?:\[([^\]]+)\])?$/)
    if (m) data[m[2] ? `${m[1]}.${m[2]}` : m[1]] = v
  }
  return { type: params.get('type') ?? '', fired_at: params.get('fired_at') ?? '', data }
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  // Compare the full max length either way so length leaks nothing beyond itself.
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export { timingSafeEqualStr }

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return encodeHex(new Uint8Array(sig))
}

/** Exposed for tests that need to forge a valid delivery. */
export async function signWebhook(secret: string, t: number, rawBody: string): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${rawBody}`)}`
}

export type SignatureVerdict = 'valid' | 'missing' | 'malformed' | 'stale' | 'mismatch'

/**
 * X-Mailchimp-Signature: t={unix seconds},v1={hex}. Verified over the RAW body
 * (decoding it first changes the bytes). Rejected past 5 minutes, so a captured
 * delivery cannot be replayed later.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<SignatureVerdict> {
  if (!header) return 'missing'
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=')
      return i < 0 ? [p.trim(), ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  const t = Number(parts.t)
  const v1 = parts.v1
  if (!Number.isFinite(t) || !v1 || !/^[0-9a-f]+$/i.test(v1)) return 'malformed'
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return 'stale'
  const expected = await hmacHex(secret, `${t}.${rawBody}`)
  return timingSafeEqualStr(expected, v1.toLowerCase()) ? 'valid' : 'mismatch'
}

export type WebhookAction =
  | { kind: 'unsubscribe'; email: string; reason: string }
  | { kind: 'cleaned'; email: string; reason: string }
  | { kind: 'ignore'; why: string }

/**
 * What a delivery means for Co-Exist.
 *
 * unsubscribe -> a CONSENT opt-out: marketing_opt_in=false (unsubscribe_by_email)
 *   and newsletter_subscribers.status='unsubscribed'. Deliberately NOT a row in
 *   email_suppressions: that table is address-death and blocks TRANSACTIONAL mail
 *   too (_shared/egress-suppression.ts), so writing it here would stop a member
 *   who only left a newsletter from getting their event tickets.
 * cleaned -> Mailchimp found the address dead (hard bounce). That IS address
 *   death, so it lands in email_suppressions with reason 'bounce', exactly as a
 *   Resend hard bounce does.
 */
export function webhookAction(ev: WebhookEvent, expectedListId: string): WebhookAction {
  const email = normaliseEmail(ev.data.email)
  if (!ev.type) return { kind: 'ignore', why: 'no type' }
  if (!email) return { kind: 'ignore', why: 'no email' }
  if (ev.data.list_id !== expectedListId) return { kind: 'ignore', why: 'other audience' }
  if (ev.type === 'unsubscribe') return { kind: 'unsubscribe', email, reason: ev.data.reason || ev.data.action || '' }
  if (ev.type === 'cleaned') return { kind: 'cleaned', email, reason: ev.data.reason || '' }
  return { kind: 'ignore', why: `type ${ev.type} not handled` }
}

/** One key per logical delivery, so Mailchimp's retries are processed once. */
export async function webhookDedupeKey(ev: WebhookEvent): Promise<string> {
  const s = [ev.type, ev.fired_at, normaliseEmail(ev.data.email), ev.data.list_id ?? ''].join('|')
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return encodeHex(new Uint8Array(d))
}
