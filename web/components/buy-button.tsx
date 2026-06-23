'use client'

import { useMemo, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import type { ProductVariant } from '@/lib/queries'

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'ONE SIZE']
function sizeRank(s: string) {
  const i = SIZE_ORDER.indexOf(s.trim().toUpperCase())
  return i === -1 ? 999 : i
}
function uniq(values: (string | undefined)[]) {
  return [...new Set(values.filter((v): v is string => !!v))]
}

const chip = (selected: boolean) =>
  `rounded-none border px-4 py-2 text-xs font-normal uppercase tracking-[0.18em] transition-colors ${
    selected
      ? 'border-olive-700 bg-olive-700 text-white'
      : 'border-neutral-300 text-neutral-700 hover:border-olive-700 hover:text-olive-700'
  }`

export function BuyButton({
  productId,
  variants,
}: {
  productId: string
  variants: ProductVariant[]
}) {
  const active = useMemo(() => variants.filter((v) => v.is_active !== false), [variants])

  // Apparel variants carry size/colour axes; simple variants only a label.
  const sizes = useMemo(
    () => uniq(active.map((v) => v.size)).sort((a, b) => sizeRank(a) - sizeRank(b)),
    [active],
  )
  const colours = useMemo(() => uniq(active.map((v) => v.colour)), [active])
  const hasAxes = sizes.length > 0 || colours.length > 0

  // Open on an in-stock combo where one exists, so a part-sold-out product
  // (e.g. one tee size left) does not land on "Sold out".
  const initial = useMemo(
    () => active.find((v) => v.stock == null || v.stock > 0) ?? active[0],
    [active],
  )
  const [size, setSize] = useState<string | undefined>(initial?.size ?? sizes[0])
  const [colour, setColour] = useState<string | undefined>(initial?.colour ?? colours[0])
  const [variantId, setVariantId] = useState<string | undefined>(initial?.id)
  const [qty, setQty] = useState(1)
  const [state, setState] = useState<'idle' | 'submitting' | 'error'>('idle')

  // Which concrete variant the current selection resolves to.
  const selected = useMemo(() => {
    if (!hasAxes) return active.find((v) => v.id === variantId)
    return active.find(
      (v) =>
        (sizes.length === 0 || v.size === size) && (colours.length === 0 || v.colour === colour),
    )
  }, [hasAxes, active, variantId, sizes.length, colours.length, size, colour])

  const soldOut = selected != null && selected.stock === 0

  async function buy() {
    const chosen = selected
    if (active.length > 0 && !chosen) {
      setState('error')
      return
    }
    setState('submitting')
    try {
      const supabase = getBrowserSupabase()
      const { data, error } = await supabase.functions.invoke('public-checkout', {
        body: {
          type: 'merch',
          items: [
            {
              product_id: productId,
              variant_id: chosen?.id,
              variant_label: chosen?.label,
              quantity: qty,
            },
          ],
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
      {hasAxes ? (
        <div className="mt-6 space-y-5">
          {colours.length > 0 && (
            <div>
              <p className="label text-neutral-400">
                Colour{colour ? <span className="ml-2 text-neutral-600">{colour}</span> : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {colours.map((c) => (
                  <button key={c} type="button" onClick={() => setColour(c)} className={chip(colour === c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sizes.length > 0 && (
            <div>
              <p className="label text-neutral-400">
                Size{size ? <span className="ml-2 text-neutral-600">{size}</span> : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button key={s} type="button" onClick={() => setSize(s)} className={chip(size === s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        active.length > 0 && (
          <div className="mt-6">
            <p className="label text-neutral-400">Option</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {active.map((v) => (
                <button key={v.id} type="button" onClick={() => setVariantId(v.id)} className={chip(variantId === v.id)}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )
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
          disabled={state === 'submitting' || soldOut}
          className="flex-1 rounded-none bg-olive-700 px-8 py-3.5 text-[13px] font-normal uppercase tracking-[0.18em] text-white transition-all duration-300 hover:bg-olive-900 hover:tracking-[0.22em] disabled:opacity-60"
        >
          {soldOut ? 'Sold out' : state === 'submitting' ? 'Taking you to checkout...' : 'Buy now'}
        </button>
      </div>
      {state === 'error' && (
        <p className="mt-3 text-sm text-error-500">Could not start checkout. Please try again.</p>
      )}
      <p className="mt-3 text-xs text-neutral-400">Secure checkout by Stripe. No account needed.</p>
    </div>
  )
}
