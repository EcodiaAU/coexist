/**
 * template-data.test.ts
 *
 * Covers the guard that stops a templated send whose subject would interpolate
 * a missing field. The failure it exists for is silent by construction: the
 * send succeeds, Resend accepts it, the webhook records a delivery, and the
 * only evidence is the word "undefined" in a member's inbox.
 *
 * Measured origin: 2026-08-28, subject "Reminder: undefined is coming up" from
 * hello@coexistaus.org, produced by send-email's batch path dropping the
 * top-level `payload.data`.
 *
 * The assertions worth having here are the ones that separate a real gap from
 * something that merely looks like one: a template that branches on a field
 * rather than printing it, and a title that legitimately contains the word.
 *
 * Added 2026-10-08: the override path. The live event_reminder row in
 * system_email_overrides carries the subject `Reminder: {{event_title}} is
 * coming up`, and since 2026-09-15 the batch path reads it, so today's failure
 * shape is a literal `{{event_title}}`, not "undefined". The first draft of this
 * guard only matched the word "undefined" and could not see it.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  batchRecipientData,
  describeMissing,
  missingFieldsForSend,
  missingPlaceholderFields,
  missingSubjectFields,
  renderSubject,
  subjectFields,
} from '../_shared/template-data.ts'
import { resolveSubject, type TemplateOverride } from '../_shared/email-subject.ts'

/** The live event_reminder subject, copied from send-email's template table. */
const eventReminder = (d: Record<string, unknown>) => `Reminder: ${d.event_title} is coming up`
/** The live donation_receipt subject: reads a field but branches on it. */
const donationReceipt = (d: Record<string, unknown>) =>
  `Thanks for your ${d.is_recurring ? 'recurring ' : ''}donation!`
/** The live event_invite subject: two interpolated fields, not one. */
const eventInvite = (d: Record<string, unknown>) =>
  `${d.inviter_name} invited you to ${d.event_title}`

Deno.test('the send that went out: a titleless reminder is refused', () => {
  // This is the exact payload shape the batch path produced. Before the fix it
  // rendered and shipped; the guard must name the field and stop it.
  assertEquals(missingSubjectFields(eventReminder, {}), ['event_title'])
})

Deno.test('a titleless reminder is refused however the title went missing', () => {
  for (const data of [{}, { event_title: undefined }, { event_title: null }, { event_title: '   ' }]) {
    assertEquals(
      missingSubjectFields(eventReminder, data),
      ['event_title'],
      `expected a refusal for ${JSON.stringify(data)}`,
    )
  }
})

Deno.test('null or absent data is refused rather than thrown on', () => {
  assertEquals(missingSubjectFields(eventReminder, null), ['event_title'])
  assertEquals(missingSubjectFields(eventReminder, undefined), ['event_title'])
})

Deno.test('a reminder with a title is allowed', () => {
  assertEquals(missingSubjectFields(eventReminder, { event_title: 'Beach cleanup' }), [])
})

Deno.test('a branching template is not required to supply the field it branches on', () => {
  // donation_receipt renders "Thanks for your donation!" with is_recurring
  // absent. That is correct output, so requiring the field would refuse a
  // send that was never broken.
  assertEquals(missingSubjectFields(donationReceipt, {}), [])
  assertEquals(missingSubjectFields(donationReceipt, { is_recurring: true }), [])
})

Deno.test('a title that contains the word undefined is still allowed', () => {
  // The rendered subject carries the token, but the data is present, so there
  // is nothing missing. This is why the verdict is not a string match alone.
  assertEquals(missingSubjectFields(eventReminder, { event_title: 'the undefined problem' }), [])
})

Deno.test('every interpolated field is named, not just the first', () => {
  assertEquals(missingSubjectFields(eventInvite, {}).sort(), ['event_title', 'inviter_name'])
  assertEquals(missingSubjectFields(eventInvite, { inviter_name: 'Kurt' }), ['event_title'])
})

Deno.test('an empty string is a deliberate blank, not a gap', () => {
  // self-service-ticket passes '' for fields it means to leave empty. Those
  // render as empty, never as "undefined", so they must not be refused.
  const optional = (d: Record<string, unknown>) => `Ticket for ${d.event_title}${d.suffix ?? ''}`
  assertEquals(missingSubjectFields(optional, { event_title: 'Beach cleanup', suffix: '' }), [])
})

Deno.test('subjectFields reports what a template reads', () => {
  assertEquals(subjectFields(eventReminder), ['event_title'])
  assertEquals(subjectFields(eventInvite).sort(), ['event_title', 'inviter_name'])
})

Deno.test('a throwing template degrades to a rendered blank, not a crash', () => {
  const hostile = () => {
    throw new Error('template blew up')
  }
  assertEquals(renderSubject(hostile, {}), '')
  assertEquals(missingSubjectFields(hostile, {}), [])
})

Deno.test('the refusal names the template and the fields', () => {
  assertEquals(
    describeMissing('event_reminder', ['event_title']),
    'Template "event_reminder" is missing required data: event_title',
  )
})

/** The live system_email_overrides row for event_reminder, subject verbatim. */
const reminderOverride: TemplateOverride = {
  hero_title: 'Coming up soon!',
  hero_subtitle: '{{event_title}}',
  hero_emoji: null,
  body_html: null,
  subject: 'Reminder: {{event_title}} is coming up',
  cta_label: 'View Event',
  cta_url: '{{event_url}}',
  enabled: true,
}

Deno.test('the override path: an absent title would ship a literal placeholder, and is refused', () => {
  // Precondition, so this test fails loudly if interpolate ever changes: today
  // an absent key really does survive as the literal.
  assertEquals(
    resolveSubject(undefined, reminderOverride, eventReminder, {}),
    'Reminder: {{event_title}} is coming up',
  )
  assertEquals(missingFieldsForSend(undefined, reminderOverride, eventReminder, {}), ['event_title'])
})

Deno.test('the override path: a null title is refused, a present one is allowed', () => {
  assertEquals(missingFieldsForSend(undefined, reminderOverride, eventReminder, { event_title: null }), [
    'event_title',
  ])
  assertEquals(
    missingFieldsForSend(undefined, reminderOverride, eventReminder, { event_title: 'Beach cleanup' }),
    [],
  )
})

Deno.test('the override path: a field only the admin subject prints is still required', () => {
  // An admin who edits the subject in /admin/email to add the date makes
  // event_date required, though the built-in subject never prints it. Judging
  // the built-in subject here would wave the send through with a literal
  // {{event_date}} in it.
  const edited = { ...reminderOverride, subject: 'Reminder: {{event_title}} on {{event_date}}' }
  assertEquals(missingFieldsForSend(undefined, edited, eventReminder, { event_title: 'Beach cleanup' }), ['event_date'])
})

Deno.test('a real title with trailing spaces is allowed (live subjects carry them)', () => {
  // 201 delivered reminders since 2026-08-28 read like "Shelly Beach Clean Up  is
  // coming up": a real title with a trailing space. Not a gap, never refused.
  assertEquals(
    missingFieldsForSend(undefined, reminderOverride, eventReminder, { event_title: 'Shelly Beach Clean Up ' }),
    [],
  )
})

Deno.test('an explicit subject needs no data at all', () => {
  assertEquals(missingFieldsForSend('Hello from Co-Exist', reminderOverride, eventReminder, {}), [])
})

Deno.test('an override subject that interpolates to nothing falls back to the built-in check', () => {
  // resolveSubject skips an override whose subject renders blank, so the guard
  // must judge the subject that will really be used, not the override.
  const blankOverride = { ...reminderOverride, subject: '{{event_title}}' }
  assertEquals(resolveSubject(undefined, blankOverride, eventReminder, { event_title: null }), 'Reminder: null is coming up')
  assertEquals(missingFieldsForSend(undefined, blankOverride, eventReminder, { event_title: null }), ['event_title'])
})

Deno.test('missingPlaceholderFields names each missing placeholder once', () => {
  assertEquals(missingPlaceholderFields('{{a}} and {{b}} and {{a}}', { b: 'x' }), ['a'])
  assertEquals(missingPlaceholderFields('no placeholders here', {}), [])
})

Deno.test('the batch merge: top-level data reaches every recipient', () => {
  // The exact 2026-08-28 shape: title at the top, nothing per recipient.
  const d = batchRecipientData({ event_title: 'Beach cleanup' }, undefined, 'a@example.org')
  assertEquals(d.event_title, 'Beach cleanup')
  assertEquals(missingFieldsForSend(undefined, null, eventReminder, d), [])
})

Deno.test('the batch merge: a recipient overrides the shared value, and the address is always theirs', () => {
  const d = batchRecipientData(
    { event_title: 'Shared', name: 'everyone', __recipientEmail: 'wrong@example.org' },
    { name: 'Alex' },
    'alex@example.org',
  )
  assertEquals(d, { event_title: 'Shared', name: 'Alex', __recipientEmail: 'alex@example.org' })
})

Deno.test('the batch merge: neither side supplied still yields only the address', () => {
  assertEquals(batchRecipientData(null, null, 'a@example.org'), { __recipientEmail: 'a@example.org' })
})

/* ------------------------------------------------------------------ */
/*  Wiring: the guard is only worth anything if both send paths call it */
/* ------------------------------------------------------------------ */

/**
 * The first draft of this guard sat for six weeks as a module nothing called,
 * with its tests green the whole time. A unit test of the helper cannot see
 * that. These read send-email's source and go red if either path stops
 * consulting it, or if the batch path goes back to reading r.data alone.
 */
const SEND_EMAIL_SRC = await Deno.readTextFile(new URL('../send-email/index.ts', import.meta.url))

Deno.test('both send paths ask the missing-data gate before rendering a subject', () => {
  const calls = SEND_EMAIL_SRC.match(/missingFieldsForSend\(/g) ?? []
  assertEquals(calls.length, 2, 'expected missingFieldsForSend at the batch path and the single path')
})

Deno.test('the batch path merges top-level data instead of dropping it', () => {
  assertEquals(
    SEND_EMAIL_SRC.includes('batchRecipientData(payload.data, r.data,'),
    true,
    'batch path no longer merges payload.data into each recipient',
  )
  assertEquals(
    /\{\s*\.\.\.\(r\.data \?\? \{\}\),\s*__recipientEmail/.test(SEND_EMAIL_SRC),
    false,
    'batch path is building recipient data from r.data alone again (the 2026-08-28 bug)',
  )
})

Deno.test('the single path refuses with a 400 that names the gap', () => {
  const at = SEND_EMAIL_SRC.indexOf('missingFieldsForSend(payload.subject, override,')
  assertEquals(at > 0, true, 'single-path gate not found')
  const block = SEND_EMAIL_SRC.slice(at, at + 1000)
  assertEquals(block.includes('status: 400'), true, 'single-path refusal is no longer a 400')
  assertEquals(block.includes('describeMissing(type, missing)'), true, 'single-path refusal no longer names the fields')
})
