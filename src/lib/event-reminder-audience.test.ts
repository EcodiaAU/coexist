import { describe, it, expect } from 'vitest'
import {
  buildReminderAudience,
  describeReminderOutcome,
} from './event-reminder-audience'

const HOST = 'host-1'

describe('buildReminderAudience', () => {
  it('reminds every active member except the host', () => {
    const audience = buildReminderAudience(
      [{ user_id: HOST }, { user_id: 'm1' }, { user_id: 'm2' }],
      [],
      HOST,
    )
    expect(audience).toEqual(['m1', 'm2'])
  })

  it('leaves out anyone who cancelled, because cancelling is a no', () => {
    const audience = buildReminderAudience(
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
    const audience = buildReminderAudience(
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
    const audience = buildReminderAudience(
      [{ user_id: 'm1' }],
      [{ user_id: 'm1', status: 'waitlisted' }],
      HOST,
    )
    expect(audience).toEqual(['m1'])
  })

  it('treats a null status as still in', () => {
    const audience = buildReminderAudience(
      [{ user_id: 'm1' }],
      [{ user_id: 'm1', status: null }],
      HOST,
    )
    expect(audience).toEqual(['m1'])
  })

  it('never sends the same person two copies', () => {
    const audience = buildReminderAudience(
      [{ user_id: 'm1' }, { user_id: 'm1' }],
      [],
      HOST,
    )
    expect(audience).toEqual(['m1'])
  })

  it('survives the queries coming back empty or null', () => {
    expect(buildReminderAudience(null, null, HOST)).toEqual([])
    expect(buildReminderAudience(undefined, undefined, HOST)).toEqual([])
    expect(buildReminderAudience([], [], HOST)).toEqual([])
  })

  it('returns nobody when the host is the only member', () => {
    expect(buildReminderAudience([{ user_id: HOST }], [], HOST)).toEqual([])
  })
})

describe('describeReminderOutcome', () => {
  it('reports both channels when both went', () => {
    expect(describeReminderOutcome({ emailed: 12, chatPosted: true }))
      .toBe('Emailed 12 members and posted to the collective chat.')
  })

  it('singularises one recipient', () => {
    expect(describeReminderOutcome({ emailed: 1, chatPosted: false }))
      .toBe('Emailed 1 member.')
  })

  it('does not claim a chat post that was skipped', () => {
    const msg = describeReminderOutcome({
      emailed: 5,
      chatPosted: false,
      chatSkippedReason: 'Chat post skipped - 3 announcements already in the last 24h.',
    })
    expect(msg).toContain('Emailed 5 members.')
    expect(msg).toContain('Chat post skipped')
    expect(msg).not.toContain('posted to the collective chat')
  })

  it('says chat only when that is all that happened', () => {
    expect(describeReminderOutcome({ emailed: 0, chatPosted: true }))
      .toBe('Posted to the collective chat.')
  })

  it('does not report a success when nothing was sent', () => {
    expect(describeReminderOutcome({ emailed: 0, chatPosted: false }))
      .toBe('Nothing was sent - nobody to remind')
  })

  it('surfaces the skip reason when that is the only thing to say', () => {
    expect(describeReminderOutcome({
      emailed: 0,
      chatPosted: false,
      chatSkippedReason: 'Chat post failed.',
    })).toBe('Chat post failed.')
  })
})
