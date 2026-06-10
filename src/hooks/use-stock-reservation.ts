import { useCallback, useEffect, useRef, useState, startTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/toast'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** How long a reservation lasts (minutes) */
const RESERVATION_DURATION_MINUTES = 15

/** How often to check expiry and trigger countdown (ms) */
const TICK_INTERVAL = 1000

/** Warn when reservation has this many seconds left */
const EXPIRY_WARNING_THRESHOLD = 120

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ReservationResult {
  success: boolean
  error?: string
  available?: number
  requested?: number
  expires_at?: string
  reserved?: number
}

export interface AvailableStockEntry {
  variant_key: string
  total_stock: number
  reserved: number
  available: number
}

/* ------------------------------------------------------------------ */
/*  useReserveStock - reserve/release a single variant                 */
/* ------------------------------------------------------------------ */

export function useReserveStock() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const reserve = useCallback(
    async (productId: string, variantKey: string, quantity: number): Promise<ReservationResult> => {
      if (!user) return { success: false, error: 'not_authenticated' }

      const { data, error } = await supabase.rpc('reserve_stock', {
        p_user_id: user.id,
        p_product_id: productId,
        p_variant_key: variantKey,
        p_quantity: quantity,
        p_duration_minutes: RESERVATION_DURATION_MINUTES,
      })

      if (error) return { success: false, error: error.message }

      // Invalidate stock queries so UI reflects new availability
      queryClient.invalidateQueries({ queryKey: ['product-stock'] })
      queryClient.invalidateQueries({ queryKey: ['available-stock'] })

      return data as unknown as ReservationResult
    },
    [user, queryClient],
  )

  const release = useCallback(
    async (variantKey: string) => {
      if (!user) return
      const { error } = await supabase.rpc('release_reservation', {
        p_user_id: user.id,
        p_variant_key: variantKey,
      })
      if (error) console.error('[stock] release error:', error.message)
      queryClient.invalidateQueries({ queryKey: ['product-stock'] })
      queryClient.invalidateQueries({ queryKey: ['available-stock'] })
    },
    [user, queryClient],
  )

  const releaseAll = useCallback(async () => {
    if (!user) return
    const { error } = await supabase.rpc('release_all_reservations', {
      p_user_id: user.id,
    })
    if (error) console.error('[stock] release error:', error.message)
    queryClient.invalidateQueries({ queryKey: ['product-stock'] })
    queryClient.invalidateQueries({ queryKey: ['available-stock'] })
  }, [user, queryClient])

  return { reserve, release, releaseAll }
}

/* ------------------------------------------------------------------ */
/*  useAvailableStock - fetch available stock for a product            */
/*  (total - other users' reservations)                                */
/* ------------------------------------------------------------------ */

export function useAvailableStock(productId: string | undefined) {
  const { user } = useAuth()
  const [stockMap, setStockMap] = useState<Map<string, AvailableStockEntry>>(new Map())
  const [loading, setLoading] = useState(true)

  const fetchStock = useCallback(async () => {
    if (!productId) return
    const { data, error } = await supabase.rpc('get_product_available_stock', {
      p_product_id: productId,
      p_exclude_user_id: user?.id ?? undefined,
    })

    startTransition(() => {
      if (!error && data) {
        const entries = data as unknown as AvailableStockEntry[]
        const map = new Map<string, AvailableStockEntry>()
        for (const entry of entries) {
          map.set(entry.variant_key, entry)
        }
        setStockMap(map)
      }
      setLoading(false)
    })
  }, [productId, user?.id])

  // Initial fetch
  useEffect(() => {
    fetchStock()
  }, [fetchStock])

  // Subscribe to realtime changes on merch_inventory and cart_reservations
  useEffect(() => {
    if (!productId) return

    const channel = supabase
      .channel(`stock:${productId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merch_inventory',
          filter: `product_id=eq.${productId}`,
        },
        () => fetchStock(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cart_reservations',
          filter: `product_id=eq.${productId}`,
        },
        () => fetchStock(),
      )


    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [productId, fetchStock])

  const getAvailable = useCallback(
    (variantKey: string): number => {
      return stockMap.get(variantKey)?.available ?? 0
    },
    [stockMap],
  )

  return { stockMap, loading, getAvailable, refetch: fetchStock }
}

/* ------------------------------------------------------------------ */
/*  useMyReservations - track current user's active reservations        */
/* ------------------------------------------------------------------ */

export interface MyReservation {
  id: string
  variant_key: string
  product_id: string
  quantity: number
  expires_at: string
}

export function useMyReservations() {
  const { user } = useAuth()
  const [reservations, setReservations] = useState<MyReservation[]>([])

  const fetchReservations = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('cart_reservations')
      .select('id, variant_key, product_id, quantity, expires_at')
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())

    startTransition(() => {
      setReservations((data as unknown as MyReservation[]) ?? [])
    })
  }, [user])

  useEffect(() => {
    fetchReservations()
  }, [fetchReservations])

  // Realtime updates to own reservations
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`my-reservations:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cart_reservations',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchReservations(),
      )


    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [user, fetchReservations])

  const getReservation = useCallback(
    (variantKey: string) => reservations.find((r) => r.variant_key === variantKey),
    [reservations],
  )

  return { reservations, getReservation, refetch: fetchReservations }
}

/* ------------------------------------------------------------------ */
/*  useReservationCountdown - seconds remaining on a reservation       */
/* ------------------------------------------------------------------ */

export function useReservationCountdown(expiresAt: string | undefined) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!expiresAt) {
      startTransition(() => setSecondsLeft(null))
      return
    }

    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      startTransition(() => setSecondsLeft(diff))
    }

    update()
    const id = setInterval(update, TICK_INTERVAL)
    return () => clearInterval(id)
  }, [expiresAt])

  const isExpiring = secondsLeft !== null && secondsLeft <= EXPIRY_WARNING_THRESHOLD && secondsLeft > 0
  const isExpired = secondsLeft === 0

  return { secondsLeft, isExpiring, isExpired }
}

/* ------------------------------------------------------------------ */
/*  useCartReservationSync - keeps reservations in sync with cart      */
/*  Call this once at the cart/checkout level. It reserves stock for   */
/*  every cart item and releases when items are removed.               */
/* ------------------------------------------------------------------ */

export function useCartReservationSync(cartItems: { product: { id: string }; variant: { id: string }; quantity: number }[]) {
  const { reserve, releaseAll } = useReserveStock()
  const { toast } = useToast()
  const prevItemsRef = useRef<string>('')
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Sync reservations whenever cart changes
  useEffect(() => {
    const key = JSON.stringify(cartItems.map((i) => `${i.variant.id}:${i.quantity}`).sort())
    if (key === prevItemsRef.current) return
    prevItemsRef.current = key

    const sync = async () => {
      for (const item of cartItems) {
        const result = await reserve(item.product.id, item.variant.id, item.quantity)
        if (!result.success && result.error === 'insufficient_stock' && isMountedRef.current) {
          toast.error(
            `Only ${result.available} left for one of your items. Please update your cart.`,
          )
        }
      }
    }

    sync()
  }, [cartItems, reserve, toast])

  // Release all on unmount (e.g. user leaves checkout flow)
  // Note: we do NOT release on unmount by default - reservations
  // are time-bound and should persist across page navigations.
  // They auto-expire after RESERVATION_DURATION_MINUTES.

  return { releaseAll }
}

/* ------------------------------------------------------------------ */
/*  Expiry warning threshold (exported for UI)                         */
/* ------------------------------------------------------------------ */

export { EXPIRY_WARNING_THRESHOLD, RESERVATION_DURATION_MINUTES }
