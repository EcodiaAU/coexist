import { describe, it, expect, beforeEach } from 'vitest'
import { formatCsvAddress } from '@/hooks/use-admin-merch'
import { useCart } from '@/hooks/use-cart'
import type { Product, ProductVariant, PromoCode } from '@/types/merch'

/* ------------------------------------------------------------------ */
/*  #22 - CSV address builder (JSONB shape + flat fallback)            */
/* ------------------------------------------------------------------ */

describe('formatCsvAddress (#22 - no more "[object Object]")', () => {
  it('builds a readable line from the JSONB shipping_address', () => {
    const row = {
      shipping_address: {
        full_name: 'Jane Doe',
        line1: '12 Smith St',
        line2: 'Unit 3',
        city: 'Brisbane',
        state: 'QLD',
        postcode: '4000',
        phone: '0400000000',
      },
    }
    expect(formatCsvAddress(row)).toBe('12 Smith St, Unit 3, Brisbane QLD 4000')
  })

  it('omits an empty line2', () => {
    const row = {
      shipping_address: { line1: '5 Oak Rd', city: 'Cairns', state: 'QLD', postcode: '4870' },
    }
    expect(formatCsvAddress(row)).toBe('5 Oak Rd, Cairns QLD 4870')
  })

  it('falls back to the flat shipping_* columns when JSON address is null', () => {
    const row = {
      shipping_address: null,
      shipping_city: 'Perth',
      shipping_state: 'WA',
      shipping_postcode: '6000',
    }
    expect(formatCsvAddress(row)).toBe('Perth WA 6000')
  })

  it('returns an empty string (never "[object Object]") when there is no address', () => {
    expect(formatCsvAddress({ shipping_address: null })).toBe('')
    // The old bug: interpolating the object rendered "[object Object]".
    expect(formatCsvAddress({ shipping_address: { line1: 'X' } })).not.toContain('[object Object]')
  })
})

/* ------------------------------------------------------------------ */
/*  #5 / #14 / #16 - cart money math against a loaded shipping_config  */
/* ------------------------------------------------------------------ */

function makeProduct(): Product {
  return {
    id: 'prod-1', name: 'Tee', slug: 'tee', description: '', images: [], category: 'clothing',
    status: 'active', base_price_cents: 5000, variants: [], created_at: '', updated_at: '',
  }
}
function makeVariant(price_cents: number, id = 'var-1'): ProductVariant {
  return { id, product_id: 'prod-1', size: 'M', colour: 'Green', sku: 'TEE-M-GREEN', price_cents, stock: 10, low_stock_threshold: 5, is_active: true }
}
function makePromo(p: Partial<PromoCode>): PromoCode {
  return { id: 'promo-1', code: 'X', type: 'flat', value: 0, min_order_amount: null, max_uses: null, uses_count: 0, valid_from: null, valid_to: null, is_active: true, created_at: '', ...p }
}

describe('cart money math with live shipping_config (#5 / #14 / #16)', () => {
  beforeEach(() => {
    const s = useCart.getState()
    s.clear()
    // Mirror the live admin config: $9.95 flat, free over $75.
    s.setShippingConfig({ flat_rate_cents: 995, free_shipping_threshold_cents: 7500 })
  })

  it('charges flat shipping below the configured threshold and frees it above (#5)', () => {
    const p = makeProduct()
    useCart.getState().addItem(p, makeVariant(5000), 1) // $50 subtotal
    expect(useCart.getState().subtotalCents()).toBe(5000)
    expect(useCart.getState().shippingCents()).toBe(995)      // below $75 -> flat
    expect(useCart.getState().totalCents()).toBe(5995)

    useCart.getState().addItem(p, makeVariant(3000, 'var-2'), 1) // now $80 subtotal
    expect(useCart.getState().subtotalCents()).toBe(8000)
    expect(useCart.getState().shippingCents()).toBe(0)         // >= $75 -> free
    expect(useCart.getState().totalCents()).toBe(8000)
  })

  it('treats a flat promo value as DOLLARS, not cents (#14)', () => {
    const p = makeProduct()
    useCart.getState().addItem(p, makeVariant(5000), 1)        // $50
    useCart.getState().setPromoCode(makePromo({ type: 'flat', value: 10 })) // $10 off
    expect(useCart.getState().discountCents()).toBe(1000)      // $10.00, not $0.10
  })

  it('applies a percentage promo as a percent of subtotal (#16)', () => {
    const p = makeProduct()
    useCart.getState().addItem(p, makeVariant(5000), 1)        // $50
    useCart.getState().setPromoCode(makePromo({ type: 'percentage', value: 10 }))
    expect(useCart.getState().discountCents()).toBe(500)       // 10% of $50
  })

  it('zeroes shipping for a free_shipping promo even below threshold', () => {
    const p = makeProduct()
    useCart.getState().addItem(p, makeVariant(2000), 1)        // $20, below $75
    useCart.getState().setPromoCode(makePromo({ type: 'free_shipping', value: 0 }))
    expect(useCart.getState().shippingCents()).toBe(0)
  })

  it('does not apply a promo below its minimum order amount', () => {
    const p = makeProduct()
    useCart.getState().addItem(p, makeVariant(2000), 1)        // $20 subtotal
    useCart.getState().setPromoCode(makePromo({ type: 'flat', value: 10, min_order_amount: 100 })) // needs $100
    expect(useCart.getState().discountCents()).toBe(0)
  })
})
