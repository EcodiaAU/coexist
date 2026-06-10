import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

/* ------------------------------------------------------------------ */
/*  Referral code (one per user, stored in referral_codes table)       */
/* ------------------------------------------------------------------ */

export function useReferralCode() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['referral-code', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated')

      const { data: existing } = await supabase
        .from('referral_codes')
        .select('code')
        .eq('user_id', user.id)
        .maybeSingle()

      return existing?.code ?? null
    },
    enabled: !!user,
    staleTime: 60 * 60 * 1000,
  })

  const createCode = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')
      const code = `CE-${user.id.substring(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
      const { error } = await supabase
        .from('referral_codes')
        .insert({ user_id: user.id, code })
      if (error) {
        // If unique constraint on user_id, code already exists - fetch it
        if (error.code === '23505') {
          const { data } = await supabase
            .from('referral_codes')
            .select('code')
            .eq('user_id', user.id)
            .single()
          return data?.code ?? code
        }
        throw error
      }
      return code
    },
    onSuccess: (code) => {
      queryClient.setQueryData(['referral-code', user?.id], code)
    },
  })

  return { ...query, createCode }
}

/* ------------------------------------------------------------------ */
/*  Referral stats (invites sent, accepted, pending)                   */
/* ------------------------------------------------------------------ */

export function useReferralStats(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id

  return useQuery({
    queryKey: ['referral-stats', id],
    queryFn: async () => {
      if (!id) throw new Error('No user ID')

      const { data: invites, error } = await supabase
        .from('invites')
        .select('status')
        .eq('inviter_id', id)
        .neq('invitee_email', '') // exclude any legacy empty rows

      if (error) throw error

      const total = invites?.length ?? 0
      const accepted = invites?.filter((i) => i.status === 'accepted').length ?? 0
      const pending = invites?.filter((i) => i.status === 'pending').length ?? 0

      return { total, accepted, pending }
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Send invite (insert a pending invite for a specific email)         */
/* ------------------------------------------------------------------ */

export function useSendInvite() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      if (!user) throw new Error('Not authenticated')

      const trimmedEmail = email.trim().toLowerCase()
      if (!trimmedEmail) throw new Error('Email is required')

      // Block self-invite
      const { data: authUser } = await supabase.auth.getUser()
      if (authUser?.user?.email?.toLowerCase() === trimmedEmail) {
        throw new Error('You cannot invite yourself')
      }

      const { error } = await supabase
        .from('invites')
        .insert({
          inviter_id: user.id,
          invitee_email: trimmedEmail,
          code,
          status: 'pending',
        })

      if (error) {
        // Duplicate invite to same email
        if (error.code === '23505') {
          throw new Error('You have already invited this email address')
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-stats', user?.id] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Validate referral code (used during signup, works for anon)        */
/* ------------------------------------------------------------------ */

export function useValidateReferralCode() {
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase
        .from('referral_codes')
        .select('user_id, code')
        .eq('code', code.trim().toUpperCase())
        .maybeSingle()

      if (error) throw error
      return data // null if code doesn't exist
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Accept referral (called after signup to link referrer)              */
/* ------------------------------------------------------------------ */

export function useAcceptReferral() {
  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.rpc('accept_referral', {
        referral_code: code.trim().toUpperCase(),
      })
      if (error) throw error
    },
  })
}
