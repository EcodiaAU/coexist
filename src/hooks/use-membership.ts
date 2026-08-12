import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

/* ------------------------------------------------------------------ */
/*  Types (kept local; membership tables are Stripe-native)            */
/* ------------------------------------------------------------------ */

export type MembershipInterval = 'monthly' | 'yearly'
export type MembershipStatus = 'active' | 'cancelled' | 'past_due' | 'trialing'

export interface MembershipPlan {
  id: string
  name: string
  description: string | null
  price_monthly: number
  price_yearly: number
  stripe_price_monthly: string | null
  stripe_price_yearly: string | null
  is_active: boolean
  sort_order: number
}

export interface Membership {
  id: string
  user_id: string
  plan_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  interval: MembershipInterval
  status: MembershipStatus
  current_period_start: string | null
  current_period_end: string | null
  created_at: string
  membership_plans?: { name: string; price_monthly: number; price_yearly: number } | null
}

const LIVE_STATUSES: MembershipStatus[] = ['active', 'past_due', 'trialing']

/* ------------------------------------------------------------------ */
/*  Hero imagery - a real Co-Exist campout photo, never a UI gradient  */
/* ------------------------------------------------------------------ */

/**
 * A real Co-Exist campout/event cover photo for the membership hero. Membership
 * leads with the campout-discount perk, so a campout photo is on-theme. Prefers a
 * ticketed campout; falls back to any published event with a cover.
 */
export function useMembershipHeroImage() {
  return useQuery({
    queryKey: ['membership-hero-image'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('cover_image_url, is_ticketed, date_start')
        .not('cover_image_url', 'is', null)
        .eq('status', 'published')
        .order('is_ticketed', { ascending: false })
        .order('date_start', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0]?.cover_image_url as string | undefined) ?? null
    },
    staleTime: 10 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Plans (public: any authenticated user can read active plans)       */
/* ------------------------------------------------------------------ */

export function useMembershipPlans() {
  return useQuery({
    queryKey: ['membership-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return (data ?? []).map((p): MembershipPlan => ({
        ...(p as unknown as MembershipPlan),
        price_monthly: Number((p as { price_monthly: unknown }).price_monthly),
        price_yearly: Number((p as { price_yearly: unknown }).price_yearly),
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Current user's membership (own-row RLS)                            */
/* ------------------------------------------------------------------ */

export function useMyMembership() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-membership', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, membership_plans(name, price_monthly, price_yearly)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as unknown as Membership[]
      // Prefer a live membership; fall back to the most recent row (e.g. cancelled).
      return rows.find((m) => LIVE_STATUSES.includes(m.status)) ?? rows[0] ?? null
    },
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Join → Stripe subscription Checkout                                */
/* ------------------------------------------------------------------ */

export function useCreateMembership() {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (params: { planId: string; interval: MembershipInterval }) => {
      const res = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'membership',
          user_id: user?.id,
          plan_id: params.planId,
          interval: params.interval,
        },
      })
      if (res.error) throw res.error
      return res.data as { session_id: string; url: string }
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Cancel + billing portal                                            */
/* ------------------------------------------------------------------ */

export function useCancelMembership() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const res = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'cancel_membership',
          stripe_subscription_id: subscriptionId,
        },
      })
      if (res.error) throw res.error
    },
    onMutate: async (subscriptionId) => {
      await queryClient.cancelQueries({ queryKey: ['my-membership', user?.id] })
      const previous = queryClient.getQueryData<Membership | null>(['my-membership', user?.id])
      queryClient.setQueryData<Membership | null>(['my-membership', user?.id], (old) =>
        old && old.stripe_subscription_id === subscriptionId
          ? { ...old, status: 'cancelled' as const }
          : old,
      )
      return { previous }
    },
    onError: (_err, _sub, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['my-membership', user?.id], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['my-membership', user?.id] })
    },
  })
}

/**
 * Open a Stripe billing-portal session for a membership so the member can update
 * their card (recovers a past_due subscription). Returns the portal URL; the
 * caller redirects to it.
 */
export function useMembershipPortal() {
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const res = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'membership_portal',
          stripe_subscription_id: subscriptionId,
        },
      })
      if (res.error) throw res.error
      return res.data as { url: string }
    },
  })
}
