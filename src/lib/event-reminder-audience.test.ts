import { describe, it, expect } from 'vitest'
import {
  buildInviteAudience,
  describeInviteOutcome,
} from './event-reminder-audience'

const HOST = 'host-1'

describe('buildInviteAudience', () => {
  it('reminds every active member except the host', () => {
    const audience = buildInviteAudience(
      [{ user_id: HOST }, { user_id: 'm1' }, { user_id: 'm2' }],
      [],
      HOST,
    )
    expect(audience).toEqual(['m1', 'm2'])
  })

  it('leaves out anyone who cancelled, because cancelling is a no', () => {
    const audience = buildInviteAudience(
      [{ user_id: 'm1' }, { user_id: 'm2' }, { user_id: 'm3' }],
      [
        { user_id: 'm2', status: 'cancelled' },
        { user_id: 'm3', status: 'invited' },
      ],
      HOST,
    )
    expect(audience).toEqual(['m1', 'm3'])
  })

  it('still reminds people who are already registered - that is the "come" half', () => {
    const audience = buildInviteAudience(
      [{ user_id: 'm1' }, { user_id: 'm2' }],
      [
        { user_id: 'm1', status: 'registered' },
        { user_id: 'm2', status: 'attended' },
      ],
      HOST,
    )
    expect(audience).toEqual(['m1', 'm2'])
  })

  it('is not confused by a waitlisted member', () => {
    const audience = buildInviteAudience(
      [{ user_id: 'm1' }],
      [{ user_id: 'm1', status: 'waitlisted' }],
      HOST,
    )
    expect(audience).toEqual(['m1'])
  })

  it('treats a null status as still in', () => {
    const audience = buildInviteAudience(
      [{ user_id: 'm1' }],
      [{ user_id: 'm1', status: null }],
      HOST,
    )
    expect(audience).toEqual(['m1'])
  })

  it('never sends the same person two copies', () => {
    const audience = buildInviteAudience(
      [{ user_id: 'm1' }, { user_id: 'm1' }],
      [],
      HOST,
    )
    expect(audience).toEqual(['m1'])
  })

  it('survives the queries coming back empty or null', () => {
    expect(buildInviteAudience(null, null, HOST)).toEqual([])
    expect(buildInviteAudience(undefined, undefined, HOST)).toEqual([])
    expect(buildInviteAudience([], [], HOST)).toEqual([])
  })

  it('returns nobody when the host is the only member', () => {
    expect(buildInviteAudience([{ user_id: HOST }], [], HOST)).toEqual([])
  })
})

describe('describeInviteOutcome', () => {
  it('reports both channels when both went', () => {
    expect(describeInviteOutcome({ emailed: 12, chatPosted: true }))
      .toBe('Emailed 12 members and posted to the collective chat.')
  })

  it('singularises one recipient', () => {
    expect(describeInviteOutcome({ emailed: 1, chatPosted: false }))
      .toBe('Emailed 1 member.')
  })

  it('does not claim a chat post that was skipped', () => {
    const msg = describeInviteOutcome({
      emailed: 5,
      chatPosted: false,
      chatSkippedReason: 'Chat post skipped - 3 announcements already in the last 24h.',
    })
    expect(msg).toContain('Emailed 5 members.')
    expect(msg).toContain('Chat post skipped')
    expect(msg).not.toContain('posted to the collective chat')
  })

  it('says chat only when that is all that happened', () => {
    expect(describeInviteOutcome({ emailed: 0, chatPosted: true }))
      .toBe('Posted to the collective chat.')
  })

  it('does not report a success when nothing was sent', () => {
    expect(describeInviteOutcome({ emailed: 0, chatPosted: false }))
      .toBe('Nothing was sent - nobody to invite')
  })

  it('surfaces the skip reason when that is the only thing to say', () => {
    expect(describeInviteOutcome({
      emailed: 0,
      chatPosted: false,
      chatSkippedReason: 'Chat post failed.',
    })).toBe('Chat post failed.')
  })

  it('reports push as its own channel', () => {
    expect(describeInviteOutcome({ emailed: 0, pushed: 8, chatPosted: false }))
      .toBe('Sent 8 push notifications.')
  })

  it('reports all three channels when all three went', () => {
    expect(describeInviteOutcome({ emailed: 12, pushed: 12, chatPosted: true }))
      .toBe('Emailed 12 members, sent 12 push notifications and posted to the collective chat.')
  })

  it('singularises a lone push', () => {
    expect(describeInviteOutcome({ emailed: 0, pushed: 1, chatPosted: false }))
      .toBe('Sent 1 push notification.')
  })

  it('leads with the invite count on a first press', () => {
    expect(describeInviteOutcome({ emailed: 40, pushed: 40, chatPosted: true, invited: 40 }))
      .toBe('Invited 40 members, emailed 40 members, sent 40 push notifications and posted to the collective chat.')
  })

  it('still confirms the invite when every channel was switched off', () => {
    expect(describeInviteOutcome({ emailed: 0, pushed: 0, chatPosted: false, invited: 3 }))
      .toBe('Invited 3 members.')
  })

  it('does not invent a push that was not sent', () => {
    expect(describeInviteOutcome({ emailed: 5, pushed: 0, chatPosted: false }))
      .toBe('Emailed 5 members.')
  })
})
