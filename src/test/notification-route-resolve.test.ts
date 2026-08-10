/**
 * Tests for resolveNotificationRoute - the single source of truth mapping a
 * notification type + data payload to an in-app route (used by both the
 * in-app notification feed and push-tap routing).
 *
 * Regression (backlog F3-2, 2026-08-10): a campout/staff channel push carries
 * channel_id (and, for a campout, also its parent collective_id), but the
 * resolver keyed only off collective_id, so tapping the push opened the WRONG
 * chat - the collective's main thread, or (for a staff channel with no
 * collective_id) the bare chat list - instead of the channel room.
 */
import { describe, it, expect } from 'vitest'
import { resolveNotificationRoute } from '@/hooks/use-notifications'

describe('resolveNotificationRoute - chat channel routing (F3-2)', () => {
  it('routes a campout/staff channel push to the channel room, not the collective main chat', () => {
    // Campout: has BOTH a channel_id and a parent collective_id. channel wins.
    expect(
      resolveNotificationRoute('chat_messages', { channel_id: 'chan-1', collective_id: 'col-1' }),
    ).toBe('/chat/channel/chan-1')
  })

  it('routes a staff channel push (no collective_id) to the channel room, not the chat list', () => {
    expect(
      resolveNotificationRoute('chat_messages', { channel_id: 'chan-2', collective_id: '' }),
    ).toBe('/chat/channel/chan-2')
  })

  it('applies channel-first routing to every chat subtype', () => {
    for (const t of ['chat_mention', 'chat_reply', 'chat_image', 'chat_poll', 'chat_announcement']) {
      expect(resolveNotificationRoute(t, { channel_id: 'c9' })).toBe('/chat/channel/c9')
    }
  })

  it('still routes an ordinary collective message (no channel_id) to the collective main chat', () => {
    expect(resolveNotificationRoute('chat_messages', { collective_id: 'col-42' })).toBe('/chat/col-42')
  })

  it('falls back to the chat list when neither channel_id nor collective_id is present', () => {
    expect(resolveNotificationRoute('chat_messages', {})).toBe('/chat')
    expect(resolveNotificationRoute('chat_messages', null)).toBe('/chat')
  })
})

describe('resolveNotificationRoute - precedence + non-chat (regression)', () => {
  it('an explicit, safe data.route still wins over type-based resolution', () => {
    expect(
      resolveNotificationRoute('chat_messages', { route: '/events/e1', channel_id: 'chan-1' }),
    ).toBe('/events/e1')
  })

  it('rejects an unsafe explicit route and falls through to channel routing', () => {
    expect(
      resolveNotificationRoute('chat_messages', { route: 'https://evil.example/x', channel_id: 'chan-1' }),
    ).toBe('/chat/channel/chan-1')
  })

  it('routes event + survey types unchanged', () => {
    expect(resolveNotificationRoute('event_reminder', { event_id: 'e7' })).toBe('/events/e7')
    expect(resolveNotificationRoute('survey_request', { event_id: 'e7' })).toBe('/events/e7/survey')
    expect(resolveNotificationRoute('global_announcement', {})).toBe('/updates')
    expect(resolveNotificationRoute('unknown_type', {})).toBe('/')
  })
})
