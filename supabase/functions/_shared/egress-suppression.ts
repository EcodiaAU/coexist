/**
 * egress-suppression.ts - the last gate before an address goes on the wire.
 *
 * NOT the same thing as _shared/recipient-suppression.ts. That file answers
 * "did this member switch this kind of mail off" (marketing_opt_in,
 * notification_preferences). This file answers "is this ADDRESS dead or
 * complaining", which is public.email_suppressions, written by resend-webhook
 * when Resend reports a hard bounce or a spam complaint.
 *
 * WHY THIS EXISTS. Audited 2026-08-28 on tjutlbzekfouwsiaplbr. Co-Exist has
 * exactly six HTTP egress points to Resend, across three edge functions:
 *
 *   send-email          /emails        (single)   and /emails/batch
 *   send-campaign       /emails        (test send) and /emails/batch
 *   notify-application  /emails        (x2, staff notification)
 *
 * Only ONE of those six consulted email_suppressions, and it did so indirectly:
 * the campaign batch draws its audience from the SQL function
 * resolve_campaign_audience, whose body carries
 *   AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE es.email = u.email)
 * (deployed body probed with pg_get_functiondef on 2026-08-28, matches
 * migration 028). Every other egress point mailed a suppressed address happily.
 *
 * The measured consequence: on 2026-08-28 three "Reminder: <event> is coming
 * up" sends went to b5ckwrn7y9@, 49j58nyp2j@ and 9ddb68k56p@privaterelay.appleid.com
 * while all three were listed in email_suppressions (suppressed 2026-08-17,
 * 2026-08-26 and 2026-08-19 respectively). The event-reminder path runs through
 * send-email, which never read the table.
 *
 * WHY IT IS ONE FILE AND NOT THREE PATCHES. A per-call-site check is the shape
 * that produced this bug: send-campaign got one, the other five did not, and
 * nothing made that visible. The gate lives next to the fetch instead, so a new
 * send path has to go out of its way to skip it.
 *
 * WHY TRANSACTIONAL IS SUPPRESSED TOO. A hard bounce means the mailbox is gone
 * and a complaint means the member pressed "spam". Mailing either again cannot
 * reach anyone and actively damages the sending domain's reputation, which is
 * what carries every OTHER member's mail. It also silently defeats the bounce
 * handler that wrote the row. Consent-based suppression (recipient-suppression.ts)
 * deliberately spares transactional mail; address-death suppression does not,
 * because there is no address left to spare.
 *
 * MATCHING. resolve_campaign_audience compares exactly and resend-webhook
 * upserts the `to` field as Resend reported it, so a case difference would let
 * a suppressed address through unnoticed. All 27 live rows are lowercase
 * (probed 2026-08-28), and this file normalises both sides anyway so a future
 * mixed-case row cannot reopen the hole.
 */

/** lower(trim()). The one normal form both sides of the compare are put into. */
export function normaliseEmail(email: string | null | undefined): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/**
 * Fetches the suppressed addresses among `candidates`.
 *
 * Injected rather than taken as a Supabase client so the gate can be tested
 * without a database, which is the only way to prove it fails CLOSED.
 */
export type SuppressionFetcher = (candidates: string[]) => Promise<string[]>

/** The narrow slice of a supabase-js admin client this needs. */
export interface SuppressionQueryable {
  from(table: string): {
    select(cols: string): {
      in(col: string, values: string[]): Promise<{ data: { email: string }[] | null; error: unknown }>
    }
  }
}

/**
 * Build a fetcher over public.email_suppressions.
 *
 * Queries on the raw AND lowercased forms of each candidate so a stored row in
 * either case is found by the index, then the caller normalises what comes
 * back. Requires the service-role key: migration 068 leaves SELECT to admins
 * and service_role only.
 */
export function makeSuppressionFetcher(admin: SuppressionQueryable): SuppressionFetcher {
  return async (candidates: string[]) => {
    if (candidates.length === 0) return []
    const variants = [...new Set(candidates.flatMap((c) => [c, normaliseEmail(c)]).filter(Boolean))]
    const { data, error } = await admin
      .from('email_suppressions')
      .select('email')
      .in('email', variants)
    if (error) throw error
    return (data ?? []).map((r) => r.email)
  }
}

/**
 * The addresses among `candidates` that must NOT be mailed, as a Set of
 * NORMALISED addresses. Test membership with `has(normaliseEmail(addr))`.
 *
 * FAILS CLOSED. A lookup that throws suppresses NOTHING would be the tempting
 * shape ("do not let the gate break the mail"), and it is wrong here: the gate
 * exists because mailing a dead or complaining address costs sender reputation
 * and breaks compliance, and a database that cannot answer is not evidence the
 * address is fine. The error propagates to the caller, which surfaces it as a
 * failed send rather than an unchecked one.
 */
export async function suppressedEmailSet(
  fetcher: SuppressionFetcher,
  candidates: (string | null | undefined)[],
): Promise<Set<string>> {
  const wanted = [...new Set(candidates.map(normaliseEmail).filter(Boolean))]
  if (wanted.length === 0) return new Set<string>()
  const rows = await fetcher(wanted)
  const stored = new Set(rows.map(normaliseEmail))
  return new Set(wanted.filter((w) => stored.has(w)))
}

/** Convenience for a single address. Same fail-closed contract. */
export async function isEmailSuppressed(
  fetcher: SuppressionFetcher,
  email: string | null | undefined,
): Promise<boolean> {
  const set = await suppressedEmailSet(fetcher, [email])
  return set.has(normaliseEmail(email))
}
