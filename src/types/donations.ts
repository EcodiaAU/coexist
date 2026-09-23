/** Donation & payment types for Co-Exist */

export type DonationFrequency = 'one_time' | 'monthly'

export interface DonationProject {
  id: string
  name: string
  description: string
  image_url: string | null
  goal_amount: number
  raised_amount: number
  is_active: boolean
}

export interface Donation {
  id: string
  user_id: string | null
  amount: number
  amount_cents: number | null
  currency: string
  stripe_payment_id: string | null
  project_name: string | null
  message: string | null
  on_behalf_of: string | null
  is_public: boolean
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
  donor_name: string | null
  donor_email: string | null
  receipt_number: string | null
  created_at: string
}

export interface DonationWithProfile extends Donation {
  profiles: {
    display_name: string | null
    avatar_url: string | null
  } | null
}

export interface RecurringDonation {
  id: string
  user_id: string
  amount: number
  currency: string
  stripe_subscription_id: string
  status: 'active' | 'cancelled' | 'paused' | 'past_due'
  cancelled_at: string | null
  created_at: string
  /** Stripe price recurring.interval. Null on rows recorded before it was captured. */
  billing_interval: 'day' | 'week' | 'month' | 'year' | null
}

export interface DonorWallEntry {
  id: string
  display_name: string | null
  on_behalf_of: string | null
  amount: number
  message: string | null
  avatar_url: string | null
  created_at: string
}

export const PRESET_AMOUNTS = [5, 10, 25, 50] as const

export const IMPACT_EQUIVALENCIES: Record<number, string> = {
  5: 'provides seeds for 2 native plants',
  10: 'funds one beach cleanup kit',
  25: 'plants ~10 native trees',
  50: 'restores 5m² of habitat',
  100: 'sponsors a full event for a collective',
}

export function getImpactMessage(amount: number): string {
  const thresholds = Object.keys(IMPACT_EQUIVALENCIES)
    .map(Number)
    .sort((a, b) => b - a)
  const match = thresholds.find((t) => amount >= t)
  return match
    ? `$${amount} ${IMPACT_EQUIVALENCIES[match]}`
    : `Every dollar makes a difference`
}
