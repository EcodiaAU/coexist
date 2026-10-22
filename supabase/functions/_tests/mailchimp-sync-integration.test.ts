// Run: deno test supabase/functions/_tests/mailchimp-sync-integration.test.ts
//
// The sync engine and both request handlers wired together against an
// in-memory Co-Exist DB and the fake Mailchimp: a full sync, a re-run (must make
// ZERO writes), the queue drain, archive on deletion, tag ownership, auth, and
// the webhook path end to end (token, signature, dedupe, the Co-Exist write).
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { createMailchimpClient, normaliseEmail, signWebhook, type CoexistContact } from '../_shared/mailchimp.ts'
import { runSync, type QueueRow, type StateWrite, type SyncConfig, type SyncDb, type SyncState } from '../_shared/mailchimp-sync-core.ts'
import { createSyncHandler, type Caller } from '../_shared/mailchimp-sync-handler.ts'
import { createWebhookHandler } from '../_shared/mailchimp-webhook-handler.ts'
import { createFakeMailchimp } from './fake-mailchimp.ts'

const LIST = 'aud0000001'
// Built at runtime: a literal in Mailchimp's key shape trips GitHub push protection.
const KEY = ['0123456789abcdef'.repeat(2), 'us9'].join('-')

function contact(email: string, extra: Partial<CoexistContact> = {}): CoexistContact {
  return { email, profile_id: crypto.randomUUID(), first_name: null, last_name: null, source: 'profile', status: 'subscribed', tags: [], ...extra }
}

function makeDb(initial: CoexistContact[], config: SyncConfig) {
  const contacts = new Map(initial.map((c) => [normaliseEmail(c.email), c]))
  const state = new Map<string, StateWrite>()
  const queue = new Map<string, QueueRow & { claimed: boolean; last_error?: string }>()
  const runs: Record<string, unknown>[] = []
  const optedOut: string[] = []
  let cfg: SyncConfig & Record<string, unknown> = { ...config }
  let secrets = { cron_token: 'cron-tok', webhook_token: null as string | null, webhook_signing_secret: null as string | null }
  const db = {
    contacts: async ({ emails, after, limit }: { emails?: string[]; after?: string | null; limit: number }) =>
      [...contacts.values()]
        .filter((c) => !emails || emails.includes(normaliseEmail(c.email)))
        .filter((c) => !after || normaliseEmail(c.email) > after)
        .sort((a, b) => normaliseEmail(a.email).localeCompare(normaliseEmail(b.email)))
        .slice(0, limit),
    states: async (aud: string, emails: string[]) => {
      const m = new Map<string, SyncState>()
      for (const e of emails) { const s = state.get(`${aud}|${e}`); if (s) m.set(e, s) }
      return m
    },
    saveStates: async (rows: StateWrite[]) => { for (const r of rows) state.set(`${r.audience_id}|${r.email}`, r) },
    orphaned: async (aud: string) =>
      [...state.values()].filter((s) => s.audience_id === aud && s.mc_status !== 'archived' && !contacts.has(s.email)).map((s) => s.email),
    claimQueue: async (limit: number) => {
      const rows = [...queue.values()].filter((q) => !q.claimed).slice(0, limit)
      for (const r of rows) { r.claimed = true; r.attempts++ }
      return rows.map(({ email, consent, version, attempts }) => ({ email, consent, version, attempts }))
    },
    finishQueue: async (email: string, version: number) => { if (queue.get(email)?.version === version) queue.delete(email) },
    releaseQueue: async (email: string, version: number, error: string) => {
      const q = queue.get(email); if (q && q.version === version) { q.claimed = false; q.last_error = error }
    },
    loadConfig: async () => cfg,
    saveConfig: async (p: Record<string, unknown>) => { cfg = { ...cfg, ...p } as SyncConfig & Record<string, unknown> },
    startRun: async (row: Record<string, unknown>) => { const id = crypto.randomUUID(); runs.push({ id, ...row }); return { id } },
    finishRun: async (id: string, t: unknown) => { Object.assign(runs.find((r) => r.id === id)!, { totals: t }) },
    queueDepth: async () => ({ pending: queue.size, failing: [...queue.values()].filter((q) => q.last_error).length }),
    recentRuns: async () => runs.slice(-10).reverse(),
    saveWebhookSecrets: async (token: string, sig: string | null) => { secrets = { ...secrets, webhook_token: token, webhook_signing_secret: sig } },
    optOut: async (email: string) => {
      optedOut.push(email)
      const c = contacts.get(normaliseEmail(email)); if (c) c.status = 'unsubscribed'
    },
  }
  return {
    db: db as unknown as SyncDb & typeof db,
    contacts, state, queue, runs, optedOut,
    get cfg() { return cfg },
    get secrets() { return secrets },
    enqueue(email: string, consent = false) {
      const e = normaliseEmail(email)
      const prev = queue.get(e)
      queue.set(e, { email: e, consent: (prev?.consent ?? false) || consent, version: (prev?.version ?? 0) + 1, attempts: prev?.attempts ?? 0, claimed: false })
    },
  }
}

function setup(initial: CoexistContact[], config: Partial<SyncConfig> = {}) {
  const fake = createFakeMailchimp({ listId: LIST, apiKey: KEY })
  const client = createMailchimpClient({ apiKey: KEY, serverPrefix: 'us9', fetchImpl: fake.fetchImpl, sleep: async () => {} })
  const store = makeDb(initial, { auto_sync: true, scope: 'all', allowlist: [], ...config })
  return { fake, client, store }
}

const PEOPLE = () => [
  contact('code@ecodia.au', { tags: ['Tree Planting', 'Sunshine Coast'] }),
  contact('Tate@ecodia.au', { first_name: 'Tate', last_name: 'Donohoe', status: 'unsubscribed', tags: ['Leader'] }),
  contact('eos-test-participant@ecodia.au', { first_name: 'EOS', last_name: 'Test' }),
  contact('fan@example.org', { source: 'newsletter', first_name: 'Fan', profile_id: null }),
]

Deno.test('full sync pushes email, names, status and tags; a re-run makes ZERO writes (idempotent)', async () => {
  const { fake, client, store } = setup(PEOPLE())
  const t1 = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  assertEquals([t1.created, t1.skipped, t1.failed], [3, 1, 0])
  const eos = await fake.member('eos-test-participant@ecodia.au')
  assertEquals(eos?.merge_fields, { FNAME: 'EOS', LNAME: 'Test' })
  assertEquals((await fake.member('code@ecodia.au'))?.tags.sort(), ['Sunshine Coast', 'Tree Planting'])
  assertEquals((await fake.member('code@ecodia.au'))?.status, 'subscribed')
  fake.reset()
  const t2 = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  assertEquals(t2.unchanged, 4)
  assertEquals(fake.writes(), 0, 'an unchanged audience must cost no API writes')
  assertEquals(fake.calls.length, 0, 'not even a read: the not-pushed opt-out is fingerprinted too')
})

Deno.test('consent: a member who never opted in is NOT created in Mailchimp; one Mailchimp already holds is opted out there', async () => {
  const { fake, client, store } = setup([
    contact('never@x.org', { first_name: 'Never', status: 'unsubscribed', tags: ['Leader'] }),
    contact('imported@x.org', { first_name: 'Imp', status: 'unsubscribed', tags: ['Leader'] }),
  ])
  // An earlier CSV import put imported@ in the audience as subscribed.
  await fake.seed({ email_address: 'imported@x.org', status: 'subscribed', merge_fields: {}, tags: ['Old Import'] })
  const t = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  assertEquals([t.skipped, t.updated, t.created, t.failed], [1, 1, 0, 0])
  assert(!(await fake.member('never@x.org')), 'a non-consenting person must never be created')
  assertEquals(fake.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/members')).length, 0)
  const imp = await fake.member('imported@x.org')
  assertEquals(imp?.status, 'unsubscribed')
  assertEquals(imp?.merge_fields.FNAME, 'Imp')
  assertEquals(imp?.tags.sort(), ['Leader', 'Old Import'], 'the import tag is Mailchimp-native and survives')
  assertEquals(store.state.get(`${LIST}|imported@x.org`)?.synced_tags, ['Leader'], 'the pushed tag is owned, the import tag is not')
  assertEquals(store.state.get(`${LIST}|never@x.org`)?.last_action, 'not_pushed')
  // imported@ opts in inside Co-Exist with no prior push of ours: the consent
  // row must reach the Member Exists path too, and go to pending.
  store.contacts.get('imported@x.org')!.status = 'subscribed'
  store.enqueue('imported@x.org', true)
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals((await fake.member('imported@x.org'))?.status, 'pending')
  // They opt in later: the consent row creates them, subscribed.
  store.contacts.get('never@x.org')!.status = 'subscribed'
  store.enqueue('never@x.org', true)
  const q = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals(q.created, 1)
  assertEquals((await fake.member('never@x.org'))?.status, 'subscribed')
})

Deno.test('lost state is safe: a re-run against an already-populated audience takes the Member Exists path, no duplicates', async () => {
  const { fake, client, store } = setup(PEOPLE())
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  store.state.clear()
  const t = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  assertEquals([t.updated, t.skipped, t.failed], [3, 1, 0])
  assertEquals(fake.members.size, 3)
})

Deno.test('allowlist scope syncs only listed addresses (the test-phase privacy gate)', async () => {
  const { fake, client, store } = setup(PEOPLE(), { scope: 'allowlist', allowlist: ['CODE@ecodia.au'] })
  const t = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  assertEquals(t.created, 1)
  assertEquals(fake.members.size, 1)
  assert(await fake.member('code@ecodia.au'))
})

Deno.test('tag ownership: a removed Co-Exist tag is removed; a tag added in Mailchimp by hand survives', async () => {
  const { fake, client, store } = setup([contact('code@ecodia.au', { tags: ['Tree Planting', 'Brisbane'] })])
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  ;(await fake.member('code@ecodia.au'))!.tags.push('Kurt VIP')
  store.contacts.get('code@ecodia.au')!.tags = ['Tree Planting']
  store.enqueue('code@ecodia.au')
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals((await fake.member('code@ecodia.au'))?.tags.sort(), ['Kurt VIP', 'Tree Planting'])
})

Deno.test('queue: an opt-out is pushed; an opt-back-in re-subscribes ONLY when the queue row is consent', async () => {
  const { fake, client, store } = setup([contact('m@x.org')])
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  store.contacts.get('m@x.org')!.status = 'unsubscribed'
  store.enqueue('m@x.org')
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals((await fake.member('m@x.org'))?.status, 'unsubscribed')
  // Name change while Co-Exist says opted-in but the queue row is NOT consent: stays unsubscribed.
  store.contacts.get('m@x.org')!.status = 'subscribed'
  store.contacts.get('m@x.org')!.first_name = 'Renamed'
  store.enqueue('m@x.org', false)
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals((await fake.member('m@x.org'))?.status, 'unsubscribed')
  assertEquals((await fake.member('m@x.org'))?.merge_fields.FNAME, 'Renamed')
  assertEquals(store.optedOut, ['m@x.org'], 'Mailchimp says unsubscribed and this was no opt-in: Co-Exist follows')
  store.contacts.get('m@x.org')!.status = 'subscribed'
  // The member ticks marketing back on in Co-Exist: consent row. Mailchimp
  // refuses an API re-subscribe after an unsubscribe, so it goes to pending
  // (Mailchimp emails them to confirm) instead of failing.
  store.enqueue('m@x.org', true)
  const back = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals([back.updated, back.failed], [1, 0])
  assertEquals((await fake.member('m@x.org'))?.status, 'pending')
  const puts = fake.calls.filter((c) => c.method === 'PUT').slice(-2).map((c) => (c.body as { status?: string }).status)
  assertEquals(puts, ['subscribed', 'pending'], 'tries subscribed first, then the route Mailchimp allows')
  assertEquals(store.queue.size, 0)
})

Deno.test('two-way: an unsubscribe Mailchimp already holds (no webhook ever came) opts the member out in Co-Exist on a full sync', async () => {
  const { fake, client, store } = setup([contact('left-before@x.org', { first_name: 'L' }), contact('stays@x.org')])
  await fake.seed({ email_address: 'left-before@x.org', status: 'unsubscribed', merge_fields: {}, tags: [] })
  await fake.seed({ email_address: 'stays@x.org', status: 'subscribed', merge_fields: {}, tags: [] })
  const t = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  assertEquals(t.failed, 0)
  assertEquals(store.optedOut, ['left-before@x.org'], 'only the one Mailchimp holds unsubscribed')
  assertEquals((await fake.member('left-before@x.org'))?.status, 'unsubscribed', 'never re-subscribed')
  assertEquals(store.state.get(`${LIST}|left-before@x.org`)?.last_action, 'opted_out_from_mailchimp')
  // The next pass sees Co-Exist and Mailchimp agree: no second opt-out.
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  assertEquals(store.optedOut.length, 1)
})

Deno.test('deletion: a member who stops being a contact is archived, by queue and by the full-sync sweep', async () => {
  const { fake, client, store } = setup([contact('gone@x.org'), contact('alsogone@x.org')])
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  store.contacts.delete('gone@x.org')
  store.enqueue('gone@x.org')
  const q = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals(q.archived, 1)
  assert(!(await fake.member('gone@x.org')))
  store.contacts.delete('alsogone@x.org')
  const f = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full' })
  assertEquals(f.archived, 1)
  assertEquals(fake.members.size, 0)
  assertEquals(fake.archived.size, 2)
})

Deno.test('queue: a 5xx releases the row for retry; a 4xx (bad address) is recorded and dropped', async () => {
  const { fake, client, store } = setup([contact('ok@x.org'), contact('bad@@x')])
  store.enqueue('ok@x.org'); store.enqueue('bad@@x')
  fake.throttle(0)
  // ok@ gets a 503 on every attempt of its first call (4 attempts), bad@@x is invalid.
  let n = 0
  const flaky = async (i: string, init?: RequestInit) => {
    if (i.includes('/members') && (init?.body ?? '').toString().includes('ok@x.org') && n < 4) { n++; return new Response('{"title":"Service Unavailable"}', { status: 503 }) }
    return fake.fetchImpl(i, init)
  }
  const c2 = createMailchimpClient({ apiKey: KEY, serverPrefix: 'us9', fetchImpl: flaky, sleep: async () => {} })
  const t = await runSync({ client: c2, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals(t.failed, 2)
  assert(store.queue.has('ok@x.org') && !store.queue.get('ok@x.org')!.claimed, 'retryable failure stays queued and unclaimed')
  assert(!store.queue.has('bad@@x'), 'permanent failure leaves the queue')
  assertEquals(store.state.get(`${LIST}|bad@@x`)?.last_error?.startsWith('400 Invalid Resource'), true)
  const t2 = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue' })
  assertEquals(t2.created, 1)
  assertEquals(store.queue.size, 0)
})

Deno.test('queue: a change that lands while a row is in flight is not lost (version-pinned finish)', async () => {
  const { client, store } = setup([contact('race@x.org')])
  store.enqueue('race@x.org')
  const realFinish = store.db.finishQueue
  store.db.finishQueue = async (email: string, version: number) => {
    store.enqueue('race@x.org') // a trigger fired mid-flight: version bumps
    await realFinish(email, version)
  }
  await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'queue', pageSize: 1, budgetMs: 1 })
  assert(store.queue.has('race@x.org'), 'the newer change must still be queued')
})

Deno.test('a full sync that runs out of time before its first page reports has_more, never "finished"', async () => {
  const { client, store } = setup([contact('a@x.org')])
  let clock = 0
  const t = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full', budgetMs: 1, nowMs: () => clock++ })
  assertEquals([t.has_more, t.processed], [true, 0])
})

Deno.test('full sync pages with a cursor and reports has_more when its time budget runs out', async () => {
  const many = Array.from({ length: 7 }, (_, i) => contact(`p${i}@x.org`))
  const { client, store } = setup(many)
  let clock = 0
  const t = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full', pageSize: 3, budgetMs: 2, nowMs: () => clock++ })
  assertEquals(t.has_more, true)
  assertEquals(t.next_cursor, 'p2@x.org')
  const t2 = await runSync({ client, db: store.db, audienceId: LIST, config: store.cfg as SyncConfig, mode: 'full', cursor: t.next_cursor, pageSize: 3 })
  assertEquals(t2.has_more, false)
  assertEquals(t.created + t2.created, 7)
})

// ---------- request handlers ----------

function handlerFor(store: ReturnType<typeof makeDb>, fake: ReturnType<typeof createFakeMailchimp>, caller: Caller, env = {}) {
  return createSyncHandler({
    env: { apiKey: KEY, serverPrefix: 'us9', audienceId: LIST, functionsBaseUrl: 'https://ref.supabase.co/functions/v1', ...env },
    authenticate: async () => caller,
    makeClient: (apiKey, serverPrefix) => createMailchimpClient({ apiKey, serverPrefix, fetchImpl: fake.fetchImpl, sleep: async () => {} }),
    db: store.db,
    randomToken: () => 'tok-fixed',
  })
}
const post = (body: unknown) => new Request('https://x/mailchimp-sync', { method: 'POST', body: JSON.stringify(body) })

Deno.test('sync handler: non-admin is refused; cron may only drain the queue', async () => {
  const { fake, store } = setup(PEOPLE())
  const denied = await handlerFor(store, fake, { kind: 'denied', status: 403, error: 'Admin access required' })(post({ action: 'status' }))
  assertEquals(denied.status, 403)
  const cronFull = await handlerFor(store, fake, { kind: 'cron' })(post({ action: 'sync', mode: 'full' }))
  assertEquals(cronFull.status, 403)
  const cronQueue = await handlerFor(store, fake, { kind: 'cron' })(post({ action: 'sync', mode: 'queue' }))
  assertEquals(cronQueue.status, 200)
})

Deno.test('sync handler: status reports missing secrets in plain words and never calls Mailchimp', async () => {
  const { fake, store } = setup(PEOPLE())
  const res = await handlerFor(store, fake, { kind: 'admin', userId: 'u' }, { apiKey: '', audienceId: '' })(post({ action: 'status' }))
  const j = await res.json()
  assertEquals(j.configured, false)
  assertEquals(j.problems, ['MAILCHIMP_API_KEY is not set', 'MAILCHIMP_AUDIENCE_ID is not set'])
  assertEquals(fake.calls.length, 0)
})

Deno.test('sync handler: before the migration, status still answers and lists the key\'s audiences; other actions are 503', async () => {
  const { fake, store } = setup(PEOPLE())
  store.db.loadConfig = async () => { throw new Error('relation "public.mailchimp_sync_config" does not exist') }
  const h = handlerFor(store, fake, { kind: 'admin', userId: 'u' }, { audienceId: '' })
  const res = await h(post({ action: 'status' }))
  assertEquals(res.status, 200)
  const j = await res.json()
  assertEquals(j.migration_applied, false)
  assert(j.problems.includes('MAILCHIMP_AUDIENCE_ID is not set'))
  assert(j.problems.some((p: string) => p.includes('not set up yet')))
  assertEquals(j.mailchimp.audiences.map((a: { id: string }) => a.id), [LIST])
  assertEquals(fake.writes(), 0)
  const sync = await h(post({ action: 'sync', mode: 'full' }))
  assertEquals(sync.status, 503)
  const cfg = await h(post({ action: 'configure', scope: 'all' }))
  assertEquals(cfg.status, 503)
})

Deno.test('sync handler: admin full sync records a run; members reads them back from Mailchimp', async () => {
  const { fake, store } = setup(PEOPLE())
  const h = handlerFor(store, fake, { kind: 'admin', userId: 'admin-1' })
  const j = await (await h(post({ action: 'sync', mode: 'full' }))).json()
  assertEquals([j.ok, j.created, j.skipped, j.failed, j.has_more], [true, 3, 1, 0, false])
  assertEquals((store.runs[0] as { trigger: string }).trigger, 'manual')
  const m = await (await h(post({ action: 'members', emails: ['eos-test-participant@ecodia.au', 'tate@ecodia.au'] }))).json()
  assertEquals(m.members[0].member.status, 'subscribed')
  assertEquals(m.members[0].member.merge_fields, { FNAME: 'EOS', LNAME: 'Test' })
  assertEquals(m.members[1].member, null, 'opted-out and never pushed')
  const st = await (await h(post({ action: 'status' }))).json()
  assertEquals(st.mailchimp.audience.name, 'Fake')
  assertEquals(st.mailchimp.audience.signup_url, `https://fake.us9.list-manage.com/subscribe?u=u123&id=${LIST}`)
  assertEquals(st.mailchimp.account, { name: 'Fake Org', plan: 'forever_free', total_contacts: 3 })
})

Deno.test('sync handler: configure validates scope and normalises the allowlist', async () => {
  const { fake, store } = setup(PEOPLE(), { scope: 'allowlist', allowlist: [] })
  const h = handlerFor(store, fake, { kind: 'admin', userId: 'admin-1' })
  const bad = await h(post({ action: 'configure', allowlist: 'nope' }))
  assertEquals(bad.status, 400)
  const ok = await (await h(post({ action: 'configure', scope: 'all', allowlist: [' A@B.org ', 'not-an-email', 'a@b.org'] }))).json()
  assertEquals(ok.config.scope, 'all')
  assertEquals(ok.config.allowlist, ['a@b.org'])
})

Deno.test('connect_webhook stores the token BEFORE creating the webhook, then the signing secret; replaces only ours', async () => {
  const { fake, store } = setup(PEOPLE())
  fake.webhooks.push({ id: 'theirs', url: 'https://zapier.example/hook', signing_secret: 's' })
  fake.webhooks.push({ id: 'old', url: 'https://ref.supabase.co/functions/v1/mailchimp-webhook?token=old', signing_secret: 's' })
  const h = handlerFor(store, fake, { kind: 'admin', userId: 'admin-1' })
  const j = await (await h(post({ action: 'connect_webhook' }))).json()
  assertEquals([j.ok, j.signed, j.replaced], [true, true, 2])
  assertEquals(fake.webhooks.map((w) => w.id).sort(), [j.webhook_id, 'theirs'].sort())
  assertEquals(store.secrets.webhook_token, 'tok-fixed')
  assert(store.secrets.webhook_signing_secret?.startsWith('whsec_'))
  assertEquals((store.cfg as Record<string, unknown>).webhook_audience_id, LIST)
})

// ---------- webhook handler ----------

function webhookSetup(signingSecret: string | null) {
  const events = new Map<string, { outcome: string }>()
  const unsubscribed: string[] = []
  const suppressed: string[] = []
  const marked: string[] = []
  const handle = createWebhookHandler({
    audienceId: LIST,
    loadSecrets: async () => ({ webhook_token: 'tok', webhook_signing_secret: signingSecret }),
    recordEvent: async (row) => {
      const prev = events.get(row.dedupe_key)
      if (prev && !prev.outcome.startsWith('error:')) return false
      events.set(row.dedupe_key, { outcome: row.outcome })
      return true
    },
    setEventOutcome: async (k, o) => { events.get(k)!.outcome = o },
    unsubscribe: async (e) => { unsubscribed.push(e); return { profiles: 1, newsletter: 0 } },
    suppressBounce: async (e) => { suppressed.push(e); return 'inserted' },
    markState: async (e, s) => { marked.push(`${e}:${s}`) },
    nowSeconds: () => 1_792_000_100,
  })
  return { handle, events, unsubscribed, suppressed, marked }
}

const FORM = (type: string, email: string, list = LIST) =>
  `type=${type}&fired_at=2026-10-22+04%3A30%3A00&data%5Blist_id%5D=${list}&data%5Bemail%5D=${encodeURIComponent(email)}&data%5Breason%5D=manual`

async function deliver(handle: (r: Request) => Promise<Response>, body: string, opts: { token?: string; secret?: string; t?: number } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (opts.secret) headers['X-Mailchimp-Signature'] = await signWebhook(opts.secret, opts.t ?? 1_792_000_000, body)
  return handle(new Request(`https://x/mailchimp-webhook?token=${opts.token ?? 'tok'}`, { method: 'POST', body, headers }))
}

Deno.test('webhook: the validation GET answers 200', async () => {
  const { handle } = webhookSetup(null)
  assertEquals((await handle(new Request('https://x/mailchimp-webhook?token=whatever'))).status, 200)
})

Deno.test('webhook: a signed unsubscribe opts the member out in Co-Exist (consent, NOT email_suppressions)', async () => {
  const w = webhookSetup('whsec_1')
  const res = await deliver(w.handle, FORM('unsubscribe', 'Code@Ecodia.au'), { secret: 'whsec_1' })
  assertEquals(res.status, 200)
  assertEquals(w.unsubscribed, ['code@ecodia.au'])
  assertEquals(w.suppressed, [], 'an unsubscribe must not block transactional mail')
  assertEquals(w.marked, ['code@ecodia.au:unsubscribed'])
})

Deno.test('webhook: cleaned lands in email_suppressions as a bounce', async () => {
  const w = webhookSetup('whsec_1')
  await deliver(w.handle, FORM('cleaned', 'dead@x.org'), { secret: 'whsec_1' })
  assertEquals(w.suppressed, ['dead@x.org'])
  assertEquals(w.unsubscribed, [])
})

Deno.test('webhook: wrong token, missing/forged/stale signature are 401 and write NOTHING', async () => {
  const w = webhookSetup('whsec_1')
  const body = FORM('unsubscribe', 'victim@x.org')
  assertEquals((await deliver(w.handle, body, { token: 'guess', secret: 'whsec_1' })).status, 401)
  assertEquals((await deliver(w.handle, body)).status, 401)
  assertEquals((await deliver(w.handle, body, { secret: 'forged' })).status, 401)
  assertEquals((await deliver(w.handle, body, { secret: 'whsec_1', t: 1_791_000_000 })).status, 401)
  assertEquals(w.unsubscribed, [])
  assertEquals(w.events.size, 0)
})

Deno.test('webhook: a retried delivery is processed once; another audience is recorded but ignored', async () => {
  const w = webhookSetup('whsec_1')
  const body = FORM('unsubscribe', 'twice@x.org')
  await deliver(w.handle, body, { secret: 'whsec_1' })
  const again = await deliver(w.handle, body, { secret: 'whsec_1' })
  assertEquals(await again.text(), 'duplicate')
  assertEquals(w.unsubscribed, ['twice@x.org'])
  await deliver(w.handle, FORM('unsubscribe', 'other@x.org', 'someoneelse'), { secret: 'whsec_1' })
  assertEquals(w.unsubscribed, ['twice@x.org'])
})

Deno.test('webhook: a delivery that errored mid-write is re-processed on Mailchimp\'s retry', async () => {
  const w = webhookSetup('whsec_1')
  let fail = true
  const handle = createWebhookHandler({
    audienceId: LIST,
    loadSecrets: async () => ({ webhook_token: 'tok', webhook_signing_secret: 'whsec_1' }),
    recordEvent: async (row) => {
      const prev = w.events.get(row.dedupe_key)
      if (prev && !prev.outcome.startsWith('error:')) return false
      w.events.set(row.dedupe_key, { outcome: row.outcome }); return true
    },
    setEventOutcome: async (k, o) => { w.events.get(k)!.outcome = o },
    unsubscribe: async (e) => { if (fail) { fail = false; throw new Error('db down') } w.unsubscribed.push(e); return { profiles: 1, newsletter: 0 } },
    suppressBounce: async () => 'inserted',
    markState: async () => {},
    nowSeconds: () => 1_792_000_100,
  })
  const body = FORM('unsubscribe', 'retry@x.org')
  assertEquals((await deliver(handle, body, { secret: 'whsec_1' })).status, 500)
  assertEquals((await deliver(handle, body, { secret: 'whsec_1' })).status, 200)
  assertEquals(w.unsubscribed, ['retry@x.org'])
})
