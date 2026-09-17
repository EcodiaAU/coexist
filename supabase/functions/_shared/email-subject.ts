/**
 * email-subject.ts
 *
 * One implementation of "what goes on the subject line", shared by send-email's
 * single path and its batch path.
 *
 * Measured origin, 2026-09-15: the batch path never read
 * `public.system_email_overrides` at all. It computed the subject straight from
 * the built-in template table, so an admin who edited a subject in /admin/email
 * saw it honoured on a single send and silently ignored on every collective
 * invite and reminder. Those two are the ONLY sends that go through the batch
 * endpoint, which made the admin control dead exactly where it was most likely
 * to be used. The same gap skipped the `enabled = false` kill switch and the
 * `body_html` override for those sends.
 *
 * Two near-identical copies of a precedence chain is how that gap appeared in
 * the first place, so there is now one copy and both callers import it.
 */

/** An admin-authored override row for one template type. */
export interface TemplateOverride {
  hero_title: string | null
  hero_subtitle: string | null
  hero_emoji: string | null
  body_html: string | null
  subject: string | null
  cta_label: string | null
  cta_url: string | null
  enabled: boolean
}

/** Substitute {{variable}} placeholders against the template data dict. */
export function interpolate(input: string, data: Record<string, unknown>): string {
  let out = input
  for (const [key, value] of Object.entries(data ?? {})) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value ?? ''))
  }
  return out
}

/**
 * Subject precedence, highest first:
 *   1. an explicit subject on the payload (non-template sends)
 *   2. the admin override, interpolated against THIS recipient's data
 *   3. the built-in template's own subject function
 *
 * An override row whose `subject` is null or blank falls through to the
 * built-in rather than sending a blank subject line: the admin edited some
 * other field of that row and left this one alone.
 */
export function resolveSubject(
  explicit: string | null | undefined,
  override: TemplateOverride | null,
  templateSubject: (data: Record<string, unknown>) => string,
  data: Record<string, unknown>,
): string {
  if (explicit) return explicit
  const fromOverride = override?.subject ? interpolate(override.subject, data).trim() : ''
  if (fromOverride) return fromOverride
  return templateSubject(data)
}
