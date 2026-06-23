'use client'

import { useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import type { ProductVariant } from '@/lib/queries'

export function BuyButton({
  productId,
  variants,
}: {
  productId: string
  variants: ProductVariant[]
}) {
  const active = variants.filter((v) => v.is_active !== false)
  const [variantId, setVariantId] = useState<string | undefined>(active[0]?.id)
  const [qty, setQty] = useState(1)
  const [state, setState] = useState<'idle' | 'submitting' | 'error'>('idle')

  async function buy() {
    if (active.length > 0 && !variantId) {
      setState('error')
      return
    }
    setState('submitting')
    try {
      const supabase = getBrowserSupabase()
      const variant = active.find((v) => v.id === variantId)
      const { data, error } = await supabase.functions.invoke('public-checkout', {
        body: {
          type: 'merch',
          items: [{ product_id: productId, variant_id: variantId, variant_label: variant?.label, quantity: qty }],
        },
      })
      if (error || !data?.url) throw new Error('no url')
      window.location.href = data.url as string
    } catch {
      setState('error')
    }
  }

  return (
    <div>
      {active.length > 0 && (
        <div className="mt-6">
          <p className="label text-neutral-400">Size / option</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {active.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={`rounded-none border px-4 py-2 text-xs font-normal uppercase tracking-[0.18em] transition-colors ${
                  variantId === v.id
                    ? 'border-olive-700 bg-olive-700 text-white'
                    : 'border-neutral-300 text-neutral-700 hover:border-olive-700 hover:text-olive-700'
                }`}
              >
                {v.label ?? 'Option'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <div className="flex items-center rounded-none border border-neutral-300">
          <button type="button" aria-label="Decrease" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-4 py-2.5 text-base text-neutral-600 hover:bg-neutral-100 transition-colors">-</button>
          <span className="w-8 text-center text-sm font-normal">{qty}</span>
          <button type="button" aria-label="Increase" onClick={() => setQty((q) => Math.min(20, q + 1))} className="px-4 py-2.5 text-base text-neutral-600 hover:bg-neutral-100 transition-colors">+</button>
        </div>
        <button
          type="button"
          onClick={buy}
          disabled={state === 'submitting'}
          className="flex-1 rounded-none bg-olive-700 px-8 py-3.5 text-[13px] font-normal uppercase tracking-[0.18em] text-white transition-all duration-300 hover:bg-olive-900 hover:tracking-[0.22em] disabled:opacity-60"
        >
          {state === 'submitting' ? 'Taking you to checkout...' : 'Buy now'}
        </button>
      </div>
      {state === 'error' && (
        <p className="mt-3 text-sm text-error-500">Could not start checkout. Please try again.</p>
      )}
      <p className="mt-3 text-xs text-neutral-400">Secure checkout by Stripe. No account needed.</p>
    </div>
  )
}
