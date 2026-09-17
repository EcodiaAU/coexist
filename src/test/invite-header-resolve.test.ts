import { describe, it, expect } from 'vitest'
import { resolveInviteHeader, buildInvitePrefilledHeader } from '@/lib/invite-header'

/**
 * The invariant this file exists to hold: an UNTOUCHED press forwards NO header,
 * so every channel keeps the default it had before the field existed and the
 * /admin/email override still decides the email subject.
 *
 * The 16 cases in event-invite-unified-channels.test.ts take `customHeader` as an
 * INPUT and prove where it lands. Nothing tested the decision that produces it,
 * which is where the trailing-whitespace defect lived.
 */
describe('an untouched press forwards no header', () => {
  it('returns undefined when the box still holds the prefill', () => {
    const prefill = buildInvitePrefilledHeader('Skywalk Nature Walk', false)
    expect(resolveInviteHeader(prefill, prefill)).toBeUndefined()
  })

  it('returns undefined when the event title carries a TRAILING SPACE', () => {
    // 11 of 474 live events do, e.g. "North Stradbroke Island Trip ". The first
    // implementation compared a trimmed typed value against an untrimmed
    // prefill, so these events reported every untouched press as edited.
    const prefill = buildInvitePrefilledHeader('North Stradbroke Island Trip ', false)
    expect(resolveInviteHeader(prefill, prefill)).toBeUndefined()
  })

  it('returns undefined for a raw untrimmed prefill still sitting in the box', () => {
    // Belt and braces: even if a prefill reaches the box untrimmed from some
    // other path, an untouched press must still send nothing.
    const raw = "You're invited: North Stradbroke Island Trip "
    expect(resolveInviteHeader(raw, raw)).toBeUndefined()
  })

  it('returns undefined when the host only added surrounding whitespace', () => {
    const prefill = buildInvitePrefilledHeader('Lavender Bay Clean Up', false)
    expect(resolveInviteHeader(`  ${prefill}  `, prefill)).toBeUndefined()
  })

  it('returns undefined when a paste restores the original text', () => {
    const prefill = buildInvitePrefilledHeader('Lavender Bay Clean Up', true)
    expect(resolveInviteHeader(prefill, prefill)).toBeUndefined()
  })

  it('returns undefined for a CLEARED box, so a blank subject never sends', () => {
    const prefill = buildInvitePrefilledHeader('Lavender Bay Clean Up', false)
    expect(resolveInviteHeader('', prefill)).toBeUndefined()
    expect(resolveInviteHeader('    ', prefill)).toBeUndefined()
  })
})

describe('a genuinely edited header travels', () => {
  it('returns the typed text when the host changed it', () => {
    const prefill = buildInvitePrefilledHeader('Skywalk Nature Walk', false)
    expect(resolveInviteHeader('Bring your headtorch', prefill)).toBe('Bring your headtorch')
  })

  it('trims the edited value so a stray space never reaches a subject line', () => {
    const prefill = buildInvitePrefilledHeader('Skywalk Nature Walk', false)
    expect(resolveInviteHeader('  Bring your headtorch  ', prefill)).toBe('Bring your headtorch')
  })

  it('travels even on an event whose own title contains the word Reminder', () => {
    const prefill = buildInvitePrefilledHeader('Reminder Workshop', true)
    expect(prefill).toBe('Reminder: Reminder Workshop')
    expect(resolveInviteHeader(prefill, prefill)).toBeUndefined()
    expect(resolveInviteHeader('Reminder Workshop', prefill)).toBe('Reminder Workshop')
  })
})

describe('the prefill is the finished text, not a placeholder', () => {
  it('writes the real event name in, with no variable syntax', () => {
    expect(buildInvitePrefilledHeader('Skywalk Nature Walk', false))
      .toBe("You're invited: Skywalk Nature Walk")
    expect(buildInvitePrefilledHeader('Skywalk Nature Walk', true))
      .toBe('Reminder: Skywalk Nature Walk')
    expect(buildInvitePrefilledHeader('Skywalk Nature Walk', false)).not.toContain('{{')
  })

  it('never shows the host a stray trailing space they cannot remove', () => {
    const p = buildInvitePrefilledHeader('North Stradbroke Island Trip ', false)
    expect(p).toBe("You're invited: North Stradbroke Island Trip")
    expect(p).toBe(p.trim())
  })
})
