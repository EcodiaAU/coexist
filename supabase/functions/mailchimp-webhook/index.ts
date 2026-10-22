/* eslint-disable @typescript-eslint/no-explicit-any */
// Deno Edge Function: Mailchimp -> Co-Exist (unsubscribe and cleaned only).
// Logic in _shared/mailchimp-webhook-handler.ts (tested in _tests/). This file
// only wires supabase-js. verify_jwt = false: Mailchimp cannot present a JWT,
// so the handler authenticates by URL token + HMAC signature + audience id.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { createWebhookHandler } from '../_shared/mailchimp-webhook-handler.ts'
import { optOutEverywhere } from '../_shared/mailchimp-optout.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
const audienceId = Deno.env.get('MAILCHIMP_AUDIENCE_ID') ?? ''

function must<T>(r: { data: T; error: any }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}

const handler = createWebhookHandler({
  audienceId,
  async loadSecrets() {
    return must(
      await admin.from('mailchimp_sync_secrets').select('webhook_token, webhook_signing_secret').eq('id', true).maybeSingle(),
      'loadSecrets',
    ) as any
  },
  async recordEvent(row) {
    const ins = await admin.from('mailchimp_webhook_events').insert(row).select('id')
    if (!ins.error) return true
    if (ins.error.code !== '23505') throw new Error(`recordEvent: ${ins.error.message}`)
    // Seen before. Re-claim it only if the earlier attempt errored mid-write.
    const prev = must(
      await admin.from('mailchimp_webhook_events').select('outcome').eq('dedupe_key', row.dedupe_key).maybeSingle(),
      'recordEvent lookup',
    ) as any
    if (!String(prev?.outcome ?? '').startsWith('error:')) return false
    const upd = must(
      await admin.from('mailchimp_webhook_events').update({ outcome: 'received (retry)' })
        .eq('dedupe_key', row.dedupe_key).like('outcome', 'error:%').select('id'),
      'recordEvent reclaim',
    ) as any[]
    return upd.length > 0
  },
  async setEventOutcome(key, outcome) {
    must(await admin.from('mailchimp_webhook_events').update({ outcome }).eq('dedupe_key', key), 'setEventOutcome')
  },
  async unsubscribe(email) {
    return await optOutEverywhere(admin, email)
  },
  async suppressBounce(email) {
    const r = await admin.from('email_suppressions').insert({ email, reason: 'bounce' })
    if (!r.error) return 'inserted'
    if (r.error.code === '23505') return 'existing'
    throw new Error(`suppressBounce: ${r.error.message}`)
  },
  async markState(email, mcStatus) {
    if (!audienceId) return
    must(
      await admin.from('mailchimp_sync_state').update({ mc_status: mcStatus }).eq('audience_id', audienceId).eq('email', email),
      'markState',
    )
  },
})

Deno.serve(withSentry('mailchimp-webhook', handler))
