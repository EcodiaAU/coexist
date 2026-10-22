/**
 * mailchimp-sync-core.ts - one member at a time, and a run over many.
 *
 * The database and Mailchimp are both INJECTED (SyncDb, MailchimpClient), so the
 * whole decision path, including the idempotent add-or-update, the tag diff and
 * the queue bookkeeping, runs in _tests/mailchimp-sync-core.test.ts against an
 * in-memory Mailchimp that behaves like the real one (400 "Member Exists" on a
 * duplicate POST, 404 on an unknown member, 429 bursts).
 *
 * See _shared/mailchimp.ts for the four rules (identity, never re-subscribe on
 * a sync, own only our tags, trust only a signed webhook).
 */

import {
  MailchimpApiError,
  type CoexistContact,
  type MailchimpClient,
  fingerprint,
  normaliseEmail,
  removedTags,
  toDesiredMember,
} from './mailchimp.ts'

export interface SyncState {
  email: string
  fingerprint: string | null
  synced_tags: string[]
  mc_status: string | null
}

export interface StateWrite {
  audience_id: string
  email: string
  profile_id: string | null
  source: string | null
  fingerprint: string | null
  synced_tags: string[]
  mc_status: string | null
  last_action: string
  last_synced_at: string
  last_error: string | null
}

export interface QueueRow {
  email: string
  consent: boolean
  version: number
  attempts: number
}

export interface SyncConfig {
  auto_sync: boolean
  scope: 'allowlist' | 'all'
  allowlist: string[]
}

/** Everything the engine needs from Postgres. Implemented over supabase-js in the function. */
export interface SyncDb {
  contacts(opts: { emails?: string[]; after?: string | null; limit: number }): Promise<CoexistContact[]>
  states(audienceId: string, emails: string[]): Promise<Map<string, SyncState>>
  saveStates(rows: StateWrite[]): Promise<void>
  orphaned(audienceId: string, limit: number): Promise<string[]>
  claimQueue(limit: number): Promise<QueueRow[]>
  /** Delete only if the row is still at `version` (a newer change stays queued). */
  finishQueue(email: string, version: number): Promise<void>
  /** Release for a later retry, recording why. */
  releaseQueue(email: string, version: number, error: string): Promise<void>
}

export type Outcome = 'created' | 'updated' | 'unchanged' | 'archived' | 'skipped' | 'failed'

export interface MemberResult {
  email: string
  outcome: Outcome
  error?: string
  /** A failure Mailchimp would answer the same way next time (bad address, compliance hold). */
  permanent?: boolean
  state?: StateWrite
}

export function allowedByScope(email: string, cfg: SyncConfig): boolean {
  if (cfg.scope === 'all') return true
  return cfg.allowlist.map(normaliseEmail).includes(normaliseEmail(email))
}

function isRetryable(e: unknown): boolean {
  if (!(e instanceof MailchimpApiError)) return true
  return e.status === 0 || e.status === 429 || e.status >= 500
}

function errText(e: unknown): string {
  if (e instanceof MailchimpApiError) return `${e.status} ${e.title}${e.detail ? ': ' + e.detail : ''}`.slice(0, 300)
  return String((e as Error)?.message ?? e).slice(0, 300)
}

/**
 * Bring ONE address in Mailchimp into line with Co-Exist.
 *
 * contact null  -> it is no longer a Co-Exist contact (deleted, pending deletion,
 *                  erased). Archive it if we ever pushed it, otherwise leave it.
 * no prior state -> first push: POST with tags, falling back to PUT on
 *                  400 "Member Exists" (added by hand, or state lost).
 * prior state   -> PUT upsert by subscriber hash, then a tag diff that adds
 *                  ours and removes only tags we pushed before.
 */
export async function syncOne(args: {
  client: MailchimpClient
  audienceId: string
  email: string
  contact: CoexistContact | null
  state: SyncState | null
  /** full sync: an unchanged fingerprint costs zero API calls. */
  skipUnchanged: boolean
  /** queue row came from a consent change (member opted back in). */
  allowResubscribe: boolean
  now?: () => string
}): Promise<MemberResult> {
  const { client, audienceId, contact, state } = args
  const email = normaliseEmail(args.email)
  const now = args.now ?? (() => new Date().toISOString())

  try {
    if (!contact) {
      if (!state || state.mc_status === 'archived') return { email, outcome: 'skipped' }
      await client.archive(audienceId, email)
      return {
        email,
        outcome: 'archived',
        state: {
          audience_id: audienceId, email, profile_id: null, source: null, fingerprint: null,
          synced_tags: [], mc_status: 'archived', last_action: 'archived', last_synced_at: now(), last_error: null,
        },
      }
    }

    const desired = toDesiredMember(contact)
    const fp = await fingerprint(desired)
    if (args.skipUnchanged && state && state.fingerprint === fp && state.mc_status !== 'archived') {
      return { email, outcome: 'unchanged' }
    }

    let outcome: Outcome
    let mcStatus: string | null
    let previouslySynced: string[]

    // Never successfully pushed (no state, archived, or only a recorded failure):
    // first-push path. POST carries the tags in the same call.
    if (!state || state.mc_status === 'archived' || state.mc_status == null) {
      if (desired.status === 'unsubscribed') {
        // Someone who never opted in is not created in Mailchimp at all: a
        // marketing tool holding a non-consenting person is a privacy problem
        // and, on contact-count plans, a billed one. If Mailchimp already holds
        // them (an earlier import), the opt-out is asserted on that record.
        const existing = await client.getMember(audienceId, email)
        if (!existing) {
          return {
            email,
            outcome: 'skipped',
            state: {
              audience_id: audienceId, email, profile_id: contact.profile_id, source: contact.source,
              fingerprint: fp, synced_tags: [], mc_status: null,
              last_action: 'not_pushed', last_synced_at: now(), last_error: null,
            },
          }
        }
        const member = await client.upsert(audienceId, desired, false, existing.status === 'cleaned')
        if (desired.tags.length) await client.setTags(audienceId, email, desired.tags, [])
        return {
          email,
          outcome: 'updated',
          state: {
            audience_id: audienceId, email, profile_id: contact.profile_id, source: contact.source,
            // The tags were just pushed, so Co-Exist owns them from here on.
            fingerprint: fp, synced_tags: desired.tags, mc_status: member?.status ?? existing.status,
            last_action: 'updated', last_synced_at: now(), last_error: null,
          },
        }
      }
      const res = await client.addOrUpsert(audienceId, desired, args.allowResubscribe)
      outcome = res.path === 'created' ? 'created' : 'updated'
      mcStatus = res.member?.status ?? desired.status
      // On the Member Exists path we never pushed tags for this address, so we
      // own none of what Mailchimp holds and remove nothing.
      previouslySynced = res.path === 'created' ? desired.tags : []
      if (res.path === 'updated' && desired.tags.length) {
        await client.setTags(audienceId, email, desired.tags, [])
      }
    } else {
      // A cleaned (hard-bounced) member's status is Mailchimp's to keep.
      const member = await client.upsert(audienceId, desired, args.allowResubscribe, state.mc_status === 'cleaned')
      outcome = 'updated'
      mcStatus = member?.status ?? state.mc_status
      previouslySynced = state.synced_tags ?? []
      const toRemove = removedTags(previouslySynced, desired.tags)
      const prevKeys = new Set(previouslySynced.map((t) => t.toLowerCase()))
      const toAdd = desired.tags.filter((t) => !prevKeys.has(t.toLowerCase()))
      if (toAdd.length || toRemove.length) await client.setTags(audienceId, email, toAdd, toRemove)
    }

    return {
      email,
      outcome,
      state: {
        audience_id: audienceId, email, profile_id: contact.profile_id, source: contact.source,
        fingerprint: fp, synced_tags: desired.tags, mc_status: mcStatus,
        last_action: outcome, last_synced_at: now(), last_error: null,
      },
    }
  } catch (e) {
    const permanent = !isRetryable(e)
    return {
      email,
      outcome: 'failed',
      error: errText(e),
      permanent,
      // Record the failure against the address but keep the old fingerprint, so
      // the next full run tries again instead of calling it unchanged.
      state: {
        audience_id: audienceId, email, profile_id: contact?.profile_id ?? null, source: contact?.source ?? null,
        fingerprint: state?.fingerprint ?? null, synced_tags: state?.synced_tags ?? [],
        mc_status: state?.mc_status ?? null, last_action: 'failed', last_synced_at: now(), last_error: errText(e),
      },
    }
  }
}

/** Small promise pool. Mailchimp allows 10 concurrent connections per account; we use 5. */
async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

export interface RunTotals {
  processed: number
  created: number
  updated: number
  unchanged: number
  archived: number
  skipped: number
  failed: number
  errors: { email: string; error: string }[]
  has_more: boolean
  next_cursor: string | null
}

function emptyTotals(): RunTotals {
  return { processed: 0, created: 0, updated: 0, unchanged: 0, archived: 0, skipped: 0, failed: 0, errors: [], has_more: false, next_cursor: null }
}

function tally(t: RunTotals, results: MemberResult[]) {
  for (const r of results) {
    t.processed++
    t[r.outcome]++
    if (r.outcome === 'failed' && t.errors.length < 25) t.errors.push({ email: r.email, error: r.error ?? '' })
  }
}

export interface RunOptions {
  client: MailchimpClient
  db: SyncDb
  audienceId: string
  config: SyncConfig
  mode: 'full' | 'queue'
  /** full mode: resume after this address. */
  cursor?: string | null
  pageSize?: number
  /** Stop picking up new work after this many ms (edge functions have a wall clock). */
  budgetMs?: number
  concurrency?: number
  nowMs?: () => number
}

/**
 * FULL: page through every in-scope contact (fingerprint-skip unchanged), and on
 *       the last page archive state rows whose address stopped being a contact.
 *       Returns next_cursor/has_more so the caller can continue in another call.
 * QUEUE: claim queued addresses, sync each with allowResubscribe from the row,
 *        and settle the queue row version-pinned.
 */
export async function runSync(o: RunOptions): Promise<RunTotals> {
  const t = emptyTotals()
  const pageSize = o.pageSize ?? 100
  const conc = o.concurrency ?? 5
  const nowMs = o.nowMs ?? (() => Date.now())
  const deadline = nowMs() + (o.budgetMs ?? 90_000)
  const scoped = o.config.scope === 'allowlist'
  const allowlist = o.config.allowlist.map(normaliseEmail).filter(Boolean)

  if (o.mode === 'queue') {
    let drained = false
    while (nowMs() < deadline) {
      const rows = await o.db.claimQueue(pageSize)
      if (!rows.length) { drained = true; break }
      const inScope = rows.filter((r) => allowedByScope(r.email, o.config))
      for (const r of rows) if (!inScope.includes(r)) {
        await o.db.finishQueue(r.email, r.version)
        t.processed++; t.skipped++
      }
      const emails = inScope.map((r) => r.email)
      const contacts = emails.length ? await o.db.contacts({ emails, limit: emails.length }) : []
      const byEmail = new Map(contacts.map((c) => [normaliseEmail(c.email), c]))
      const states = await o.db.states(o.audienceId, emails)
      const results = await pool(inScope, conc, (r) =>
        syncOne({
          client: o.client, audienceId: o.audienceId, email: r.email,
          contact: byEmail.get(r.email) ?? null, state: states.get(r.email) ?? null,
          skipUnchanged: false, allowResubscribe: r.consent,
        }))
      await o.db.saveStates(results.flatMap((r) => (r.state ? [r.state] : [])))
      for (let i = 0; i < inScope.length; i++) {
        const r = inScope[i]
        const res = results[i]
        if (res.outcome === 'failed' && !res.permanent && r.attempts < 8) {
          await o.db.releaseQueue(r.email, r.version, res.error ?? 'failed')
        } else {
          await o.db.finishQueue(r.email, r.version)
        }
      }
      tally(t, results)
      if (rows.length < pageSize) { drained = true; break }
    }
    t.has_more = !drained
    return t
  }

  // FULL. `done` is set only by reaching a short page: running out of time
  // before even one page must read as "more to do", never as finished.
  let cursor = o.cursor ?? null
  let done = false
  while (nowMs() < deadline) {
    const contacts = await o.db.contacts({
      emails: scoped ? allowlist : undefined,
      after: cursor,
      limit: pageSize,
    })
    // In allowlist mode an address on the list with no contact (deleted) still
    // needs archiving if we pushed it before.
    const emails = contacts.map((c) => normaliseEmail(c.email))
    const states = await o.db.states(o.audienceId, emails)
    const results = await pool(contacts, conc, (c) =>
      syncOne({
        client: o.client, audienceId: o.audienceId, email: c.email, contact: c,
        state: states.get(normaliseEmail(c.email)) ?? null, skipUnchanged: true, allowResubscribe: false,
      }))
    await o.db.saveStates(results.flatMap((r) => (r.state ? [r.state] : [])))
    tally(t, results)
    if (contacts.length < pageSize) { done = true; break }
    cursor = normaliseEmail(contacts[contacts.length - 1].email)
  }

  if (!done) {
    t.has_more = true
    t.next_cursor = cursor
    return t
  }

  // Last page reached: archive what stopped being a contact (scope-filtered).
  const orphans = (await o.db.orphaned(o.audienceId, 200)).filter((e) => allowedByScope(e, o.config))
  if (orphans.length) {
    const states = await o.db.states(o.audienceId, orphans)
    const results = await pool(orphans, conc, (e) =>
      syncOne({
        client: o.client, audienceId: o.audienceId, email: e, contact: null,
        state: states.get(e) ?? null, skipUnchanged: false, allowResubscribe: false,
      }))
    await o.db.saveStates(results.flatMap((r) => (r.state ? [r.state] : [])))
    tally(t, results)
  }
  return t
}
