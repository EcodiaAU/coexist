/**
 * fake-mailchimp.ts - an in-memory Mailchimp Marketing API 3.0, as a fetch.
 *
 * Behaves the way the real one does on the paths the sync uses, including the
 * answers that matter for idempotency: POST of an existing address is
 * 400 "Member Exists", GET of an unknown hash is 404, PUT with only
 * status_if_new leaves an existing member's status alone, and a burst can be
 * made to 429. Every call is logged so tests can assert HOW MANY writes a sync
 * made, which is the difference between idempotent and merely correct.
 */
import { crypto as stdCrypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.208.0/encoding/hex.ts'

export interface FakeMember {
  email_address: string
  status: string
  merge_fields: Record<string, string>
  tags: string[]
}

export interface Call {
  method: string
  path: string
  body: unknown
}

async function md5(s: string) {
  return encodeHex(new Uint8Array(await stdCrypto.subtle.digest('MD5', new TextEncoder().encode(s.toLowerCase()))))
}

export function createFakeMailchimp(opts: { listId: string; apiKey?: string } ) {
  const members = new Map<string, FakeMember>()
  const archived = new Set<string>()
  const webhooks: { id: string; url: string; signing_secret: string }[] = []
  const calls: Call[] = []
  let throttleNext = 0
  let failNext: { status: number; title: string } | null = null
  let nextId = 1

  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  async function fetchImpl(input: string, init?: RequestInit): Promise<Response> {
    const url = new URL(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(/^\/3\.0/, '')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body })

    if (opts.apiKey) {
      const auth = (init?.headers as Record<string, string>)?.Authorization ?? ''
      if (auth !== 'Basic ' + btoa(`coexist:${opts.apiKey}`)) return reply(401, { title: 'API Key Invalid', detail: 'bad key' })
    }
    if (throttleNext > 0) { throttleNext--; return reply(429, { title: 'Too Many Requests', detail: 'slow down' }) }
    if (failNext) { const f = failNext; failNext = null; return reply(f.status, { title: f.title, detail: 'injected' }) }

    if (path === '/ping') return reply(200, { health_status: "Everything's Chimpy!" })
    if (path === '/' || path === '') return reply(200, { account_name: 'Fake Org', pricing_plan_type: 'forever_free', total_subscribers: members.size })
    const L = `/lists/${opts.listId}`
    if (method === 'GET' && path === '/lists') return reply(200, { lists: [{ id: opts.listId, name: 'Fake', stats: { member_count: members.size } }], total_items: 1 })
    if (method === 'GET' && path === L) {
      return reply(200, { id: opts.listId, name: 'Fake', subscribe_url_long: `https://fake.us9.list-manage.com/subscribe?u=u123&id=${opts.listId}`, stats: { member_count: [...members.values()].filter((m) => m.status === 'subscribed').length, unsubscribe_count: 0, cleaned_count: 0 } })
    }
    if (!path.startsWith(L)) return reply(404, { title: 'Resource Not Found', detail: 'no such list' })
    const rest = path.slice(L.length)

    if (rest === '/members' && method === 'POST') {
      const h = await md5(body.email_address)
      if (members.has(h)) return reply(400, { title: 'Member Exists', detail: `${body.email_address} is already a list member.` })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email_address)) return reply(400, { title: 'Invalid Resource', detail: 'looks fake or invalid' })
      archived.delete(h)
      const m: FakeMember = { email_address: body.email_address, status: body.status, merge_fields: body.merge_fields ?? {}, tags: body.tags ?? [] }
      members.set(h, m)
      return reply(200, { ...m, tags: m.tags.map((name) => ({ name })) })
    }
    if (rest === '/members' && method === 'GET') {
      const all = [...members.values()]
      return reply(200, { total_items: all.length, members: all.map((m) => ({ ...m, tags: m.tags.map((name) => ({ name })) })) })
    }
    const mm = rest.match(/^\/members\/([0-9a-f]{32})(\/tags)?$/)
    if (mm) {
      const h = mm[1]
      if (mm[2] && method === 'POST') {
        const m = members.get(h)
        if (!m) return reply(404, { title: 'Resource Not Found', detail: 'no member' })
        for (const t of body.tags as { name: string; status: string }[]) {
          if (t.status === 'active' && !m.tags.includes(t.name)) m.tags.push(t.name)
          if (t.status === 'inactive') m.tags = m.tags.filter((x) => x !== t.name)
        }
        return reply(204)
      }
      if (method === 'GET') {
        const m = members.get(h)
        return m ? reply(200, { ...m, tags: m.tags.map((name) => ({ name })) }) : reply(404, { title: 'Resource Not Found', detail: 'no member' })
      }
      if (method === 'PUT') {
        let m = members.get(h)
        if (!m) {
          if (!body.status_if_new) return reply(400, { title: 'Invalid Resource', detail: 'status_if_new required' })
          archived.delete(h)
          m = { email_address: body.email_address, status: body.status ?? body.status_if_new, merge_fields: {}, tags: [] }
          members.set(h, m)
        } else if (body.status) {
          if (m.status === 'cleaned') return reply(400, { title: 'Invalid Resource', detail: 'cleaned member status cannot change' })
          m.status = body.status
        }
        if (body.merge_fields) m.merge_fields = { ...m.merge_fields, ...body.merge_fields }
        return reply(200, { ...m, tags: m.tags.map((name) => ({ name })) })
      }
      if (method === 'DELETE') {
        if (!members.has(h)) return reply(404, { title: 'Resource Not Found', detail: 'no member' })
        members.delete(h)
        archived.add(h)
        return reply(204)
      }
    }
    if (rest === '/webhooks' && method === 'GET') return reply(200, { webhooks: webhooks.map(({ id, url }) => ({ id, url })) })
    if (rest === '/webhooks' && method === 'POST') {
      const w = { id: `wh${nextId++}`, url: body.url, signing_secret: `whsec_${nextId}` }
      webhooks.push(w)
      return reply(200, w)
    }
    const wm = rest.match(/^\/webhooks\/(.+)$/)
    if (wm && method === 'DELETE') {
      const i = webhooks.findIndex((w) => w.id === wm[1])
      if (i >= 0) webhooks.splice(i, 1)
      return reply(204)
    }
    return reply(404, { title: 'Resource Not Found', detail: `${method} ${path}` })
  }

  return {
    fetchImpl,
    calls,
    members,
    archived,
    webhooks,
    md5,
    async member(email: string) { return members.get(await md5(email)) },
    async seed(m: FakeMember) { members.set(await md5(m.email_address), { ...m }) },
    throttle(n: number) { throttleNext = n },
    failOnce(status: number, title: string) { failNext = { status, title } },
    writes() { return calls.filter((c) => c.method !== 'GET').length },
    reset() { calls.length = 0 },
  }
}
