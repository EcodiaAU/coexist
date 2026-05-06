import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Product, ShippingConfig } from '@/types/merch'

/* ------------------------------------------------------------------ */
/*  Product listing                                                    */
/* ------------------------------------------------------------------ */

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_products')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as unknown as Product[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Single product detail                                              */
/* ------------------------------------------------------------------ */

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ['product', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_products')
        .select('*')
        .eq('slug', slug!)
        .eq('is_active', true)
        .single()
      if (error) throw error
      return data as unknown as Product
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Related products                                                   */
/* ------------------------------------------------------------------ */

export function useRelatedProducts(productId: string | undefined) {
  return useQuery({
    queryKey: ['related-products', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_products')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'active')
        .neq('id', productId!)
        .limit(4)

      if (error) throw error
      return data as unknown as Product[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Product inventory (stock check for variant)                        */
/* ------------------------------------------------------------------ */

export function useProductStock(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-stock', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_inventory')
        .select('variant_key, stock_count, low_stock_threshold')
        .eq('product_id', productId!)
      if (error) throw error
      const map = new Map<string, number>()
      for (const row of data ?? []) {
        map.set(row.variant_key, row.stock_count ?? 0)
      }
      return map
    },
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Promo code validation                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Shipping config                                                    */
/* ------------------------------------------------------------------ */

export function useShippingConfig() {
  return useQuery({
    queryKey: ['shipping-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_config')
        .select('*')
      if (error) throw error

      const config: ShippingConfig = {
        flat_rate_cents: 995,
        free_shipping_threshold_cents: null,
      }
      for (const row of data ?? []) {
        if (row.key === 'flat_rate_cents') config.flat_rate_cents = parseInt(row.value) || 995
        if (row.key === 'free_shipping_threshold_cents') {
          config.free_shipping_threshold_cents = row.value ? parseInt(row.value) || null : null
        }
      }
      return config
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Promo code validation                                              */
/* ------------------------------------------------------------------ */

/** Validate a promo code (called imperatively).
 *  Maps the raw DB row to the app-level PromoCode interface. */
export async function validatePromoCode(code: string) {
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('is_active', true)
    .single()

  if (error || !data) return { valid: false, promo: null }

  const now = new Date()
  if (data.valid_to && new Date(data.valid_to) < now) return { valid: false, promo: null }
  if (data.valid_from && new Date(data.valid_from) > now) return { valid: false, promo: null }
  if (data.max_uses && (data.uses_count ?? 0) >= data.max_uses) return { valid: false, promo: null }

  // Map DB row directly - field names now match the PromoCode interface
  const promo: import('@/types/merch').PromoCode = {
    id: data.id,
    code: data.code,
    type: data.type,
    value: Number(data.value),
    min_order_amount: data.min_order_amount != null ? Number(data.min_order_amount) : null,
    max_uses: data.max_uses ?? null,
    uses_count: data.uses_count ?? 0,
    valid_from: data.valid_from ?? null,
    valid_to: data.valid_to ?? null,
    is_active: data.is_active ?? true,
    created_at: data.created_at!,
  }

  return { valid: true, promo }
}
