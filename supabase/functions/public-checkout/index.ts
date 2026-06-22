/**
 * public-checkout - Supabase Edge Function (NO AUTH)
 *
 * Anonymous Stripe Checkout for the public marketing site (coexistaus.org).
 * Lets a visitor donate WITHOUT signing in (the app's create-checkout requires
 * a user JWT). One-time + monthly donations. The donation is recorded by the
 * existing stripe-webhook on checkout.session.completed (which now handles an
 * empty user_id + donor_email for anonymous gifts).
 *
 * Deploy: npx supabase functions deploy public-checkout \
 *           --project-ref tjutlbzekfouwsiaplbr --no-verify-jwt
 *
 * Returns: { url: string }  (Stripe Checkout URL to redirect to)
 */

import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const body = await req.json()
    const origin = req.headers.get('origin') ?? 'https://coexistaus.org'

    if (body.type !== 'donation') {
      return json({ error: 'Unsupported type (only anonymous donation is enabled)' }, 400)
    }

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount < 1 || amount > 50000) {
      return json({ error: 'Amount must be between $1 and $50,000' }, 400)
    }
    const frequency = body.frequency === 'monthly' ? 'monthly' : 'one_time'
    const donorEmail = typeof body.donor_email === 'string' ? body.donor_email.trim().toLowerCase() : ''
    if (donorEmail && (!EMAIL_RE.test(donorEmail) || donorEmail.length > 254)) {
      return json({ error: 'Invalid email' }, 400)
    }
    const donorName = typeof body.donor_name === 'string' ? body.donor_name.trim().slice(0, 120) : ''
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : ''
    const isPublic = body.is_public !== false

    const metadata: Record<string, string> = {
      type: 'donation',
      frequency,
      user_id: '', // anonymous - the webhook maps '' -> null and uses donor_email
      donor_email: donorEmail,
      donor_name: donorName,
      message,
      is_public: String(isPublic),
      source: 'public_site',
    }

    if (frequency === 'monthly') {
      const existing = await stripe.products.search({
        query: "metadata['type']:'recurring_donation'",
        limit: 1,
      })
      const productId = existing.data[0]?.id ??
        (await stripe.products.create({
          name: 'Co-Exist Monthly Donation',
          metadata: { type: 'recurring_donation' },
        })).id

      const price = await stripe.prices.create({
        product: productId,
        unit_amount: Math.round(amount * 100),
        currency: 'aud',
        recurring: { interval: 'month' },
      })

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: donorEmail || undefined,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${origin}/donate/thank-you?amount=${amount}&recurring=true`,
        cancel_url: `${origin}/donate`,
        metadata,
        subscription_data: { metadata },
      })
      return json({ url: session.url })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: donorEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: { name: 'Co-Exist Donation' },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/donate/thank-you?amount=${amount}`,
      cancel_url: `${origin}/donate`,
      metadata,
    })
    return json({ url: session.url })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
