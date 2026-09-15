/**
 * event-invite-unified-channels.test.ts
 *
 * Tate 2026-09-15: the host action on the event page unified on ONE semantic.
 * The tile is always "Invite", a yellow paper plane, and the sheet always
 * offers three channel toggles - collective chat, email, push.
 *
 * The regression this pins is the half nobody could see from the UI: the first
 * press used to IGNORE `channels` completely. It always posted to chat, always
 * emailed, always pushed, and the toggles were rendered only once the
 * collective had already been invited. So a host who turned the chat post off
 * and pressed Invite got the chat post anyway, and there was no test that
 * would have noticed, because the toggles were not even on screen for that
 * press.
 *
 * Driven through a recording fake of the supabase client, so each assertion is
 * "this write did / did not happen", not "the flag was passed".
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const HOST = '00000000-0000-0000-0000-0000000000aa'
const MEMBER_A = '00000000-0000-0000-0000-0000000000b1'
const MEMBER_B = '00000000-0000-0000-0000-0000000000b2'
const CANCELLED = '00000000-0000-0000-0000-0000000000b3'
const EVENT = '11111111-1111-1111-1111-111111111111'
const COLLECTIVE = '22222222-2222-2222-2222-222222222222'

/** Every table/function touch, in order. */
interface Call { target: string; op: string; payload?: any }
let calls: Call[] = []
/** Flipped per test: 0 = never invited (first press), 1 = invited before. */
let existingInviteCount = 0
/** Flipped per test: announcements already posted in the last 24h. */
let recentAnnouncements: { created_at: string }[] = []

function resultFor(target: string, op: string, payload: any) {
  switch (`${target}.${op}`) {
    case 'event_invites.select':
      return { count: existingInviteCount, data: null, error: null }
    case 'events.select':
      return {
        data: {
          title: 'Beach Clean',
          date_start: '2026-09-20T09:00:00',
          date_end: null,
          address: 'Burleigh Heads',
          cover_image_url: 'https://cdn.example/cover.jpg',
          activity_type: 'clean_up',
        },
        error: null,
      }
    case 'profiles.select':
      return { data: { display_name: 'Pia' }, error: null }
    case 'collective_members.select':
      return {
        data: [{ user_id: HOST }, { user_id: MEMBER_A }, { user_id: MEMBER_B }, { user_id: CANCELLED }],
        error: null,
      }
    case 'event_registrations.select':
      return { data: [{ user_id: CANCELLED, status: 'cancelled' }], error: null }
    case 'event_invites.insert':
      return { data: null, error: null }
    case 'event_registrations.upsert':
      return { data: (payload as any[]).map((r) => ({ user_id: r.user_id })), error: null }
    case 'chat_messages.select':
      return { data: recentAnnouncements, error: null }
    case 'chat_announcements.insert':
      return { data: { id: 'ann-1', title: payload.title }, error: null }
    case 'chat_messages.insert':
      return { data: null, error: null }
    case 'public_profiles.select':
      return { data: [{ id: MEMBER_A, display_name: 'Ada' }, { id: MEMBER_B, display_name: 'Ben' }], error: null }
    case 'notifications.insert':
      return { data: null, error: null }
    case 'fn:send-email.invoke':
      return { data: { sent: payload?.recipients?.length ?? 0, resolved: payload?.recipients?.length ?? 0 }, error: null }
    case 'fn:send-push.invoke':
      return { data: { sent: payload?.userIds?.length ?? 0 }, error: null }
    default:
      return { data: null, error: null, count: 0 }
  }
}

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const state: { op: string; payload?: any } = { op: 'select' }
    const builder: any = {
      select: () => builder,
      insert: (payload: any) => { state.op = 'insert'; state.payload = payload; return builder },
      upsert: (payload: any) => { state.op = 'upsert'; state.payload = payload; return builder },
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      limit: () => builder,
      single: () => builder,
      maybeSingle: () => builder,
      then: (onOk: any, onErr: any) => {
        calls.push({ target: table, op: state.op, payload: state.payload })
        return Promise.resolve(resultFor(table, state.op, state.payload)).then(onOk, onErr)
      },
    }
    return builder
  }
  return {
    supabase: {
      from,
      functions: {
        invoke: (name: string, opts: any) => {
          calls.push({ target: `fn:${name}`, op: 'invoke', payload: opts?.body })
          return Promise.resolve(resultFor(`fn:${name}`, 'invoke', opts?.body))
        },
      },
    },
  }
})

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: HOST } }) }))

const { useInviteCollective } = await import('@/hooks/use-events')

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

async function invite(channels?: { email?: boolean; chat?: boolean; push?: boolean }) {
  const { result } = renderHook(() => useInviteCollective(), { wrapper })
  return result.current.mutateAsync({
    eventId: EVENT,
    collectiveId: COLLECTIVE,
    customMessage: 'Bring gloves',
    channels,
  })
}

const did = (target: string, op: string) => calls.some((c) => c.target === target && c.op === op)
const payloadOf = (target: string, op: string) => calls.find((c) => c.target === target && c.op === op)?.payload

beforeEach(() => {
  calls = []
  existingInviteCount = 0
  recentAnnouncements = []
})

describe('first invite honours the channel toggles', () => {
  it('chat OFF means no announcement, while the invite itself still lands', async () => {
    const out = await invite({ chat: false, email: true, push: true })

    expect(did('chat_announcements', 'insert')).toBe(false)
    expect(did('chat_messages', 'insert')).toBe(false)
    // The DATA side effect is not a channel: the collective is still invited.
    expect(did('event_invites', 'insert')).toBe(true)
    expect(did('event_registrations', 'upsert')).toBe(true)
    expect(did('fn:send-email', 'invoke')).toBe(true)
    expect(did('fn:send-push', 'invoke')).toBe(true)
    expect(out.firstInvite).toBe(true)
    expect(out.chatPosted).toBe(false)
  })

  it('chat ONLY means no email, no push and no in-app notification', async () => {
    const out = await invite({ chat: true, email: false, push: false })

    expect(did('chat_announcements', 'insert')).toBe(true)
    expect(did('fn:send-email', 'invoke')).toBe(false)
    expect(did('fn:send-push', 'invoke')).toBe(false)
    expect(did('notifications', 'insert')).toBe(false)
    expect(out.chatPosted).toBe(true)
    expect(out.emailed).toBe(0)
    expect(out.pushed).toBe(0)
  })

  it('push OFF still emails, and still writes the in-app notification', async () => {
    const out = await invite({ chat: true, email: true, push: false })

    expect(did('fn:send-email', 'invoke')).toBe(true)
    expect(did('fn:send-push', 'invoke')).toBe(false)
    expect(did('notifications', 'insert')).toBe(true)
    expect(out.pushed).toBe(0)
    expect(out.emailed).toBe(2)
  })

  it('no channels named at all sends on all three', async () => {
    const out = await invite()

    expect(did('chat_announcements', 'insert')).toBe(true)
    expect(did('fn:send-email', 'invoke')).toBe(true)
    expect(did('fn:send-push', 'invoke')).toBe(true)
    expect(out.emailed).toBe(2)
    expect(out.pushed).toBe(2)
    expect(out.chatPosted).toBe(true)
  })
})

describe('one audience rule on every press', () => {
  it('a first invite leaves out the host and anyone who cancelled', async () => {
    const out = await invite()

    const recipients = payloadOf('fn:send-push', 'invoke').userIds
    expect(recipients).toEqual([MEMBER_A, MEMBER_B])
    expect(recipients).not.toContain(HOST)
    expect(recipients).not.toContain(CANCELLED)
    // Registrations are created for exactly that audience.
    expect(payloadOf('event_registrations', 'upsert').map((r: any) => r.user_id)).toEqual([MEMBER_A, MEMBER_B])
    expect(out.invited).toBe(2)
  })

  it('the host message reaches every channel it was typed for', async () => {
    await invite()

    expect(payloadOf('chat_announcements', 'insert').body).toBe('Bring gloves')
    expect(payloadOf('fn:send-push', 'invoke').body).toBe('Bring gloves')
    const emailRecipients = payloadOf('fn:send-email', 'invoke').recipients
    expect(emailRecipients[0].data.custom_message).toBe('Bring gloves')
    // The invite email used to drop the date, the place and the cover image.
    expect(emailRecipients[0].data.event_location).toBe('Burleigh Heads')
    expect(emailRecipients[0].data.event_image).toBe('https://cdn.example/cover.jpg')
  })
})

describe('a repeat press is the same button, not a different one', () => {
  it('does not re-create the invite record or re-invite members', async () => {
    existingInviteCount = 1
    const out = await invite()

    expect(did('event_invites', 'insert')).toBe(false)
    expect(did('event_registrations', 'upsert')).toBe(false)
    expect(out.firstInvite).toBe(false)
    expect(out.invited).toBe(0)
    // Every channel still runs.
    expect(out.emailed).toBe(2)
    expect(out.pushed).toBe(2)
    expect(out.chatPosted).toBe(true)
  })

  it('honours push OFF the same way the first press does', async () => {
    existingInviteCount = 1
    const out = await invite({ chat: true, email: true, push: false })

    expect(did('fn:send-push', 'invoke')).toBe(false)
    expect(out.pushed).toBe(0)
  })

  it('reports the 24h chat cooldown as a skip without dropping the email', async () => {
    existingInviteCount = 1
    recentAnnouncements = [{ created_at: 'x' }, { created_at: 'y' }, { created_at: 'z' }]
    const out = await invite()

    expect(did('chat_announcements', 'insert')).toBe(false)
    expect(out.chatPosted).toBe(false)
    expect(out.chatSkippedReason).toContain('3 announcements')
    expect(out.emailed).toBe(2)
  })

  it('does not apply the cooldown to a first invite, which happens once', async () => {
    recentAnnouncements = [{ created_at: 'x' }, { created_at: 'y' }, { created_at: 'z' }]
    const out = await invite()

    expect(did('chat_announcements', 'insert')).toBe(true)
    expect(out.chatPosted).toBe(true)
    expect(out.chatSkippedReason).toBe(null)
  })
})
