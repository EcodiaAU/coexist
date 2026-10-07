/**
 * template-data.ts
 *
 * Refuses a templated send whose subject line would interpolate a field the
 * caller never supplied, so a data gap fails closed instead of putting the
 * literal string "undefined", "null" or "{{event_title}}" in front of a member.
 *
 * Measured origin: on 2026-08-28 a send left hello@coexistaus.org with the
 * subject "Reminder: undefined is coming up". send-email's batch path built
 * each recipient's template data from `recipients[].data` alone and dropped
 * the top-level `payload.data` the single path honours, so a caller using the
 * documented top-level shape rendered every field as missing and the send
 * went out anyway. Measured reach, 2026-10-08: 1 of 11,842 Resend events since
 * 2026-08-13 carried a missing-field subject, and its recipient was our own
 * probe address, so no member ever received one.
 *
 * Two subject sources, two checks, in the order resolveSubject picks them:
 *
 * - An admin override (`system_email_overrides.subject`) is a `{{key}}`
 *   template. interpolate() replaces only the keys present in the data, so an
 *   absent key survives as a literal `{{key}}` and a null one renders blank.
 *   The live event_reminder row carries one, which is why a guard that only
 *   looked for the word "undefined" would miss today's failure shape entirely.
 *
 * - A built-in subject is a function. Which keys it reads is recorded with a
 *   proxy, and whether it PRINTS a key (as opposed to branching on it) is
 *   decided by rendering a sentinel in its place and looking for it in the
 *   output. donation_receipt reads `is_recurring` only to choose a word, so it
 *   is never required; event_reminder prints `event_title`, so it is.
 *
 * Neither check keeps a hand-written map of type -> required keys. Such a map
 * drifts the moment someone edits a subject, and it drifts silently, which is
 * the same failure class this module exists to catch.
 */

import { interpolate, type TemplateOverride } from './email-subject.ts'

export type SubjectFn = (data: Record<string, unknown>) => string

/** Rendered in place of a field to tell an interpolated field from a branched-on one. */
const SENTINEL = '__eos_subject_field_probe__'

/** `{{key}}` placeholders, matching what interpolate() replaces. */
const PLACEHOLDER = /\{\{(\w+)\}\}/g

/**
 * Absent, null, or whitespace only. An EMPTY string is a caller's deliberate
 * blank (self-service-ticket passes '' for fields it means to leave empty), so
 * it is not a gap.
 */
function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return typeof value === 'string' && value !== '' && value.trim() === ''
}

/**
 * The data keys a subject function reads, recorded by handing it a proxy that
 * answers undefined for everything and notes what was asked for. Keys touched
 * before a throw are still returned, so a template that reaches into a nested
 * value degrades to a partial answer rather than no answer.
 */
export function subjectFields(subjectFn: SubjectFn): string[] {
  const touched = new Set<string>()
  const probe = new Proxy({} as Record<string, unknown>, {
    get(_target, key) {
      if (typeof key === 'string') touched.add(key)
      return undefined
    },
    has() {
      return true
    },
  })
  try {
    subjectFn(probe)
  } catch {
    // A template that threw still told us what it read before it did.
  }
  return [...touched]
}

/** Render a subject without letting a throwing template take the caller down. */
export function renderSubject(subjectFn: SubjectFn, data: Record<string, unknown>): string {
  try {
    return subjectFn(data)
  } catch {
    return ''
  }
}

/**
 * The fields a built-in subject function would print while the caller left
 * them missing. Empty means the subject is safe to render.
 */
export function missingSubjectFields(
  subjectFn: SubjectFn,
  data: Record<string, unknown> | null | undefined,
): string[] {
  const d = data ?? {}
  return subjectFields(subjectFn).filter(
    (key) => isMissing(d[key]) && renderSubject(subjectFn, { ...d, [key]: SENTINEL }).includes(SENTINEL),
  )
}

/** The `{{key}}` placeholders in an override subject whose value is missing. */
export function missingPlaceholderFields(
  template: string,
  data: Record<string, unknown> | null | undefined,
): string[] {
  const d = data ?? {}
  const keys = new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))
  return [...keys].filter((key) => isMissing(d[key]))
}

/**
 * The missing fields for the subject this send will actually carry, following
 * resolveSubject's precedence exactly: an explicit subject needs nothing, an
 * override subject that interpolates to something non-blank is the one used,
 * and otherwise the built-in function is.
 */
export function missingFieldsForSend(
  explicit: string | null | undefined,
  override: TemplateOverride | null,
  templateSubject: SubjectFn,
  data: Record<string, unknown> | null | undefined,
): string[] {
  if (explicit) return []
  const d = data ?? {}
  if (override?.subject && interpolate(override.subject, d).trim()) {
    return missingPlaceholderFields(override.subject, d)
  }
  return missingSubjectFields(templateSubject, d)
}

/**
 * A batch recipient's template data: the top-level `payload.data` as the
 * shared base, the recipient's own `data` on top, and the address last so the
 * unsubscribe link is always this recipient's. The single path has honoured
 * top-level data all along; the batch path dropping it is the 2026-08-28 bug.
 */
export function batchRecipientData(
  shared: Record<string, unknown> | null | undefined,
  own: Record<string, unknown> | null | undefined,
  to: string,
): Record<string, unknown> {
  return { ...(shared ?? {}), ...(own ?? {}), __recipientEmail: to }
}

/** One line naming what the caller left out, for a log or an error body. */
export function describeMissing(type: string, missing: string[]): string {
  return `Template "${type}" is missing required data: ${missing.join(', ')}`
}
