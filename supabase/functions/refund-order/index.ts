/**
 * refund-order - Supabase Edge Function
 *
 * Admin-gated Stripe refund for a merch order. Issuing a real refund is what
 * makes the whole refund flow correct: it fires the `charge.refunded` webhook,
 * which is the SINGLE owner of status='refunded' + inventory restore + the
 * buyer refund email. The admin UI previously only flipped merch_orders.status
 * to 'refunded' with no Stripe call, so the customer stayed charged and stock
 * was never restored (backlog #15).
 *
 * This function does NOT touch the order row or inventory itself - it only
 * creates the Stripe refund and lets the webhook reconcile, so stock is never
 * double-restored.
 *
 * Body: { order_id: string }
 * Returns: { success: true, refund_id, amount_refunded_cents } | { error }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { withSentry } from '../_shared/sentry.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
})

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(withSentry('refund-order', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // ---- Authenticate the caller ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization' }, 401)
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const gotruRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseServiceKey },
    })
    if (!gotruRes.ok) {
      return json({ error: 'Invalid or expired token' }, 401)
    }
    const caller = await gotruRes.json() as { id: string }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()
    if (!callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'Admin access required' }, 403)
    }

    // ---- Parse + validate ----
    const { order_id } = await req.json()
    if (!order_id || typeof order_id !== 'string' || !UUID_RE.test(order_id)) {
      return json({ error: 'Valid order_id is required' }, 400)
    }

    const { data: order, error: orderErr } = await supabase
      .from('merch_orders')
      .select('id, status, stripe_payment_id, total_cents')
      .eq('id', order_id)
      .single()
    if (orderErr || !order) {
      return json({ error: 'Order not found' }, 404)
    }

    if (order.status === 'refunded') {
      // Idempotent: already refunded (or the webhook already reconciled).
      return json({ success: true, refund_id: '', amount_refunded_cents: 0, already_refunded: true })
    }
    if (!order.stripe_payment_id) {
      return json({ error: 'This order has no captured Stripe payment to refund.' }, 400)
    }

    // ---- Create the Stripe refund (full refund of the payment intent) ----
    // The charge.refunded webhook then sets status='refunded', restores stock,
    // and emails the buyer. We do not mutate the order here.
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_id,
    })

    return json({
      success: true,
      refund_id: refund.id,
      amount_refunded_cents: refund.amount ?? order.total_cents ?? 0,
    })
  } catch (err) {
    const message = (err as Error).message ?? 'Refund failed'
    // Surface Stripe's own error (e.g. already refunded, charge not found)
    return json({ error: message }, 400)
  }
}))
