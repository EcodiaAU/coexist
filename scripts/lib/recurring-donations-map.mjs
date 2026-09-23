/**
 * Pure Stripe-subscription -> recurring_donations mapping.
 *
 * Split out of reconcile-recurring-donations.mjs so the decisions that actually
 * carry risk (status mapping against a CHECK constraint, which fields Stripe is
 * allowed to overwrite) are unit-testable without touching Stripe or the DB.
 */

/** Sentinel for a Stripe status with no honest home in the DB CHECK constraint. */
export const UNMAPPABLE = Symbol('unmappable-status')

/**
 * recurring_donations_status_check allows exactly: active, cancelled, paused, past_due.
 * Stripe's vocabulary is larger and spells cancellation with one L, which is the
 * kind of mismatch that inserts nothing and reports success.
 *
 * `incomplete` and `incomplete_expired` deliberately return UNMAPPABLE rather
 * than being folded into `cancelled`: neither is a gift the donor ever gave, and
 * recording a payment that never completed as a cancelled donation would put a
 * gift on a donor's page that they were never charged for.
 */
export function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'canceled':
    case 'unpaid':
      return 'cancelled'
    case 'past_due':
      return 'past_due'
    case 'paused':
      return 'paused'
    default:
      return UNMAPPABLE
  }
}

const iso = (unixSeconds) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null

/** The customer may be an id string, an expanded object, or a deleted stub. */
function donorIdentity(subscription) {
  const c = subscription.customer
  if (!c || typeof c === 'string' || c.deleted) return { email: null, name: null }
  return {
    email: c.email ? c.email.trim().toLowerCase() : null,
    name: c.name ?? null,
  }
}

/**
 * Build the row Stripe says should exist. user_id is deliberately absent: linking
 * is the claim function's job, keyed on a CONFIRMED auth email, so that a caller
 * can never assert who a gift belongs to.
 */
export function rowFromSubscription(subscription) {
  const price = subscription.items?.data?.[0]?.price ?? {}
  const { email, name } = donorIdentity(subscription)
  return {
    stripe_subscription_id: subscription.id,
    amount: (price.unit_amount ?? 0) / 100,
    currency: (price.currency ?? 'aud').toUpperCase(),
    status: mapStripeStatus(subscription.status),
    billing_interval: price.recurring?.interval ?? null,
    donor_email: email,
    donor_name: name,
    created_at: iso(subscription.created),
    cancelled_at: iso(subscription.canceled_at),
  }
}

/**
 * Fields Stripe owns outright. Everything else on an existing row is the app's
 * (or a human's) and is only ever filled in when NULL, never overwritten.
 */
/**
 * created_at is Stripe-authoritative, not fill-if-null, because the donations
 * page renders it as "Started". A row the webhook created on a RENEWAL carried
 * the date the app first heard about the gift, so a donor giving since 2024 was
 * told they started in 2026. Stripe's subscription `created` is when the gift
 * actually began.
 */
const STRIPE_AUTHORITATIVE = ['status', 'billing_interval', 'cancelled_at', 'amount', 'created_at']
const FILL_IF_NULL = ['donor_email', 'donor_name', 'currency']

const sameInstant = (a, b) => {
  if (!a || !b) return a === b
  const ta = Date.parse(a), tb = Date.parse(b)
  return Number.isFinite(ta) && Number.isFinite(tb) ? ta === tb : a === b
}

const equal = (field, a, b) => {
  if (field === 'amount') return Number(a) === Number(b)
  if (field === 'cancelled_at' || field === 'created_at') return sameInstant(a, b)
  return a === b
}

/**
 * The minimal patch that moves `current` to agree with `desired`.
 * Returns {} when the row already agrees, so a clean reconcile writes nothing.
 * Never emits user_id: a claimed row stays claimed.
 */
export function diffRow(current, desired) {
  const patch = {}
  for (const f of STRIPE_AUTHORITATIVE) {
    if (desired[f] === null || desired[f] === undefined) continue
    if (!equal(f, current[f], desired[f])) patch[f] = desired[f]
  }
  for (const f of FILL_IF_NULL) {
    if (current[f] === null || current[f] === undefined) {
      if (desired[f] !== null && desired[f] !== undefined) patch[f] = desired[f]
    }
  }
  if (Object.keys(patch).length) patch.updated_at = new Date().toISOString()
  return patch
}
