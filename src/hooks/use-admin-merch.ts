import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  Product,
  ProductStatus,
  ProductVariant,
  Order,
  OrderStatus,
  PromoCode,
  PromoType,
  ReturnRequest,
} from '@/types/merch'
import type { TablesInsert, TablesUpdate, Json } from '@/types/database.types'

/* ------------------------------------------------------------------ */
/*  Products (admin - includes archived & draft)                       */
/* ------------------------------------------------------------------ */

interface OrderItemRow {
  product_id?: string
  product_name?: string
  price_cents?: number
  quantity?: number
}

interface OrderRow {
  total_cents: number
  items: OrderItemRow[] | unknown
  created_at: string
}

/** Map a DB row back to the app-level Product type */
function fromDbProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: (row.slug as string) ?? '',
    description: (row.description as string) ?? '',
    images: (row.images as string[]) ?? [],
    category: (row.category as string) ?? null,
    status: ((row.status as string) ?? 'active') as ProductStatus,
    base_price_cents: (row.base_price_cents as number) ?? (row.price != null ? Math.round(Number(row.price) * 100) : 0),
    variants: Array.isArray(row.variants) ? row.variants : [],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export function useAdminProducts() {
  return useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_products')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(fromDbProduct)
    },
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Product CRUD                                                       */
/* ------------------------------------------------------------------ */

/** Map app-level product fields to DB columns.
 *  Migration 012 added slug, category, status, base_price_cents directly
 *  to the table, so most fields pass through as-is. We also sync the
 *  legacy `price` (numeric dollars) and `is_active` columns. */
function toDbProduct(product: Partial<Product>): TablesInsert<'merch_products'> {
  const mapped: TablesInsert<'merch_products'> = {
    name: product.name ?? '',
    price: product.base_price_cents != null ? product.base_price_cents / 100 : 0,
  }
  if (product.slug != null) mapped.slug = product.slug
  if (product.description != null) mapped.description = product.description
  if (product.category != null) mapped.category = product.category
  if (product.images != null) mapped.images = product.images
  if (product.base_price_cents != null) {
    mapped.base_price_cents = product.base_price_cents
    // Keep legacy price column in sync (numeric dollars)
    mapped.price = product.base_price_cents / 100
  }
  if (product.status != null) {
    mapped.status = product.status
    // Keep legacy is_active column in sync
    mapped.is_active = product.status === 'active'
  }
  return mapped
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (product: Omit<Product, 'id' | 'variants' | 'created_at' | 'updated_at'>) => {
      const row = toDbProduct(product)
      const { data, error } = await supabase.from('merch_products').insert(row).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      const row = toDbProduct(updates)
      const { data, error } = await supabase
        .from('merch_products')
        .update(row)
        .eq('id', id)
        .select()
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update had no effect - check RLS policies')
      }
      // Return the mapped product so the cache stays in sync
      return fromDbProduct(data[0])
    },
    onMutate: async ({ id, ...updates }) => {
      await qc.cancelQueries({ queryKey: ['admin-products'] })
      const prev = qc.getQueryData<Product[]>(['admin-products'])
      if (prev) {
        qc.setQueryData<Product[]>(['admin-products'], prev.map((p) =>
          p.id === id ? { ...p, ...updates } : p,
        ))
      }
      return { prev }
    },
    onSuccess: (updated) => {
      // Patch the cache with the real DB response so we don't rely on refetch
      if (updated) {
        qc.setQueryData<Product[]>(['admin-products'], (prev) =>
          prev?.map((p) => (p.id === updated.id ? updated : p)),
        )
      }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['admin-products'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
  })
}

/* ------------------------------------------------------------------ */
/*  Stock management (uses merch_inventory table)                      */
/* ------------------------------------------------------------------ */

export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      productId,
      variantKey,
      adjustment,
    }: {
      productId: string
      variantKey: string
      adjustment: number
    }) => {
      if (adjustment === 0) return
      const { error } = await supabase.rpc('adjust_variant_stock', {
        p_product_id: productId,
        p_variant_key: variantKey,
        p_adjustment: adjustment,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
  })
}

export function useProductInventory(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-inventory', productId],
    queryFn: async () => {
      if (!productId) return []
      const { data, error } = await supabase
        .from('merch_inventory')
        .select('*')
        .eq('product_id', productId)
      if (error) throw error
      return data
    },
    enabled: !!productId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Orders (admin)                                                     */
/* ------------------------------------------------------------------ */

export function useAdminOrders(statusFilter?: OrderStatus) {
  return useQuery({
    queryKey: ['admin-orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('merch_orders')
        .select('*, profiles(display_name, avatar_url)')
        .order('created_at', { ascending: false })

      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return data as unknown as (Order & { profiles: { display_name: string | null; avatar_url: string | null } | null })[]
    },
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      status,
      trackingNumber,
    }: {
      orderId: string
      status: OrderStatus
      trackingNumber?: string
    }) => {
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      }
      if (trackingNumber) updates.tracking_number = trackingNumber

      const { error } = await supabase
        .from('merch_orders')
        .update(updates)
        .eq('id', orderId)
      if (error) throw error

      // If marking as shipped, send order_shipped email
      if (status === 'shipped') {
        const { data: order } = await supabase
          .from('merch_orders')
          .select('user_id')
          .eq('id', orderId)
          .single()

        if (order?.user_id) {
          supabase.functions.invoke('send-email', {
            body: {
              type: 'order_shipped',
              userId: order.user_id,
              data: {
                name: '',
                order_id: orderId.slice(0, 8),
                tracking_number: trackingNumber ?? '',
                tracking_url: trackingNumber
                  ? `https://auspost.com.au/mypost/track/#/details/${trackingNumber}`
                  : '',
              },
            },
          }).catch(console.error)
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orders'] }),
  })
}

/* ------------------------------------------------------------------ */
/*  Refund order                                                       */
/* ------------------------------------------------------------------ */

export function useRefundOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      // Mark order as refunded - actual Stripe refund should be processed
      // via Stripe dashboard. The charge.refunded webhook handles inventory
      // restoration automatically.
      const { error } = await supabase
        .from('merch_orders')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orders'] }),
  })
}

/* ------------------------------------------------------------------ */
/*  Variant upsert (add/update product variants via JSONB)             */
/* ------------------------------------------------------------------ */

export function useUpsertVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      productId,
      variant,
    }: {
      productId: string
      variant: Omit<ProductVariant, 'product_id'> & { id?: string }
    }) => {
      // Fetch current product to get existing variants
      const { data: product, error: fetchErr } = await supabase
        .from('merch_products')
        .select('variants')
        .eq('id', productId)
        .single()
      if (fetchErr) throw fetchErr

      const existing = (product?.variants ?? []) as unknown as ProductVariant[]
      let updated: ProductVariant[]

      if (variant.id) {
        // Update existing variant
        updated = existing.map((v) =>
          v.id === variant.id ? { ...v, ...variant, product_id: productId } : v,
        )
      } else {
        // Add new variant with generated id
        const newVariant = {
          ...variant,
          id: crypto.randomUUID(),
          product_id: productId,
        } as ProductVariant
        updated = [...existing, newVariant]
      }

      const { error } = await supabase
        .from('merch_products')
        .update({ variants: updated })
        .eq('id', productId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
  })
}

/* ------------------------------------------------------------------ */
/*  Order admin notes                                                  */
/* ------------------------------------------------------------------ */

// Note: admin_notes column doesn't exist on merch_orders yet.
// This is a no-op placeholder until the column is added via migration.
export function useUpdateOrderNotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes: string }) => {
      console.warn('[useUpdateOrderNotes] admin_notes column not yet on merch_orders, skipping update for', orderId, notes)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orders'] }),
  })
}

/* ------------------------------------------------------------------ */
/*  Promo code management                                              */
/* ------------------------------------------------------------------ */

export function useAdminPromoCodes() {
  return useQuery({
    queryKey: ['admin-promo-codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as PromoCode[]
    },
    staleTime: 60 * 1000,
  })
}

export function useUpsertPromoCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (promo: Partial<PromoCode> & { code: string; type: PromoType; value: number }) => {
      const row: TablesInsert<'promo_codes'> = {
        code: promo.code,
        type: promo.type,
        value: promo.value,
        ...(promo.id != null && { id: promo.id }),
        ...(promo.is_active != null && { is_active: promo.is_active }),
        ...(promo.max_uses != null && { max_uses: promo.max_uses }),
        ...(promo.min_order_amount != null && { min_order_amount: promo.min_order_amount }),
        ...(promo.valid_from != null && { valid_from: promo.valid_from }),
        ...(promo.valid_to != null && { valid_to: promo.valid_to }),
      }
      const { error } = await supabase.from('promo_codes').upsert(row)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-promo-codes'] }),
  })
}

/* ------------------------------------------------------------------ */
/*  Returns management                                                 */
/* ------------------------------------------------------------------ */

export function useAdminReturns() {
  return useQuery({
    queryKey: ['admin-returns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('return_requests')
        .select('*, order:merch_orders(id, status, total_cents), profiles(display_name, avatar_url)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as ReturnRequest[]
    },
    staleTime: 60 * 1000,
  })
}

export function useUpdateReturnStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      returnId,
      status,
    }: {
      returnId: string
      status: 'approved' | 'denied'
      adminNotes?: string
    }) => {
      const { error } = await supabase
        .from('return_requests')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', returnId)
      if (error) throw error

      // Note: Refunds should be processed via the Stripe dashboard.
      // The create-checkout function only handles checkout session creation,
      // not refunds. Stripe refunds trigger the charge.refunded webhook
      // which handles inventory restoration automatically.
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-returns'] })
      qc.invalidateQueries({ queryKey: ['admin-orders'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Shipping config (admin)                                            */
/* ------------------------------------------------------------------ */

export function useUpdateShippingConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (config: { flat_rate_cents: number; free_shipping_threshold_cents: number | null }) => {
      const entries = [
        { key: 'flat_rate_cents', value: String(config.flat_rate_cents) },
        { key: 'free_shipping_threshold_cents', value: config.free_shipping_threshold_cents != null ? String(config.free_shipping_threshold_cents) : '' },
      ]
      for (const entry of entries) {
        const { error } = await supabase
          .from('shipping_config')
          .upsert(entry, { onConflict: 'key' })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-config'] }),
  })
}

/* ------------------------------------------------------------------ */
/*  Sales analytics                                                    */
/* ------------------------------------------------------------------ */

export function useSalesAnalytics(period: 'week' | 'month' | 'year') {
  return useQuery({
    queryKey: ['admin-sales-analytics', period],
    queryFn: async () => {
      const now = new Date()
      let rangeStart: Date
      switch (period) {
        case 'week':
          rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        case 'year':
          rangeStart = new Date(now.getFullYear(), 0, 1)
          break
      }

      const { data, error } = await supabase
        .from('merch_orders')
        .select('total_cents, items, created_at')
        .gte('created_at', rangeStart.toISOString())
        .in('status', ['delivered', 'shipped', 'processing'])

      if (error) throw error

      const orders = (data ?? []) as unknown as OrderRow[]
      const total_revenue_cents = orders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0)
      const total_orders = orders.length
      const total_units_sold = orders.reduce((sum, o) => {
        if (!Array.isArray(o.items)) return sum
        return sum + (o.items as OrderItemRow[]).reduce((s, i) => s + (i.quantity ?? 1), 0)
      }, 0)

      const productMap = new Map<string, { product_id: string; product_name: string; units: number; revenue_cents: number }>()
      for (const o of orders) {
        if (!Array.isArray(o.items)) continue
        for (const item of o.items as OrderItemRow[]) {
          const key = item.product_id ?? item.product_name ?? 'unknown'
          const existing = productMap.get(key) ?? { product_id: key, product_name: item.product_name ?? key, units: 0, revenue_cents: 0 }
          existing.units += item.quantity ?? 1
          existing.revenue_cents += (item.price_cents ?? 0) * (item.quantity ?? 1)
          productMap.set(key, existing)
        }
      }
      const by_product = Array.from(productMap.values()).sort((a, b) => b.revenue_cents - a.revenue_cents)

      const dateMap = new Map<string, { date: string; orders: number; revenue_cents: number }>()
      for (const o of orders) {
        const date = o.created_at?.slice(0, 10) ?? 'unknown'
        const existing = dateMap.get(date) ?? { date, orders: 0, revenue_cents: 0 }
        existing.orders++
        existing.revenue_cents += o.total_cents ?? 0
        dateMap.set(date, existing)
      }
      const by_period = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))

      return { total_revenue_cents, total_orders, total_units_sold, by_product, by_period }
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/* ------------------------------------------------------------------ */
/*  Export orders CSV                                                   */
/* ------------------------------------------------------------------ */

export async function exportOrdersCsv(statusFilter?: OrderStatus) {
  let query = supabase
    .from('merch_orders')
    .select('*, profiles(display_name)')
    .order('created_at', { ascending: false })

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) throw error

  const rows = (data as unknown as Record<string, unknown>[]).map((o) => ({
    order_id: o.id as string,
    date: o.created_at as string,
    customer: (o.profiles as { display_name: string | null } | null)?.display_name ?? 'Unknown',
    status: o.status as string,
    items: Array.isArray(o.items)
      ? (o.items as OrderItemRow[]).map((i) => `${i.product_name ?? i.product_id} x${i.quantity}`).join('; ')
      : '',
    total: (((o.total_cents as number) ?? 0) / 100).toFixed(2),
    tracking: (o.tracking_number as string) ?? '',
    address: o.shipping_address
      ? `${o.shipping_address}, ${(o.shipping_city as string) ?? ''} ${(o.shipping_state as string) ?? ''} ${(o.shipping_postcode as string) ?? ''}`
      : '',
  }))

  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => `"${String((r as Record<string, unknown>)[h] ?? '').replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
