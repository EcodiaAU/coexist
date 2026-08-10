import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type {
  Donation,
  DonationFrequency,
  DonationProject,
  DonorWallEntry,
  RecurringDonation,
} from '@/types/donations'

/* ------------------------------------------------------------------ */
/*  Donation projects (with goal thermometer data)                     */
/* ------------------------------------------------------------------ */

export function useDonationProjects() {
  return useQuery({
    queryKey: ['donation-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donation_projects')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as unknown as DonationProject[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Create donation → Stripe Checkout                                  */
/* ------------------------------------------------------------------ */

interface CreateDonationParams {
  amount: number
  frequency: DonationFrequency
  projectId?: string
  message?: string
  onBehalfOf?: string
  isPublic?: boolean
}

export function useCreateDonation() {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (params: CreateDonationParams) => {
      const res = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'donation',
          user_id: user?.id,
          amount: params.amount,
          frequency: params.frequency,
          project_id: params.projectId ?? null,
          message: params.message ?? null,
          on_behalf_of: params.onBehalfOf ?? null,
          is_public: params.isPublic ?? true,
        },
      })
      if (res.error) throw res.error
      return res.data as { session_id: string; url: string }
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Donation history (current user)                                    */
/* ------------------------------------------------------------------ */

export function useMyDonations() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-donations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donations')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Donation[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Recurring donations management                                     */
/* ------------------------------------------------------------------ */

export function useMyRecurringDonations() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-recurring-donations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_donations')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as RecurringDonation[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useCancelRecurringDonation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const res = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'cancel_subscription',
          stripe_subscription_id: subscriptionId,
        },
      })
      if (res.error) throw res.error
    },
    onMutate: async (subscriptionId) => {
      await queryClient.cancelQueries({ queryKey: ['my-recurring-donations', user?.id] })
      const previous = queryClient.getQueryData<RecurringDonation[]>(['my-recurring-donations', user?.id])
      queryClient.setQueryData<RecurringDonation[]>(['my-recurring-donations', user?.id], (old) =>
        old?.map((d) =>
          d.stripe_subscription_id === subscriptionId ? { ...d, status: 'cancelled' as const } : d,
        ),
      )
      return { previous }
    },
    onError: (_err, _, context) => {
      if (context?.previous) queryClient.setQueryData(['my-recurring-donations', user?.id], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['my-recurring-donations', user?.id] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Donor wall (public, opt-in)                                        */
/* ------------------------------------------------------------------ */

export function useDonorWall() {
  return useQuery({
    queryKey: ['donor-wall'],
    queryFn: async () => {
      // Served through the get_public_donor_wall SECURITY DEFINER RPC, which
      // projects ONLY the recognition fields (name, avatar, amount, message,
      // date). This closes two holes at once:
      //   - PII leak: the old direct read relied on the donations_select_public
      //     RLS policy, which - because RLS is row-level, never column-level -
      //     exposed donor_email / donor_name / stripe_payment_id of every public
      //     donation to any logged-in user (backlog 292). That policy is dropped.
      //   - "Anonymous" collapse: the old profiles(...) embed was subject to
      //     profiles RLS, so most opted-in donors rendered as Anonymous (backlog
      //     295). The RPC resolves display_name/avatar inside the definer.
      const { data, error } = await (supabase as unknown as {
        rpc: (
          fn: 'get_public_donor_wall',
          args: { p_limit: number },
        ) => Promise<{ data: DonorWallEntry[] | null; error: unknown }>
      }).rpc('get_public_donor_wall', { p_limit: 100 })
      if (error) throw error as Error
      return (data ?? []).map((d): DonorWallEntry => ({
        id: d.id,
        display_name: d.display_name ?? null,
        on_behalf_of: d.on_behalf_of ?? null,
        amount: d.amount,
        message: d.message ?? null,
        avatar_url: d.avatar_url ?? null,
        created_at: d.created_at,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
}
