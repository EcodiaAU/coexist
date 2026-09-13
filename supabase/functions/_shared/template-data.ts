/**
 * template-data.ts
 *
 * Refuses a templated send whose data is missing a field the subject line
 * interpolates, so a caller's data gap fails closed instead of putting the
 * literal string "undefined" in front of a member.
 *
 * Measured origin: on 2026-08-28 a send left hello@coexistaus.org with the
 * subject "Reminder: undefined is coming up". send-email's batch path built
 * each recipient's template data from `recipients[].data` alone and dropped
 * the top-level `payload.data` the single path honours, so a caller using the
 * documented top-level shape rendered every field as undefined and the send
 * went out anyway.
 *
 * Why this derives the required fields instead of listing them: a hand-kept
 * map of type -> required keys drifts the moment someone edits a subject
 * template, and it drifts silently, which is the same failure class it is
 * meant to catch. So the check asks the subject function itself what it reads.
 *
 * Why the verdict takes two stages: reading a key is not the same as
 * interpolating it. `donation_receipt` branches on `is_recurring` and renders
 * "Thanks for your donation!" when it is absent, which is correct output, not
 * a gap. So a field is only missing when BOTH the rendered subject carries the
 * undefined token AND the key it read is genuinely absent or blank. That pair
 * also makes a false rejection impossible for a real title that happens to
 * contain the word: the data is present, so nothing is reported.
 */

/** The literal a template leaves behind when it interpolates a missing value. */
const UNDEFINED_TOKEN = /undefined/

export type SubjectFn = (data: Record<string, unknown>) => string

/** Absent, null, or whitespace only. An empty string is a caller's deliberate blank. */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return typeof value === 'string' && value.trim() === ''
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
 * The fields whose absence would put "undefined" in this send's subject line.
 * Empty means the send is safe to render.
 */
export function missingSubjectFields(
  subjectFn: SubjectFn,
  data: Record<string, unknown> | null | undefined,
): string[] {
  const d = data ?? {}
  if (!UNDEFINED_TOKEN.test(renderSubject(subjectFn, d))) return []
  return subjectFields(subjectFn).filter((key) => isBlank(d[key]))
}

/** One line naming what the caller left out, for a log or an error body. */
export function describeMissing(type: string, missing: string[]): string {
  return `Template "${type}" is missing required data: ${missing.join(', ')}`
}
