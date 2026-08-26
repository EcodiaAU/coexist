/**
 * Recipient-address resolution for transactional email (2026-08-26).
 *
 * WHY THIS EXISTS. Co-Exist resolved every userId-addressed email to
 * auth.users.email. For a member who signed in with Apple, that value is an
 * @privaterelay.appleid.com forwarding address, and every one of those sends
 * has bounced. Measured on the live project (tjutlbzekfouwsiaplbr) on
 * 2026-08-26: 68 sends to 43 distinct relay addresses, 68 bounces, ZERO
 * deliveries in the entire resend_events history. Non-relay addresses over the
 * same window: 975 delivered against 25 bounced. The relay path is not lossy,
 * it is dead.
 *
 * The bounce is uniform and it names the cause:
 *   550 5.1.1 <...@send.coexistaus.org>: unauthorized sender
 * That is Apple's relay refusing the ENVELOPE sender domain, not a member who
 * switched forwarding off. The standing fix is registering send.coexistaus.org
 * in the Apple Developer "Sign in with Apple for Email Communication"
 * configuration, which is a portal action and is tracked separately.
 *
 * WHAT THIS FILE FIXES IN THE MEANTIME. public.profiles.email holds the real
 * address a member typed, and for 17 of the 220 relay accounts it is a
 * deliverable non-relay address. Preferring it turns 17 undeliverable members
 * into reachable ones today and costs nothing for everyone else. It is the
 * minor lever of the two and it is written down here as the minor lever so a
 * later session does not read it as the fix.
 *
 * WHAT THIS FILE MUST NEVER BE USED FOR. Supabase resolves a user by their AUTH
 * email, so anything feeding auth.admin.generateLink (magic links in
 * stripe-webhook, grant-event-ticket, reserve-event-spot) MUST keep passing the
 * auth address. Swapping in a profile address there breaks sign-in. This helper
 * answers "where do we DELIVER" and nothing else.
 */

/** Apple's Sign-in-with-Apple forwarding domain. */
const APPLE_RELAY_DOMAIN = '@privaterelay.appleid.com'

export function isAppleRelay(email: string | null | undefined): boolean {
  return typeof email === 'string' &&
    email.trim().toLowerCase().endsWith(APPLE_RELAY_DOMAIN)
}

/** Cheap shape check. A stored profile email can be blank, whitespace, or junk. */
function looksSendable(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false
  const t = email.trim()
  return t.length > 3 && t.includes('@') && !t.includes(' ')
}

export type RecipientReason =
  | 'auth'
  | 'profile_over_relay'
  | 'profile_only'
  | 'relay_no_alternative'
  | 'none'

export interface ResolvedRecipient {
  email: string
  /** Why this address won. Logged so a bounce can be read back to a decision. */
  reason: RecipientReason
}

/**
 * Choose the address to deliver to.
 *
 * Order:
 *   1. A usable auth email that is NOT an Apple relay wins outright. This is
 *      the overwhelming majority and its behaviour is unchanged.
 *   2. An Apple relay auth email yields to a usable non-relay profile email.
 *   3. An Apple relay with no alternative is still returned, because a send
 *      that will probably bounce is better than no send at all AND the bounce
 *      is what feeds resend_events, which is how this was found.
 *   4. No auth email at all falls through to the profile email.
 */
export function resolveRecipientEmail(
  authEmail: string | null | undefined,
  profileEmail: string | null | undefined,
): ResolvedRecipient {
  const auth = typeof authEmail === 'string' ? authEmail.trim() : ''
  const profile = typeof profileEmail === 'string' ? profileEmail.trim() : ''

  const authUsable = looksSendable(auth)
  const profileUsable = looksSendable(profile)

  if (authUsable && !isAppleRelay(auth)) return { email: auth, reason: 'auth' }

  if (authUsable && isAppleRelay(auth)) {
    if (profileUsable && !isAppleRelay(profile)) {
      return { email: profile, reason: 'profile_over_relay' }
    }
    return { email: auth, reason: 'relay_no_alternative' }
  }

  if (profileUsable) return { email: profile, reason: 'profile_only' }
  return { email: '', reason: 'none' }
}
