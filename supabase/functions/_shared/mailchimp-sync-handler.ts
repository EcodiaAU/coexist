/**
 * mailchimp-sync-handler.ts - the request handler behind
 * supabase/functions/mailchimp-sync, with its I/O injected.
 *
 * CALLERS
 *   admin  - a signed-in Co-Exist admin from Admin > Email > Mailchimp. Same
 *            role gate as send-campaign (national_leader / manager / admin).
 *   cron   - pg_cron's cron_mailchimp_sync_drain(), proving itself with the
 *            per-install token in mailchimp_sync_secrets (x-mailchimp-cron).
 *            The cron may only run the queue drain.
 *
 * ACTIONS
 *   status           configuration, Mailchimp reachability, audience, queue, runs
 *   sync             {mode:'full'|'queue', cursor?} one bounded pass; the caller
 *                    loops on has_more/next_cursor (the admin "Sync now" button)
 *   configure        {auto_sync?, scope?, allowlist?}
 *   connect_webhook  (re)register the audience webhook and store its secrets
 *   members          read members back from Mailchimp (verification + preview)
 *
 * CONFIG AS SECRETS. MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX and
 * MAILCHIMP_AUDIENCE_ID are edge-function secrets, never in the client bundle
 * and never in kv_store. Pointing at a different account is a secret swap.
 */

import {
  MailchimpApiError,
  normaliseEmail,
  resolveServerPrefix,
  type MailchimpClient,
} from './mailchimp.ts'
import { runSync, type RunTotals, type SyncConfig, type SyncDb } from './mailchimp-sync-core.ts'

export const ADMIN_ROLES = ['national_leader', 'manager', 'admin']

export type Caller =
  | { kind: 'cron' }
  | { kind: 'admin'; userId: string }
  | { kind: 'denied'; status: number; error: string }

export interface SyncEnv {
  apiKey: string
  serverPrefix: string
  audienceId: string
  /** e.g. https://<ref>.supabase.co/functions/v1 */
  functionsBaseUrl: string
}

export interface RunRow {
  id: string
}

export interface HandlerDeps {
  env: SyncEnv
  authenticate(req: Request): Promise<Caller>
  makeClient(apiKey: string, serverPrefix: string): MailchimpClient
  db: SyncDb & {
    loadConfig(): Promise<(SyncConfig & Record<string, unknown>) | null>
    saveConfig(patch: Record<string, unknown>): Promise<void>
    startRun(row: Record<string, unknown>): Promise<RunRow>
    finishRun(id: string, totals: RunTotals): Promise<void>
    queueDepth(): Promise<{ pending: number; failing: number }>
    recentRuns(limit: number): Promise<Record<string, unknown>[]>
    saveWebhookSecrets(token: string, signingSecret: string | null): Promise<void>
  }
  randomToken?: () => string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mailchimp-cron',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** Which MAILCHIMP_* secrets are missing or malformed, in words an admin can act on. */
export function configProblems(env: Partial<SyncEnv>): string[] {
  const out: string[] = []
  if (!env.apiKey) out.push('MAILCHIMP_API_KEY is not set')
  if (!env.audienceId) out.push('MAILCHIMP_AUDIENCE_ID is not set')
  if (env.apiKey) {
    try { resolveServerPrefix(env.apiKey, env.serverPrefix) } catch (e) { out.push((e as Error).message) }
  }
  return out
}

function defaultToken(): string {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function cleanAllowlist(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = [...new Set(v.map((e) => normaliseEmail(String(e))).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))]
  return out.slice(0, 200)
}

export function createSyncHandler(deps: HandlerDeps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

    const caller = await deps.authenticate(req)
    if (caller.kind === 'denied') return json({ ok: false, error: caller.error }, caller.status)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action ?? 'status')
    if (caller.kind === 'cron' && !(action === 'sync' && body.mode === 'queue')) {
      return json({ ok: false, error: 'cron may only run the queue drain' }, 403)
    }

    const env = deps.env
    const problems = configProblems(env)
    // Status must answer even before the migration lands, so an admin (or the
    // person wiring the key) can see the key works and which audiences it holds.
    let config: (SyncConfig & Record<string, unknown>) | null = null
    let dbError: string | null = null
    try { config = await deps.db.loadConfig() } catch (e) { dbError = String((e as Error)?.message ?? e) }
    if (!config && action !== 'status') {
      return json({ ok: false, error: 'The Mailchimp sync tables are not set up yet (migration 20261022060000).', detail: dbError }, 503)
    }

    if (action === 'status') {
      const queue = config ? await deps.db.queueDepth() : { pending: 0, failing: 0 }
      const runs = config ? await deps.db.recentRuns(10) : []
      const base = {
        ok: true,
        configured: problems.length === 0,
        migration_applied: !!config,
        problems: config ? problems : [...problems, 'The sync tables are not set up yet (migration 20261022060000)'],
        config: config
          ? {
              auto_sync: config.auto_sync, scope: config.scope, allowlist: config.allowlist,
              webhook_connected: !!config.webhook_id && config.webhook_audience_id === env.audienceId,
              webhook_connected_at: config.webhook_connected_at ?? null,
            }
          : { auto_sync: false, scope: 'allowlist', allowlist: [], webhook_connected: false, webhook_connected_at: null },
        queue,
        runs,
      }
      const keyOk = !!env.apiKey && !configProblems({ ...env, audienceId: 'x' }).length
      if (problems.length && keyOk) {
        // Key works but no audience chosen yet: say which audiences it can see.
        const c = deps.makeClient(env.apiKey, resolveServerPrefix(env.apiKey, env.serverPrefix))
        const audiences = await c.listAudiences().then((r) => r?.lists ?? []).catch((e) => [{ id: '', name: `error: ${(e as Error).message}` }])
        return json({ ...base, mailchimp: { reachable: true, server: resolveServerPrefix(env.apiKey, env.serverPrefix), audience: null, audiences } })
      }
      if (problems.length) return json(base)
      const client = deps.makeClient(env.apiKey, resolveServerPrefix(env.apiKey, env.serverPrefix))
      try {
        const [ping, list] = await Promise.all([client.ping(), client.getList(env.audienceId)])
        return json({
          ...base,
          mailchimp: {
            reachable: ping?.health_status === "Everything's Chimpy!" || !!ping,
            server: resolveServerPrefix(env.apiKey, env.serverPrefix),
            audience: list ? { id: list.id, name: list.name, ...list.stats } : null,
          },
        })
      } catch (e) {
        let audiences: { id: string; name: string }[] | undefined
        // The commonest misconfiguration is a wrong audience id: list the real ones.
        if (e instanceof MailchimpApiError && e.status === 404) {
          audiences = (await client.listAudiences().catch(() => null))?.lists
        }
        return json({ ...base, mailchimp: { reachable: false, error: (e as Error).message, audiences } })
      }
    }

    if (!config) return json({ ok: false, error: 'unreachable' }, 500)

    if (action === 'configure') {
      const patch: Record<string, unknown> = {}
      if (typeof body.auto_sync === 'boolean') patch.auto_sync = body.auto_sync
      if (body.scope === 'allowlist' || body.scope === 'all') patch.scope = body.scope
      if (body.allowlist !== undefined) {
        const list = cleanAllowlist(body.allowlist)
        if (!list) return json({ ok: false, error: 'allowlist must be an array of email addresses' }, 400)
        patch.allowlist = list
      }
      if (!Object.keys(patch).length) return json({ ok: false, error: 'nothing to change' }, 400)
      patch.updated_at = new Date().toISOString()
      if (caller.kind === 'admin') patch.updated_by = caller.userId
      await deps.db.saveConfig(patch)
      return json({ ok: true, config: { ...config, ...patch } })
    }

    if (problems.length) return json({ ok: false, error: 'Mailchimp is not configured', problems }, 409)
    const client = deps.makeClient(env.apiKey, resolveServerPrefix(env.apiKey, env.serverPrefix))

    if (action === 'members') {
      const emails = Array.isArray(body.emails) ? body.emails.map((e) => normaliseEmail(String(e))).filter(Boolean).slice(0, 50) : null
      if (emails && emails.length) {
        const members = await Promise.all(emails.map(async (e) => ({ email: e, member: await client.getMember(env.audienceId, e) })))
        return json({ ok: true, audience_id: env.audienceId, members })
      }
      const page = await client.listMembers(env.audienceId, Math.min(Number(body.count) || 50, 100), Number(body.offset) || 0)
      return json({ ok: true, audience_id: env.audienceId, total_items: page?.total_items ?? 0, members: page?.members ?? [] })
    }

    if (action === 'connect_webhook') {
      const token = (deps.randomToken ?? defaultToken)()
      const url = `${env.functionsBaseUrl}/mailchimp-webhook?token=${token}`
      // Replace any webhook of ours (any URL on this function), keep anyone else's.
      const existing = (await client.listWebhooks(env.audienceId))?.webhooks ?? []
      for (const w of existing) {
        if (w.url.includes('/functions/v1/mailchimp-webhook')) await client.deleteWebhook(env.audienceId, w.id)
      }
      // Store the token BEFORE creating, so the validation GET and the first
      // delivery can already authenticate.
      await deps.db.saveWebhookSecrets(token, null)
      const created = await client.createWebhook(env.audienceId, url)
      await deps.db.saveWebhookSecrets(token, created?.signing_secret ?? null)
      await deps.db.saveConfig({
        webhook_id: created?.id ?? null,
        webhook_audience_id: env.audienceId,
        webhook_connected_at: new Date().toISOString(),
      })
      return json({ ok: true, webhook_id: created?.id ?? null, signed: !!created?.signing_secret, replaced: existing.length })
    }

    if (action === 'sync') {
      const mode = body.mode === 'queue' ? 'queue' : 'full'
      const run = await deps.db.startRun({
        trigger: caller.kind === 'cron' ? 'cron' : 'manual',
        triggered_by: caller.kind === 'admin' ? caller.userId : null,
        mode,
        audience_id: env.audienceId,
        scope: config.scope,
      })
      let totals: RunTotals
      let threw = false
      try {
        totals = await runSync({
          client,
          db: deps.db,
          audienceId: env.audienceId,
          config: { auto_sync: !!config.auto_sync, scope: config.scope, allowlist: config.allowlist ?? [] },
          mode,
          cursor: typeof body.cursor === 'string' ? body.cursor : null,
          budgetMs: Math.min(Number(body.budget_ms) || 90_000, 120_000),
        })
      } catch (e) {
        threw = true
        totals = {
          processed: 0, created: 0, updated: 0, unchanged: 0, archived: 0, skipped: 0, failed: 1,
          errors: [{ email: '', error: String((e as Error)?.message ?? e).slice(0, 300) }], has_more: false, next_cursor: null,
        }
      }
      await deps.db.finishRun(run.id, totals)
      // ok = the run itself completed. Per-member failures are counted in
      // `failed` and listed in `errors`; they never read as a green run.
      return json({ ok: !threw, run_id: run.id, mode, scope: config.scope, ...totals }, threw ? 502 : 200)
    }

    return json({ ok: false, error: `unknown action ${action}` }, 400)
  }
}
