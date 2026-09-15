/**
 * email-subject.test.ts
 *
 * Covers the subject precedence both send-email paths now share.
 *
 * The failure this exists for is silent: the batch path computed its subject
 * from the built-in template alone, so an admin's saved override applied to a
 * single send and was discarded on the collective invite and reminder sends
 * that are the only callers of the batch endpoint. Nothing errored and nothing
 * logged; the mail simply went out with the wrong subject.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { interpolate, resolveSubject, type TemplateOverride } from '../_shared/email-subject.ts'

/** The live event_invite subject, as it reads after the 2026-09-15 change. */
const eventInvite = (d: Record<string, unknown>) => `You're invited: ${d.event_title}`

function override(fields: Partial<TemplateOverride>): TemplateOverride {
  return {
    hero_title: null,
    hero_subtitle: null,
    hero_emoji: null,
    body_html: null,
    subject: null,
    cta_label: null,
    cta_url: null,
    enabled: true,
    ...fields,
  }
}

Deno.test('the event leads the invite subject', () => {
  assertEquals(
    resolveSubject(undefined, null, eventInvite, { event_title: 'Captain Burke Park Clean Up' }),
    "You're invited: Captain Burke Park Clean Up",
  )
})

Deno.test('an admin override beats the built-in template', () => {
  assertEquals(
    resolveSubject(
      undefined,
      override({ subject: 'Come along: {{event_title}}' }),
      eventInvite,
      { event_title: 'Kings Beach Clean Up' },
    ),
    'Come along: Kings Beach Clean Up',
  )
})

Deno.test('the override is interpolated per recipient, not once', () => {
  // The batch path renders one subject per person off that person's own data.
  // Sharing a single pre-rendered string is how every recipient would get the
  // first recipient's event.
  const ov = override({ subject: 'Hi {{name}}, {{event_title}} is on' })
  const subjects = [
    { name: 'Alex', event_title: 'Breamlea Bush Regen' },
    { name: 'Sam', event_title: 'Skywalk Nature Walk' },
  ].map((d) => resolveSubject(undefined, ov, eventInvite, d))
  assertEquals(subjects, [
    'Hi Alex, Breamlea Bush Regen is on',
    'Hi Sam, Skywalk Nature Walk is on',
  ])
})

Deno.test('an explicit payload subject beats everything', () => {
  assertEquals(
    resolveSubject(
      'Hand-written subject',
      override({ subject: 'Come along: {{event_title}}' }),
      eventInvite,
      { event_title: 'Kings Beach Clean Up' },
    ),
    'Hand-written subject',
  )
})

Deno.test('an override row with no subject falls through instead of sending a blank', () => {
  // An admin who edited only the hero leaves `subject` null. Treating that as
  // an override would ship an empty subject line.
  for (const blank of [null, '', '   ']) {
    assertEquals(
      resolveSubject(undefined, override({ subject: blank }), eventInvite, {
        event_title: 'Yorkeys Knob Beach Clean Up',
      }),
      "You're invited: Yorkeys Knob Beach Clean Up",
      `expected fallthrough for subject ${JSON.stringify(blank)}`,
    )
  }
})

Deno.test('a placeholder with no matching data renders empty, never the literal', () => {
  assertEquals(interpolate('A: {{missing}}', { other: 'x' }), 'A: {{missing}}')
  assertEquals(interpolate('A: {{missing}}', { missing: null }), 'A: ')
})
