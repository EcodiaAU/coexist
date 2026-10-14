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
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  describeMissing,
  missingSubjectFields,
  renderSubject,
  subjectFields,
} from '../_shared/template-data.ts'

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
