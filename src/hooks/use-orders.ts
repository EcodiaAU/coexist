import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { Order, ShippingAddress, ReturnRequest } from '@/types/merch'
import { useCart } from '@/hooks/use-cart'

/* ------------------------------------------------------------------ */
/*  Create checkout session (merch)                                    */
/* ------------------------------------------------------------------ */

interface CreateMerchCheckoutParams {
  shippingAddress: ShippingAddress
}

export function useCreateMerchCheckout() {
  const { user } = useAuth()
  const cart = useCart()

  return useMutation({
    mutationFn: async (params: CreateMerchCheckoutParams) => {
      const res = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'merch',
          user_id: user?.id,
          items: cart.items.map((i) => ({
            product_id: i.product.id,
            variant_id: i.variant.id,
            quantity: i.quantity,
            price_cents: i.variant.price_cents,
            product_name: i.product.name,
            variant_label: [i.variant.size, i.variant.colour].filter(Boolean).join(' / '),
            image_url: i.product.images[0] ?? null,
          })),
          shipping_address: params.shippingAddress,
          promo_code_id: cart.promoCode?.id ?? null,
          subtotal_cents: cart.subtotalCents(),
          member_discount_cents: cart.memberDiscountCents(),
          discount_cents: cart.discountCents(),
          shipping_cents: cart.shippingCents(),
          total_cents: cart.totalCents(),
        },
      })
      if (res.error) throw res.error
      return res.data as { session_id: string; url: string }
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Order history (current user)                                       */
/* ------------------------------------------------------------------ */

export function useMyOrders() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-orders', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_orders')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Order[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Single order detail                                                */
/* ------------------------------------------------------------------ */

export function useOrder(orderId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_orders')
        .select('*')
        .eq('id', orderId!)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data as unknown as Order
    },
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Saved shipping addresses                                           */
/* ------------------------------------------------------------------ */

export function useSavedAddresses() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['saved-addresses', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Extract unique shipping addresses from previous orders
      const { data, error } = await supabase
        .from('merch_orders')
        .select('shipping_address')
        .eq('user_id', user!.id)
        .not('shipping_address', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error

      // Deduplicate by line1 + postcode
      const seen = new Set<string>()
      const addresses: ShippingAddress[] = []
      for (const row of data ?? []) {
        const addr = row.shipping_address as unknown as ShippingAddress | null
        if (!addr?.line1) continue
        const key = `${addr.line1}|${addr.postcode}`
        if (seen.has(key)) continue
        seen.add(key)
        addresses.push(addr)
      }
      return addresses
    },
    staleTime: 10 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Request return                                                     */
/* ------------------------------------------------------------------ */

export function useRequestReturn() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      if (!user) throw new Error('Must be signed in')
      const { error } = await supabase
        .from('return_requests')
        .insert({ order_id: orderId, reason, user_id: user.id })
      if (error) throw error
    },
    onMutate: async ({ orderId }) => {
      await queryClient.cancelQueries({ queryKey: ['my-orders'] })
      const previous = queryClient.getQueryData<Order[]>(['my-orders', user?.id])
      queryClient.setQueryData<Order[]>(['my-orders', user?.id], (old) =>
        old?.map((o) => (o.id === orderId ? { ...o, return_requested: true } : o)),
      )
      return { previous }
    },
    onError: (_err, _, context) => {
      if (context?.previous) queryClient.setQueryData(['my-orders', user?.id], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] })
      queryClient.invalidateQueries({ queryKey: ['my-returns'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  My return requests                                                 */
/* ------------------------------------------------------------------ */

export function useMyReturns() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-returns', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('return_requests')
        .select('*, order:merch_orders(id, status, total, created_at)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as ReturnRequest[]
    },
    staleTime: 2 * 60 * 1000,
  })
}
