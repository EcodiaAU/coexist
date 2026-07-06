/** Merch store types for Co-Exist */

/** Fixed set of product categories - used in admin dropdown + shop filter pills */
export const PRODUCT_CATEGORIES = [
  'clothing',
  'accessories',
  'stickers',
  'drinkware',
  'headwear',
] as const

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export type ProductStatus = 'active' | 'archived' | 'draft'
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
export type ReturnStatus = 'requested' | 'approved' | 'denied' | 'refunded'
export type PromoType = 'percentage' | 'flat' | 'free_shipping'

export interface ProductVariant {
  [key: string]: string | number | boolean | null
  id: string
  product_id: string
  size: string | null
  colour: string | null
  sku: string
  price_cents: number
  stock: number
  low_stock_threshold: number
  is_active: boolean
}

export interface Product {
  id: string
  name: string
  slug: string
  description: string
  images: string[]
  category: string | null
  status: ProductStatus
  base_price_cents: number
  variants: ProductVariant[]
  created_at: string
  updated_at: string
}

export interface CartItem {
  product: Product
  variant: ProductVariant
  quantity: number
}

export interface PromoCode {
  id: string
  code: string
  type: PromoType
  /** For percentage: the percent (e.g. 10 = 10%). For flat: dollar amount (e.g. 10 = $10). */
  value: number
  /** Minimum order in dollars (DB: min_order_amount numeric). Null = no minimum. */
  min_order_amount: number | null
  max_uses: number | null
  uses_count: number
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
  created_at: string
}

export interface ShippingAddress {
  id?: string
  full_name: string
  line1: string
  line2: string | null
  city: string
  state: string
  postcode: string
  country: string
  phone: string | null
}

export interface Order {
  id: string
  user_id: string
  status: OrderStatus
  items: OrderItem[]
  subtotal_cents: number
  shipping_cents: number
  discount_cents: number
  total_cents: number
  /** Legacy DB column - prefer total_cents */
  total?: number
  promo_code_id: string | null
  shipping_address: ShippingAddress
  tracking_number: string | null
  stripe_payment_intent_id: string | null
  created_at: string
  updated_at: string
  /** Client-side only - set optimistically when a return is requested */
  return_requested?: boolean
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  variant_id: string
  product_name: string
  variant_label: string
  price_cents: number
  quantity: number
  image_url: string | null
}

export interface ReturnRequest {
  id: string
  order_id: string
  user_id: string
  reason: string
  status: ReturnStatus
  admin_notes: string | null
  created_at: string
  updated_at: string
  order?: Order
  profiles?: {
    display_name: string | null
    avatar_url: string | null
  }
}

export interface SalesAnalytics {
  total_revenue_cents: number
  total_orders: number
  total_units_sold: number
  by_product: { product_id: string; product_name: string; revenue_cents: number; units: number }[]
  by_period: { date: string; revenue_cents: number; orders: number }[]
}

export interface ShippingConfig {
  flat_rate_cents: number
  free_shipping_threshold_cents: number | null
}

/** Format cents to AUD display string. Non-finite input (a price that could
 *  not be resolved) renders as '--', never '$NaN'. */
export function formatPrice(cents: number): string {
  if (!Number.isFinite(cents)) return '--'
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Resolve the effective unit price for a variant, falling back to the
 * product's base_price_cents. Legacy variant rows (the {key,label} shape
 * still present on prod) have no price_cents, which used to propagate NaN
 * into cart subtotals and an enabled "Pay $NaN" button (QA P2-3).
 * Returns null when no finite price can be resolved - callers must treat
 * null as "cannot price" (disable the CTA), never render it.
 */
export function resolvePriceCents(
  variant: { price_cents?: unknown } | null | undefined,
  product?: { base_price_cents?: unknown } | null,
): number | null {
  const v = variant?.price_cents
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const b = product?.base_price_cents
  if (typeof b === 'number' && Number.isFinite(b)) return b
  return null
}

/** Build a human-readable variant label */
export function variantLabel(v: Pick<ProductVariant, 'size' | 'colour'>): string {
  return [v.size, v.colour].filter(Boolean).join(' / ') || 'Default'
}
