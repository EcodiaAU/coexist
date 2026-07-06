import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolvePriceCents } from '@/types/merch'
import type { CartItem, Product, ProductVariant, PromoCode, ShippingConfig } from '@/types/merch'

/* ------------------------------------------------------------------ */
/*  Shipping defaults                                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_SHIPPING: ShippingConfig = {
  flat_rate_cents: 995,
  free_shipping_threshold_cents: 10000,
}

/* ------------------------------------------------------------------ */
/*  Member discount type                                               */
/* ------------------------------------------------------------------ */

export interface MemberDiscount {
  title: string
  discount_percent: number
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface CartState {
  items: CartItem[]
  promoCode: PromoCode | null
  memberDiscount: MemberDiscount | null
  shippingConfig: ShippingConfig

  // Actions
  addItem: (product: Product, variant: ProductVariant, quantity?: number) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
  setPromoCode: (promo: PromoCode | null) => void
  setMemberDiscount: (discount: MemberDiscount | null) => void
  setShippingConfig: (config: ShippingConfig) => void
  clear: () => void

  // Computed
  itemCount: () => number
  /** Effective unit price for a line (variant price_cents with
   *  base_price_cents fallback), or null when it cannot be resolved. */
  linePriceCents: (item: CartItem) => number | null
  /** True when any line in the cart has no resolvable price. Checkout CTAs
   *  must disable while this is true (QA P2-3: legacy variants -> $NaN). */
  hasUnpricedItems: () => boolean
  subtotalCents: () => number
  memberDiscountCents: () => number
  discountCents: () => number
  shippingCents: () => number
  totalCents: () => number
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      promoCode: null,
      memberDiscount: null,
      shippingConfig: DEFAULT_SHIPPING,

      addItem: (product, variant, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((i) => i.variant.id === variant.id)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.variant.id === variant.id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            }
          }
          return { items: [...state.items, { product, variant, quantity }] }
        })
      },

      removeItem: (variantId) => {
        set((state) => ({
          items: state.items.filter((i) => i.variant.id !== variantId),
        }))
      },

      updateQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(variantId)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.variant.id === variantId ? { ...i, quantity } : i,
          ),
        }))
      },

      setPromoCode: (promo) => set({ promoCode: promo }),
      setMemberDiscount: (discount) => set({ memberDiscount: discount }),
      setShippingConfig: (config) => set({ shippingConfig: config }),
      clear: () => set({ items: [], promoCode: null, memberDiscount: null }),

      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      linePriceCents: (item) => resolvePriceCents(item.variant, item.product),

      hasUnpricedItems: () =>
        get().items.some((i) => resolvePriceCents(i.variant, i.product) === null),

      // Unpriced lines contribute 0 here (never NaN); hasUnpricedItems()
      // gates the checkout CTAs so a 0-priced legacy line can't be bought.
      subtotalCents: () =>
        get().items.reduce(
          (sum, i) => sum + (resolvePriceCents(i.variant, i.product) ?? 0) * i.quantity,
          0,
        ),

      memberDiscountCents: () => {
        const md = get().memberDiscount
        if (!md || !md.discount_percent) return 0
        const subtotal = get().subtotalCents()
        return Math.round(subtotal * (md.discount_percent / 100))
      },

      discountCents: () => {
        const promo = get().promoCode
        if (!promo) return 0
        // Promo applies after member discount
        const subtotal = get().subtotalCents() - get().memberDiscountCents()
        // min_order_amount is in dollars (DB numeric), convert to cents for comparison
        if (promo.min_order_amount && subtotal < Math.round(promo.min_order_amount * 100)) return 0
        switch (promo.type) {
          case 'percentage':
            return Math.round(subtotal * (promo.value / 100))
          case 'flat':
            // value is in dollars (DB numeric), convert to cents
            return Math.min(Math.round(promo.value * 100), subtotal)
          case 'free_shipping':
            return 0
          default:
            return 0
        }
      },

      shippingCents: () => {
        const { shippingConfig, promoCode } = get()
        if (promoCode?.type === 'free_shipping') return 0
        // Free-shipping threshold applies to the amount after discounts
        const afterDiscounts = get().subtotalCents() - get().memberDiscountCents() - get().discountCents()
        if (
          shippingConfig.free_shipping_threshold_cents &&
          afterDiscounts >= shippingConfig.free_shipping_threshold_cents
        )
          return 0
        return shippingConfig.flat_rate_cents
      },

      totalCents: () => {
        const subtotal = get().subtotalCents()
        const memberDisc = get().memberDiscountCents()
        const promoDisc = get().discountCents()
        const shipping = get().shippingCents()
        return Math.max(0, subtotal - memberDisc - promoDisc + shipping)
      },
    }),
    {
      name: 'coexist-cart',
      partialize: (state) => ({
        items: state.items,
        promoCode: state.promoCode,
      }),
    },
  ),
)
