/**
 * The Stripe -> recurring_donations mapping used by
 * scripts/reconcile-recurring-donations.mjs.
 *
 * Guards the decisions that silently lose donors: the one-L/two-L cancellation
 * spelling against the DB CHECK constraint, the annual-vs-monthly interval that
 * mislabelled every $25/year gift as monthly, and the merge rules that must not
 * unlink a donor who has already claimed their gift.
 */
import { describe, it, expect } from 'vitest'
import {
  mapStripeStatus,
  rowFromSubscription,
  diffRow,
  UNMAPPABLE,
} from '../../scripts/lib/recurring-donations-map.mjs'

const sub = (over: Record<string, unknown> = {}) => ({
  id: 'sub_test',
  status: 'active',
  created: 1724729590, // 2024-08-27
  canceled_at: null,
  customer: { id: 'cus_test', email: 'Donor@Example.COM ', name: 'A Donor' },
  items: { data: [{ price: { unit_amount: 2500, currency: 'aud', recurring: { interval: 'year' } } }] },
  ...over,
})

describe('mapStripeStatus', () => {
  it('spells cancellation the way the DB CHECK constraint does', () => {
    // Stripe says "canceled"; recurring_donations_status_check allows "cancelled".
    expect(mapStripeStatus('canceled')).toBe('cancelled')
  })

  it('maps every status the DB can hold', () => {
    expect(mapStripeStatus('active')).toBe('active')
    expect(mapStripeStatus('trialing')).toBe('active')
    expect(mapStripeStatus('past_due')).toBe('past_due')
    expect(mapStripeStatus('paused')).toBe('paused')
    expect(mapStripeStatus('unpaid')).toBe('cancelled')
  })

  it('refuses to record a payment that never completed as a donation', () => {
    expect(mapStripeStatus('incomplete')).toBe(UNMAPPABLE)
    expect(mapStripeStatus('incomplete_expired')).toBe(UNMAPPABLE)
    expect(mapStripeStatus('something_stripe_adds_later')).toBe(UNMAPPABLE)
  })
})

describe('rowFromSubscription', () => {
  it('carries the real billing interval rather than assuming monthly', () => {
    expect(rowFromSubscription(sub()).billing_interval).toBe('year')
    const monthly = sub({ items: { data: [{ price: { unit_amount: 1000, currency: 'aud', recurring: { interval: 'month' } } }] } })
    expect(rowFromSubscription(monthly).billing_interval).toBe('month')
  })

  it('normalises the donor email, because the claim function matches on lower(btrim())', () => {
    expect(rowFromSubscription(sub()).donor_email).toBe('donor@example.com')
  })

  it('converts cents to dollars and upper-cases the currency', () => {
    const r = rowFromSubscription(sub())
    expect(r.amount).toBe(25)
    expect(r.currency).toBe('AUD')
  })

  it('dates the row from the Stripe subscription, not from now', () => {
    expect(rowFromSubscription(sub()).created_at).toBe(new Date(1724729590 * 1000).toISOString())
  })

  it('survives a customer that is an id string or a deleted stub', () => {
    expect(rowFromSubscription(sub({ customer: 'cus_raw' })).donor_email).toBeNull()
    expect(rowFromSubscription(sub({ customer: { id: 'cus_x', deleted: true } })).donor_email).toBeNull()
  })

  it('never asserts a user_id: linking is the confirmed-email claim function job', () => {
    expect('user_id' in rowFromSubscription(sub())).toBe(false)
  })

  it('records the cancellation instant when Stripe has one', () => {
    const r = rowFromSubscription(sub({ status: 'canceled', canceled_at: 1730000000 }))
    expect(r.status).toBe('cancelled')
    expect(r.cancelled_at).toBe(new Date(1730000000 * 1000).toISOString())
  })
})

describe('diffRow', () => {
  const desired = rowFromSubscription(sub({ status: 'canceled', canceled_at: 1730000000 }))

  it('writes nothing when the row already agrees', () => {
    const current = { ...desired, id: 'row', user_id: 'u1' }
    expect(diffRow(current, current)).toEqual({})
  })

  it('lets Stripe correct a status the app got wrong', () => {
    const current = { ...desired, status: 'active', cancelled_at: null }
    const patch = diffRow(current, desired)
    expect(patch.status).toBe('cancelled')
    expect(patch.cancelled_at).toBe(desired.cancelled_at)
  })

  it('never unlinks a donor who has already claimed the gift', () => {
    const current = { ...desired, status: 'active', user_id: 'user-123' }
    expect('user_id' in diffRow(current, desired)).toBe(false)
  })

  it('fills a missing donor email but does not overwrite one the app already holds', () => {
    const blank = { ...desired, donor_email: null }
    expect(diffRow(blank, desired).donor_email).toBe('donor@example.com')

    const human = { ...desired, donor_email: 'corrected-by-staff@example.com' }
    expect('donor_email' in diffRow(human, desired)).toBe(false)
  })

  it('corrects a start date the app invented on a renewal', () => {
    // The webhook stamped now() when it first saw a 2024 gift renew in 2026, so
    // the page told the donor they started giving two years after they did.
    const current = { ...desired, created_at: '2026-09-09T22:14:03.344Z' }
    expect(diffRow(current, desired).created_at).toBe(desired.created_at)
  })

  it('does not churn on an equivalent timestamp written in a different format', () => {
    const current = { ...desired, cancelled_at: new Date(1730000000 * 1000).toUTCString() }
    expect('cancelled_at' in diffRow(current, desired)).toBe(false)
  })

  it('treats a numeric amount and its string form as equal, as Postgres numeric returns it', () => {
    const current = { ...desired, amount: '25.00' }
    expect('amount' in diffRow(current, desired)).toBe(false)
  })

  it('stamps updated_at only when something actually changed', () => {
    const current = { ...desired }
    expect(diffRow(current, current).updated_at).toBeUndefined()
    expect(diffRow({ ...desired, status: 'active' }, desired).updated_at).toBeTruthy()
  })
})
