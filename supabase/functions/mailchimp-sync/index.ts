/* eslint-disable @typescript-eslint/no-explicit-any */
// Deno Edge Function: Co-Exist -> Mailchimp member sync.
// All logic lives in _shared/mailchimp-sync-handler.ts and _shared/mailchimp-sync-core.ts
// (tested in _tests/); this file only wires supabase-js and the env.
//
// verify_jwt = false in config.toml, same as send-campaign: this project issues
// ES256 user JWTs the gateway does not verify correctly, so the function checks
// the caller itself (GoTrue + profiles.role), and pg_cron authenticates with the
// per-install cron token instead of a JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { createMailchimpClient, timingSafeEqualStr } from '../_shared/mailchimp.ts'
import { ADMIN_ROLES, createSyncHandler, type Caller } from '../_shared/mailchimp-sync-handler.ts'
import type { StateWrite, SyncState } from '../_shared/mailchimp-sync-core.ts'
import { optOutEverywhere } from '../_shared/mailchimp-optout.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

async function authenticate(req: Request): Promise<Caller> {
  const cronHeader = req.headers.get('x-mailchimp-cron')
  if (cronHeader) {
    const { data } = await admin.from('mailchimp_sync_secrets').select('cron_token').eq('id', true).maybeSingle()
    const tok = (data as any)?.cron_token as string | undefined
    if (tok && timingSafeEqualStr(cronHeader, tok)) return { kind: 'cron' }
    return { kind: 'denied', status: 401, error: 'bad cron token' }
  }
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return { kind: 'denied', status: 401, error: 'Missing authorization' }
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: serviceKey },
  })
  if (!res.ok) return { kind: 'denied', status: 401, error: 'Invalid token' }
  const user = (await res.json()) as { id?: string }
  if (!user?.id) return { kind: 'denied', status: 401, error: 'Invalid token' }
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!prof || !ADMIN_ROLES.includes((prof as any).role)) {
    return { kind: 'denied', status: 403, error: 'Admin access required' }
  }
  return { kind: 'admin', userId: user.id }
}

function must<T>(r: { data: T; error: any }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}

const handler = createSyncHandler({
  env: {
    apiKey: Deno.env.get('MAILCHIMP_API_KEY') ?? '',
    serverPrefix: Deno.env.get('MAILCHIMP_SERVER_PREFIX') ?? '',
    audienceId: Deno.env.get('MAILCHIMP_AUDIENCE_ID') ?? '',
    functionsBaseUrl: `${supabaseUrl}/functions/v1`,
  },
  authenticate,
  makeClient: (apiKey, serverPrefix) => createMailchimpClient({ apiKey, serverPrefix }),
  db: {
    async contacts({ emails, after, limit }) {
      return must(
        await admin.rpc('mailchimp_contacts', { p_emails: emails ?? null, p_after: after ?? null, p_limit: limit }),
        'mailchimp_contacts',
      ) as any[]
    },
    async states(audienceId, emails) {
      const out = new Map<string, SyncState>()
      if (!emails.length) return out
      for (let i = 0; i < emails.length; i += 200) {
        const rows = must(
          await admin.from('mailchimp_sync_state')
            .select('email, fingerprint, synced_tags, mc_status')
            .eq('audience_id', audienceId)
            .in('email', emails.slice(i, i + 200)),
          'states',
        ) as SyncState[]
        for (const r of rows) out.set(r.email, r)
      }
      return out
    },
    async saveStates(rows: StateWrite[]) {
      if (!rows.length) return
      must(await admin.from('mailchimp_sync_state').upsert(rows, { onConflict: 'audience_id,email' }), 'saveStates')
    },
    async orphaned(audienceId, limit) {
      const rows = must(await admin.rpc('mailchimp_orphaned_state', { p_audience_id: audienceId, p_limit: limit }), 'orphaned') as any[]
      return rows.map((r) => r.email)
    },
    async claimQueue(limit) {
      return must(await admin.rpc('mailchimp_claim_queue', { p_limit: limit }), 'claimQueue') as any[]
    },
    async finishQueue(email, version) {
      must(await admin.from('mailchimp_sync_queue').delete().eq('email', email).eq('version', version), 'finishQueue')
    },
    async releaseQueue(email, version, error) {
      must(
        await admin.from('mailchimp_sync_queue').update({ claimed_at: null, last_error: error.slice(0, 300) })
          .eq('email', email).eq('version', version),
        'releaseQueue',
      )
    },
    async optOut(email) {
      await optOutEverywhere(admin, email)
    },
    async loadConfig() {
      return must(await admin.from('mailchimp_sync_config').select('*').eq('id', true).maybeSingle(), 'loadConfig') as any
    },
    async saveConfig(patch) {
      must(await admin.from('mailchimp_sync_config').update(patch).eq('id', true), 'saveConfig')
    },
    async startRun(row) {
      return must(await admin.from('mailchimp_sync_runs').insert(row).select('id').single(), 'startRun') as any
    },
    async finishRun(id, t) {
      must(
        await admin.from('mailchimp_sync_runs').update({
          finished_at: new Date().toISOString(),
          processed: t.processed, created: t.created, updated: t.updated, unchanged: t.unchanged,
          archived: t.archived, skipped: t.skipped, failed: t.failed, has_more: t.has_more, errors: t.errors,
        }).eq('id', id),
        'finishRun',
      )
    },
    async queueDepth() {
      const pending = await admin.from('mailchimp_sync_queue').select('email', { count: 'exact', head: true })
      const failing = await admin.from('mailchimp_sync_queue').select('email', { count: 'exact', head: true }).not('last_error', 'is', null)
      return { pending: pending.count ?? 0, failing: failing.count ?? 0 }
    },
    async recentRuns(limit) {
      return must(
        await admin.from('mailchimp_sync_runs').select('*').order('started_at', { ascending: false }).limit(limit),
        'recentRuns',
      ) as any[]
    },
    async saveWebhookSecrets(token, signingSecret) {
      must(
        await admin.from('mailchimp_sync_secrets')
          .update({ webhook_token: token, webhook_signing_secret: signingSecret, updated_at: new Date().toISOString() })
          .eq('id', true),
        'saveWebhookSecrets',
      )
    },
  },
})

Deno.serve(withSentry('mailchimp-sync', handler))
