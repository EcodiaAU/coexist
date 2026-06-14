/**
 * create-checkout - Supabase Edge Function
 *
 * Creates Stripe Checkout sessions for:
 * - One-time donations
 * - Recurring donations (Stripe Subscriptions)
 * - Merch purchases (with promo code support)
 * - Event ticket purchases (with atomic capacity management)
 * - Subscription cancellation
 *
 * Returns: `{ session_id: string, url: string }` for checkout types,
 *          `{ success: true }` for cancel.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY_TEST')!, {
  apiVersion: '2024-04-10',
})

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const origin = req.headers.get('origin') ?? 'https://coexistaus.org'

    // ---- Authenticate the caller ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')

    // Verify user JWT by calling GoTrue directly.
    const gotruRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseServiceKey,
      },
    })
    if (!gotruRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const caller = await gotruRes.json() as { id: string; email?: string }
    // Enforce that the caller can only act on their own behalf
    if (body.user_id && body.user_id !== caller.id) {
      return new Response(JSON.stringify({ error: 'user_id does not match authenticated user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // Default user_id to the authenticated caller
    if (!body.user_id) {
      body.user_id = caller.id
    }

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    // ---- Input validation helpers ----
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    function validateUuid(val: unknown, field: string): string | null {
      if (typeof val !== 'string' || !UUID_RE.test(val)) return `Invalid ${field}`
      return null
    }

    function validateAmount(val: unknown): string | null {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 1 || val > 50000) {
        return 'Amount must be between $1 and $50,000'
      }
      return null
    }

    function validateString(val: unknown, field: string, maxLen = 500): string | null {
      if (val === undefined || val === null || val === '') return null
      if (typeof val !== 'string') return `${field} must be a string`
      if (val.length > maxLen) return `${field} must be under ${maxLen} characters`
      return null
    }

    // ---- Validate required fields ----
    if (!body.type || typeof body.type !== 'string') {
      return json({ error: 'Missing or invalid type' }, 400)
    }

    if (body.user_id) {
      const err = validateUuid(body.user_id, 'user_id')
      if (err) return json({ error: err }, 400)
    }

    // Look up user email for Stripe customer_email
    async function getUserEmail(userId: string): Promise<string | undefined> {
      const { data } = await supabase.auth.admin.getUserById(userId)
      return data?.user?.email
    }

    switch (body.type) {
      /* ---- One-time donation ---- */
      case 'donation': {
        // Validate donation-specific fields
        const amountErr = validateAmount(body.amount)
        if (amountErr) return json({ error: amountErr }, 400)
        const msgErr = validateString(body.message, 'message', 500)
        if (msgErr) return json({ error: msgErr }, 400)
        const behalfErr = validateString(body.on_behalf_of, 'on_behalf_of', 200)
        if (behalfErr) return json({ error: behalfErr }, 400)
        if (body.frequency && !['one_time', 'monthly'].includes(body.frequency)) {
          return json({ error: 'Invalid frequency' }, 400)
        }
        const customerEmail = await getUserEmail(body.user_id)

        if (body.frequency === 'monthly') {
          // Recurring: reuse a single donation product, create price per amount
          const existingProducts = await stripe.products.search({
            query: "metadata['type']:'recurring_donation'",
            limit: 1,
          })
          let productId: string
          if (existingProducts.data.length > 0) {
            productId = existingProducts.data[0].id
          } else {
            const product = await stripe.products.create({
              name: 'Co-Exist Monthly Donation',
              metadata: { type: 'recurring_donation' },
            })
            productId = product.id
          }

          const price = await stripe.prices.create({
            product: productId,
            unit_amount: Math.round(body.amount * 100),
            currency: 'aud',
            recurring: { interval: 'month' },
          })

          const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer_email: customerEmail,
            line_items: [{ price: price.id, quantity: 1 }],
            success_url: `${origin}/donate/thank-you?amount=${body.amount}&recurring=true`,
            cancel_url: `${origin}/donate`,
            metadata: {
              type: 'donation',
              frequency: 'monthly',
              user_id: body.user_id,
              project_id: body.project_id ?? '',
              message: body.message ?? '',
              on_behalf_of: body.on_behalf_of ?? '',
              is_public: String(body.is_public ?? true),
            },
            subscription_data: {
              metadata: {
                user_id: body.user_id,
                project_id: body.project_id ?? '',
              },
            },
          })

          return json({ session_id: session.id, url: session.url })
        }

        // One-time donation
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: customerEmail,
          line_items: [
            {
              price_data: {
                currency: 'aud',
                product_data: {
                  name: body.project_id
                    ? 'Co-Exist Donation - Project'
                    : 'Co-Exist Donation',
                },
                unit_amount: Math.round(body.amount * 100),
              },
              quantity: 1,
            },
          ],
          success_url: `${origin}/donate/thank-you?amount=${body.amount}`,
          cancel_url: `${origin}/donate`,
          metadata: {
            type: 'donation',
            frequency: 'one_time',
            user_id: body.user_id,
            project_id: body.project_id ?? '',
            message: body.message ?? '',
            on_behalf_of: body.on_behalf_of ?? '',
            is_public: String(body.is_public ?? true),
          },
        })

        return json({ session_id: session.id, url: session.url })
      }

      /* ---- Merch checkout ---- */
      case 'merch': {
        // Validate merch-specific fields
        if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
          return json({ error: 'Items must be an array with 1-50 items' }, 400)
        }
        for (const item of body.items) {
          if (typeof item.quantity !== 'number' || item.quantity < 1 || item.quantity > 100) {
            return json({ error: 'Item quantity must be between 1 and 100' }, 400)
          }
          if (typeof item.price_cents !== 'number' || item.price_cents < 0 || item.price_cents > 1000000) {
            return json({ error: 'Invalid item price' }, 400)
          }
          const nameErr = validateString(item.product_name, 'product_name', 200)
          if (nameErr) return json({ error: nameErr }, 400)
        }
        if (body.promo_code_id) {
          const promoErr = validateUuid(body.promo_code_id, 'promo_code_id')
          if (promoErr) return json({ error: promoErr }, 400)
        }

        const customerEmail = await getUserEmail(body.user_id)

        // Verify prices server-side to prevent price manipulation
        const productIds = [...new Set(body.items.map((i: { product_id: string }) => i.product_id))]
        const { data: dbProducts } = await supabase
          .from('merch_products')
          .select('id, name, base_price_cents, price, images, variants')
          .in('id', productIds)
          .eq('is_active', true)

        interface DbVariant { id: string; price_cents: number; is_active: boolean }
        const productMap = new Map<string, { name: string; base_price_cents: number; price: number; images: string[]; variants: DbVariant[] }>()
        for (const p of dbProducts ?? []) {
          productMap.set(p.id, {
            name: p.name,
            base_price_cents: p.base_price_cents ?? Math.round((p.price ?? 0) * 100),
            price: p.price,
            images: p.images ?? [],
            variants: Array.isArray(p.variants) ? p.variants as DbVariant[] : [],
          })
        }

        // Build Stripe line items using server-verified variant prices
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
        let serverTotalCents = 0
        for (const item of body.items as Array<{ product_id: string; variant_id: string; quantity: number; price_cents: number; variant_label?: string }>) {
          const product = productMap.get(item.product_id)
          if (!product) {
            return json({ error: `Product ${item.product_id} not found or inactive` }, 400)
          }
          // Look up the specific variant's price_cents from the server-side JSONB
          const dbVariant = product.variants.find((v) => v.id === item.variant_id)
          const unitPriceCents = dbVariant?.price_cents ?? product.base_price_cents
          if (dbVariant && !dbVariant.is_active) {
            return json({ error: `Variant ${item.variant_id} is no longer available` }, 400)
          }
          const variantLabel = item.variant_label ?? item.variant_id ?? 'Standard'
          serverTotalCents += unitPriceCents * item.quantity
          lineItems.push({
            price_data: {
              currency: 'aud',
              product_data: {
                name: `${product.name} (${variantLabel})`,
                images: product.images.length > 0 ? [product.images[0]] : [],
              },
              unit_amount: unitPriceCents,
            },
            quantity: item.quantity,
          })
        }

        // Add shipping as a line item (validate it's a positive integer)
        const shippingCents = typeof body.shipping_cents === 'number' && body.shipping_cents > 0
          ? Math.round(body.shipping_cents)
          : 0
        if (shippingCents > 0) {
          lineItems.push({
            price_data: {
              currency: 'aud',
              product_data: { name: 'Shipping' },
              unit_amount: shippingCents,
            },
            quantity: 1,
          })
          serverTotalCents += shippingCents
        }

        // Compute server-side discount cents (applied after line items are built)
        // Note: the actual Stripe coupon handles the discount in Stripe's total,
        // but we need to record accurate cents in our DB for order display.
        const serverSubtotalCents = serverTotalCents - shippingCents
        const discountCents = typeof body.discount_cents === 'number' ? Math.max(0, Math.round(body.discount_cents)) : 0
        const memberDiscountCents = typeof body.member_discount_cents === 'number' ? Math.max(0, Math.round(body.member_discount_cents)) : 0
        const dbTotalCents = Math.max(0, serverSubtotalCents - memberDiscountCents - discountCents + shippingCents)

        // Insert pending order into DB
        const { data: order, error: orderError } = await supabase
          .from('merch_orders')
          .insert({
            user_id: body.user_id,
            status: 'pending',
            items: body.items,
            total_cents: dbTotalCents,
            total: dbTotalCents / 100,
            shipping_address: body.shipping_address,
          })
          .select()
          .single()

        if (orderError || !order) {
          return json({ error: 'Failed to create order' }, 500)
        }

        // Build checkout session params
        const sessionParams: Stripe.Checkout.SessionCreateParams = {
          mode: 'payment',
          customer_email: customerEmail,
          line_items: lineItems,
          success_url: `${origin}/shop/order-confirmation?order_id=${order.id}`,
          cancel_url: `${origin}/shop/cart`,
          metadata: {
            type: 'merch',
            order_id: order.id,
            user_id: body.user_id,
          },
        }

        // Apply promo code: look it up and add Stripe discount
        if (body.promo_code_id) {
          const { data: promo } = await supabase
            .from('promo_codes')
            .select('*')
            .eq('id', body.promo_code_id)
            .single()

          if (promo && promo.is_active) {
            // Check max_uses limit before applying
            if (promo.max_uses && promo.uses_count >= promo.max_uses) {
              return json({ error: 'Promo code has reached its usage limit' }, 400)
            }

            // Create a Stripe coupon matching the promo
            const couponParams: Stripe.CouponCreateParams = {
              currency: 'aud',
              name: promo.code,
            }
            if (promo.type === 'percentage') {
              couponParams.percent_off = Number(promo.value)
            } else if (promo.type === 'flat') {
              // DB stores value in dollars; Stripe amount_off expects cents
              couponParams.amount_off = Math.round(Number(promo.value) * 100)
            }
            // free_shipping is handled by zeroing shipping_cents client-side

            if (couponParams.percent_off || couponParams.amount_off) {
              const coupon = await stripe.coupons.create(couponParams)
              sessionParams.discounts = [{ coupon: coupon.id }]
            }

          }
        }

        const session = await stripe.checkout.sessions.create(sessionParams)

        // Increment promo usage AFTER Stripe session is created successfully.
        // This prevents wasting a promo use if session creation fails.
        if (body.promo_code_id) {
          const { data: promoForIncr } = await supabase
            .from('promo_codes')
            .select('id, max_uses')
            .eq('id', body.promo_code_id)
            .single()

          if (promoForIncr) {
            const { error: incrError } = await supabase.rpc('increment_promo_uses', {
              p_promo_id: promoForIncr.id,
              p_max_uses: promoForIncr.max_uses ?? 999999,
            })
            if (incrError) {
              console.error('[create-checkout] Promo increment failed:', incrError.message)
            }
          }
        }

        return json({ session_id: session.id, url: session.url })
      }

      /* ---- Event ticket purchase ---- */
      case 'event_ticket': {
        // Validate required fields
        const evtErr = validateUuid(body.event_id, 'event_id')
        if (evtErr) return json({ error: evtErr }, 400)
        const ttErr = validateUuid(body.ticket_type_id, 'ticket_type_id')
        if (ttErr) return json({ error: ttErr }, 400)
        const qty = typeof body.quantity === 'number' ? Math.max(1, Math.min(10, body.quantity)) : 1

        // Verify event exists and is ticketed
        const { data: evt, error: evtDbErr } = await supabase
          .from('events')
          .select('id, title, is_ticketed, status, date_start, cover_image_url')
          .eq('id', body.event_id)
          .single()

        if (evtDbErr || !evt) return json({ error: 'Event not found' }, 404)
        if (!evt.is_ticketed) return json({ error: 'This event does not require tickets' }, 400)
        if (evt.status !== 'published') return json({ error: 'Event is not open for registration' }, 400)

        // Verify ticket type and get price
        const { data: ticketType, error: ttDbErr } = await supabase
          .from('event_ticket_types')
          .select('id, name, price_cents, capacity, sale_start, sale_end, is_active')
          .eq('id', body.ticket_type_id)
          .eq('event_id', body.event_id)
          .single()

        if (ttDbErr || !ticketType) return json({ error: 'Ticket type not found' }, 404)
        if (!ticketType.is_active) return json({ error: 'This ticket type is no longer available' }, 400)

        // Check sale window
        const now = new Date()
        if (ticketType.sale_start && now < new Date(ticketType.sale_start)) {
          return json({ error: 'Tickets are not on sale yet' }, 400)
        }
        if (ticketType.sale_end && now > new Date(ticketType.sale_end)) {
          return json({ error: 'Ticket sales have ended' }, 400)
        }

        // Reserve ticket atomically via RPC (checks capacity with FOR UPDATE)
        const { data: ticketId, error: reserveErr } = await supabase.rpc('reserve_event_ticket', {
          p_event_id: body.event_id,
          p_ticket_type_id: body.ticket_type_id,
          p_user_id: body.user_id,
          p_quantity: qty,
        })

        if (reserveErr) {
          const msg = reserveErr.message
          if (msg.includes('Sold out')) return json({ error: msg }, 409)
          if (msg.includes('not on sale')) return json({ error: msg }, 400)
          return json({ error: 'Failed to reserve ticket' }, 500)
        }

        const customerEmail = await getUserEmail(body.user_id)
        const unitPriceCents = ticketType.price_cents

        // Create Stripe checkout session
        const ticketSession = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: customerEmail,
          line_items: [
            {
              price_data: {
                currency: 'aud',
                product_data: {
                  name: `${evt.title} - ${ticketType.name}`,
                  ...(evt.cover_image_url ? { images: [evt.cover_image_url] } : {}),
                },
                unit_amount: unitPriceCents,
              },
              quantity: qty,
            },
          ],
          success_url: `${origin}/events/${body.event_id}/ticket-confirmation?ticket_id=${ticketId}`,
          cancel_url: `${origin}/events/${body.event_id}`,
          metadata: {
            type: 'event_ticket',
            ticket_id: String(ticketId),
            event_id: body.event_id,
            ticket_type_id: body.ticket_type_id,
            user_id: body.user_id,
            quantity: String(qty),
          },
        })

        // Store the Stripe session ID on the ticket
        await supabase
          .from('event_tickets')
          .update({ stripe_checkout_session_id: ticketSession.id })
          .eq('id', ticketId)

        return json({ session_id: ticketSession.id, url: ticketSession.url })
      }

      /* ---- Cancel subscription ---- */
      case 'cancel_subscription': {
        if (!body.stripe_subscription_id || typeof body.stripe_subscription_id !== 'string') {
          return json({ error: 'Missing stripe_subscription_id' }, 400)
        }

        // Verify the subscription belongs to the authenticated user
        const { data: ownedSub } = await supabase
          .from('recurring_donations')
          .select('id')
          .eq('stripe_subscription_id', body.stripe_subscription_id)
          .eq('user_id', caller.id)
          .single()

        if (!ownedSub) {
          return json({ error: 'Subscription not found or not owned by you' }, 403)
        }

        await stripe.subscriptions.cancel(body.stripe_subscription_id)

        await supabase
          .from('recurring_donations')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('stripe_subscription_id', body.stripe_subscription_id)

        return json({ success: true })
      }

      default:
        return json({ error: `Unknown checkout type: ${body.type}` }, 400)
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
