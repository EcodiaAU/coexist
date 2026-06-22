/**
 * public-checkout - Supabase Edge Function (NO AUTH)
 *
 * Anonymous Stripe Checkout for the public marketing site (coexistaus.org).
 * Lets a visitor donate OR buy merch WITHOUT signing in (the app's
 * create-checkout requires a user JWT). Server-verifies merch prices from the
 * DB so the client can't tamper. Donations + merch orders are recorded by the
 * existing stripe-webhook on checkout.session.completed (which handles an empty
 * user_id for anonymous flows).
 *
 * Deploy: npx supabase functions deploy public-checkout \
 *           --project-ref tjutlbzekfouwsiaplbr --no-verify-jwt
 *
 * Returns: { url: string }  (Stripe Checkout URL to redirect to)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const body = await req.json()
    const origin = req.headers.get('origin') ?? 'https://coexistaus.org'

    /* ---------- Anonymous donation ---------- */
    if (body.type === 'donation') {
      const amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount < 1 || amount > 50000) {
        return json({ error: 'Amount must be between $1 and $50,000' }, 400)
      }
      const frequency = body.frequency === 'monthly' ? 'monthly' : 'one_time'
      const donorEmail = typeof body.donor_email === 'string' ? body.donor_email.trim().toLowerCase() : ''
      if (donorEmail && (!EMAIL_RE.test(donorEmail) || donorEmail.length > 254)) return json({ error: 'Invalid email' }, 400)
      const donorName = typeof body.donor_name === 'string' ? body.donor_name.trim().slice(0, 120) : ''
      const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : ''
      const metadata: Record<string, string> = {
        type: 'donation', frequency, user_id: '', donor_email: donorEmail, donor_name: donorName,
        message, is_public: String(body.is_public !== false), source: 'public_site',
      }

      if (frequency === 'monthly') {
        const existing = await stripe.products.search({ query: "metadata['type']:'recurring_donation'", limit: 1 })
        const productId = existing.data[0]?.id ??
          (await stripe.products.create({ name: 'Co-Exist Monthly Donation', metadata: { type: 'recurring_donation' } })).id
        const price = await stripe.prices.create({ product: productId, unit_amount: Math.round(amount * 100), currency: 'aud', recurring: { interval: 'month' } })
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription', customer_email: donorEmail || undefined, line_items: [{ price: price.id, quantity: 1 }],
          success_url: `${origin}/donate/thank-you?amount=${amount}&recurring=true`, cancel_url: `${origin}/donate`,
          metadata, subscription_data: { metadata },
        })
        return json({ url: session.url })
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', customer_email: donorEmail || undefined,
        line_items: [{ price_data: { currency: 'aud', product_data: { name: 'Co-Exist Donation' }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
        success_url: `${origin}/donate/thank-you?amount=${amount}`, cancel_url: `${origin}/donate`, metadata,
      })
      return json({ url: session.url })
    }

    /* ---------- Anonymous merch order ---------- */
    if (body.type === 'merch') {
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
        return json({ error: 'Cart must have 1-30 items' }, 400)
      }
      const ids = [...new Set(body.items.map((i: { product_id: string }) => i.product_id))]
      const { data: products } = await supabase
        .from('merch_products')
        .select('id, name, price, base_price_cents, images, variants, is_active')
        .in('id', ids)
        .eq('is_active', true)

      interface Variant { id: string; label?: string; price_cents?: number; is_active?: boolean }
      interface Prod { id: string; name: string; base_price_cents: number | null; price: number | null; images: string[] | null; variants: Variant[] | null }
      const map = new Map<string, Prod>()
      for (const p of (products ?? []) as Prod[]) map.set(p.id, p)

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
      let totalCents = 0
      for (const it of body.items as Array<{ product_id: string; variant_id?: string; variant_label?: string; quantity: number }>) {
        const p = map.get(it.product_id)
        if (!p) return json({ error: `Product unavailable` }, 400)
        const qty = Math.max(1, Math.min(20, Number(it.quantity) || 1))
        const variant = (p.variants ?? []).find((v) => v.id === it.variant_id)
        const unit = variant?.price_cents ?? p.base_price_cents ?? Math.round((p.price ?? 0) * 100)
        const label = it.variant_label || variant?.label
        totalCents += unit * qty
        lineItems.push({
          price_data: {
            currency: 'aud',
            product_data: { name: label ? `${p.name} (${label})` : p.name, images: (p.images ?? []).slice(0, 1) },
            unit_amount: unit,
          },
          quantity: qty,
        })
      }

      const { data: order, error: orderErr } = await supabase
        .from('merch_orders')
        .insert({ user_id: null, status: 'pending', items: body.items, total_cents: totalCents, total: totalCents / 100 })
        .select('id')
        .single()
      if (orderErr || !order) return json({ error: 'Could not create order' }, 500)

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        shipping_address_collection: { allowed_countries: ['AU'] },
        phone_number_collection: { enabled: true },
        success_url: `${origin}/shop/thank-you?order=${order.id}`,
        cancel_url: `${origin}/shop`,
        metadata: { type: 'merch', order_id: order.id, user_id: '', source: 'public_site' },
      })
      return json({ url: session.url })
    }

    return json({ error: 'Unsupported type' }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
