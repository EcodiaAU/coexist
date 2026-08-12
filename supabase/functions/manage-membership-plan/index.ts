/**
 * manage-membership-plan - Supabase Edge Function
 *
 * In-app membership plan management. Admins create / update / delete plans in the
 * app and this function keeps Stripe in sync automatically - no one ever opens the
 * Stripe dashboard. Stripe prices are immutable, so an amount change creates a NEW
 * price and archives the old one; a delete archives the product + prices (Stripe
 * forbids hard-deleting a product that has prices) and removes the plan row.
 *
 * Actions (body.action): 'create' | 'update' | 'delete'.
 * Auth: caller must be an admin, or hold the manage_membership capability via
 * staff_roles (mirrors the membership_plans RLS).
 *
 * Returns: { plan } for create/update, { deleted: true } for delete.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { withSentry } from '../_shared/sentry.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(withSentry('manage-membership-plan', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const body = await req.json()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ---- Authenticate + authorise (admin OR manage_membership via staff_roles) ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing authorization' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const gotru = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    })
    if (!gotru.ok) return json({ error: 'Invalid or expired token' }, 401)
    const caller = await gotru.json() as { id: string }

    const { data: prof } = await supabase.from('profiles').select('role').eq('id', caller.id).single()
    let allowed = prof?.role === 'admin'
    if (!allowed) {
      const { data: sr } = await supabase
        .from('staff_roles')
        .select('permissions')
        .eq('user_id', caller.id)
        .maybeSingle()
      allowed = (sr?.permissions as Record<string, unknown> | null)?.manage_membership === true
    }
    if (!allowed) return json({ error: 'You do not have permission to manage membership plans' }, 403)

    const action = body.action
    const dollars = (v: unknown) => Math.max(0, Math.round(Number(v) * 100)) // -> cents
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

    /* ---- CREATE ---- */
    if (action === 'create') {
      const name = String(body.name ?? '').trim()
      if (!name) return json({ error: 'Name is required' }, 400)
      const priceMonthly = num(body.price_monthly)
      const priceYearly = num(body.price_yearly)

      const product = await stripe.products.create({
        name,
        description: body.description ? String(body.description) : undefined,
        metadata: { type: 'membership_plan' },
      })
      const [monthly, yearly] = await Promise.all([
        stripe.prices.create({ product: product.id, unit_amount: dollars(priceMonthly), currency: 'aud', recurring: { interval: 'month' } }),
        stripe.prices.create({ product: product.id, unit_amount: dollars(priceYearly), currency: 'aud', recurring: { interval: 'year' } }),
      ])

      const { data: plan, error } = await supabase
        .from('membership_plans')
        .insert({
          name,
          description: body.description ? String(body.description) : null,
          price_monthly: priceMonthly,
          price_yearly: priceYearly,
          stripe_product_id: product.id,
          stripe_price_monthly: monthly.id,
          stripe_price_yearly: yearly.id,
          is_active: body.is_active !== false,
          sort_order: num(body.sort_order),
        })
        .select()
        .single()
      if (error) throw error
      return json({ plan })
    }

    /* ---- UPDATE ---- */
    if (action === 'update') {
      const id = String(body.id ?? '')
      if (!id) return json({ error: 'Plan id is required' }, 400)
      const { data: existing, error: exErr } = await supabase
        .from('membership_plans').select('*').eq('id', id).single()
      if (exErr || !existing) return json({ error: 'Plan not found' }, 404)

      const name = body.name !== undefined ? String(body.name).trim() : existing.name
      const description = body.description !== undefined ? (String(body.description) || null) : existing.description
      const priceMonthly = body.price_monthly !== undefined ? num(body.price_monthly) : Number(existing.price_monthly)
      const priceYearly = body.price_yearly !== undefined ? num(body.price_yearly) : Number(existing.price_yearly)
      const isActive = body.is_active !== undefined ? !!body.is_active : existing.is_active

      // Ensure a Stripe product exists (self-heal a plan seeded without one).
      let productId = existing.stripe_product_id as string | null
      if (!productId) {
        const product = await stripe.products.create({ name, description: description ?? undefined, metadata: { type: 'membership_plan' } })
        productId = product.id
      } else {
        await stripe.products.update(productId, { name, description: description ?? undefined, active: isActive })
      }

      // Prices are immutable: on an amount change, mint a new price and archive the old.
      const patch: Record<string, unknown> = { name, description, price_monthly: priceMonthly, price_yearly: priceYearly, is_active: isActive, stripe_product_id: productId }

      if (!existing.stripe_price_monthly || Number(existing.price_monthly) !== priceMonthly) {
        const p = await stripe.prices.create({ product: productId, unit_amount: dollars(priceMonthly), currency: 'aud', recurring: { interval: 'month' } })
        if (existing.stripe_price_monthly) await stripe.prices.update(existing.stripe_price_monthly, { active: false }).catch(() => {})
        patch.stripe_price_monthly = p.id
      }
      if (!existing.stripe_price_yearly || Number(existing.price_yearly) !== priceYearly) {
        const p = await stripe.prices.create({ product: productId, unit_amount: dollars(priceYearly), currency: 'aud', recurring: { interval: 'year' } })
        if (existing.stripe_price_yearly) await stripe.prices.update(existing.stripe_price_yearly, { active: false }).catch(() => {})
        patch.stripe_price_yearly = p.id
      }

      const { data: plan, error } = await supabase.from('membership_plans').update(patch).eq('id', id).select().single()
      if (error) throw error
      return json({ plan })
    }

    /* ---- DELETE ---- */
    if (action === 'delete') {
      const id = String(body.id ?? '')
      if (!id) return json({ error: 'Plan id is required' }, 400)
      const { data: existing } = await supabase.from('membership_plans').select('*').eq('id', id).single()
      if (existing) {
        // Archive Stripe (products with prices cannot be hard-deleted).
        for (const priceId of [existing.stripe_price_monthly, existing.stripe_price_yearly]) {
          if (priceId) await stripe.prices.update(priceId, { active: false }).catch(() => {})
        }
        if (existing.stripe_product_id) await stripe.products.update(existing.stripe_product_id, { active: false }).catch(() => {})
      }
      const { error } = await supabase.from('membership_plans').delete().eq('id', id)
      if (error) throw error
      return json({ deleted: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
}))
