/**
 * stripe-webhook - Supabase Edge Function
 *
 * Handles Stripe webhook events for the Co-Exist donation, merch, and ticketing systems.
 *
 * Events handled:
 *   - checkout.session.completed (donations + merch + event tickets)
 *   - customer.subscription.created (recurring donations)
 *   - customer.subscription.deleted (cancellation)
 *   - invoice.payment_succeeded (recurring charge)
 *   - invoice.payment_failed (notify user)
 *   - charge.refunded (update status, restore inventory, cancel ticket)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { withSentry } from '../_shared/sentry.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
})
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// ── Helpers ──

async function sendTemplateEmail(
  supabase: ReturnType<typeof createClient>,
  type: string,
  userId: string,
  data: Record<string, unknown>,
) {
  try {
    await supabase.functions.invoke('send-email', {
          headers: { Authorization: `Bearer ${supabaseServiceKey}` },
      body: { type, userId, data },
    })
  } catch (err) {
    console.error(`[stripe-webhook] send-email (${type}) failed:`, (err as Error).message)
  }
}

/**
 * Reads charity_settings (service_role bypasses its admin-only RLS) and returns
 * exactly the fields a donation receipt renders from. A valid Australian
 * tax-deductible receipt must show the DGR's ABN, so `tax_deductible` is only
 * true when DGR endorsement is set AND an ABN is on file - we never assert
 * deductibility we cannot substantiate. Auto-upgrades to a full ABN receipt the
 * moment an admin fills the ABN in charity_settings.
 */
async function getCharityReceiptContext(
  supabase: ReturnType<typeof createClient>,
): Promise<{ charity_name: string; abn: string; tax_deductible: boolean }> {
  try {
    const { data } = await supabase.from('charity_settings').select('key, value')
    const rows = (data ?? []) as Array<{ key: string; value: string | null }>
    const m = new Map(rows.map((r) => [r.key, r.value ?? '']))
    const charity_name = (m.get('charity_name') || 'Co-Exist Australia').trim()
    const abn = (m.get('abn') || '').trim()
    const dgr = (m.get('dgr_status') || '').trim().toLowerCase() === 'yes'
    return { charity_name, abn, tax_deductible: dgr && abn.length > 0 }
  } catch (err) {
    console.error('[stripe-webhook] charity_settings read failed:', (err as Error).message)
    return { charity_name: 'Co-Exist Australia', abn: '', tax_deductible: false }
  }
}

/** Mint a monotonic receipt number (CE-YYYY-NNNNNN); null if the RPC fails. */
async function mintReceiptNumber(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('next_donation_receipt_number')
  if (error) {
    console.error('[stripe-webhook] receipt number mint failed:', error.message)
    return null
  }
  return (data as string) ?? null
}

/**
 * Send a donation receipt to an authenticated donor (by userId) OR an anonymous
 * donor (by email). Anonymous donors previously received no app receipt at all.
 */
async function sendDonationReceipt(
  supabase: ReturnType<typeof createClient>,
  opts: { userId?: string | null; toEmail?: string | null; data: Record<string, unknown> },
) {
  if (!opts.userId && !opts.toEmail) return
  try {
    await supabase.functions.invoke('send-email', {
          headers: { Authorization: `Bearer ${supabaseServiceKey}` },
      body: {
        type: 'donation_receipt',
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.toEmail ? { to: opts.toEmail } : {}),
        data: opts.data,
      },
    })
  } catch (err) {
    console.error('[stripe-webhook] donation receipt email failed:', (err as Error).message)
  }
}

/**
 * Build a recurring_donations row from a Stripe subscription's metadata.
 * Handles the anonymous case (public-checkout sends user_id='') by mapping it to
 * NULL and carrying donor_email/donor_name, so invoice.payment_succeeded can
 * record each charge by email instead of erroring on the old NOT NULL user_id
 * and dropping every charge (backlog PB6). Carries the recognition context
 * (is_public/message/project/on_behalf_of) so the first charge can mirror the
 * one-time gift on the donor wall.
 */
async function recurringRowFromSubscription(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
) {
  const meta = subscription.metadata ?? {}
  const amount = (subscription.items.data[0]?.price?.unit_amount ?? 0) / 100
  const userId = meta.user_id && meta.user_id !== '' ? meta.user_id : null
  let projectName: string | null = null
  if (meta.project_id) {
    const { data: proj } = await supabase
      .from('donation_projects')
      .select('name')
      .eq('id', meta.project_id)
      .maybeSingle()
    projectName = ((proj as { name: string } | null)?.name) ?? meta.project_id
  }
  return {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    amount,
    currency: 'AUD',
    status: 'active',
    donor_email: meta.donor_email || null,
    donor_name: meta.donor_name || null,
    is_public: meta.is_public === 'true',
    message: meta.message || null,
    project_name: projectName,
    on_behalf_of: meta.on_behalf_of || null,
  }
}

/**
 * Build a memberships row from a Stripe subscription whose metadata.type is
 * 'membership'. Membership subscriptions must stay entirely out of the donation
 * tables (recurring_donations / donations) that the GLOBAL subscription and
 * invoice handlers write by default, or a membership payment would be recorded
 * as a donation. user_id + plan_id are set at checkout (subscription_data
 * metadata) and are required by the memberships NOT NULL / FK constraints.
 */
function membershipRowFromSubscription(subscription: Stripe.Subscription) {
  const meta = subscription.metadata ?? {}
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null
  const toIso = (unix: number | null | undefined) =>
    unix ? new Date(unix * 1000).toISOString() : null
  return {
    user_id: meta.user_id || null,
    plan_id: meta.plan_id || null,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    interval: meta.interval === 'yearly' ? 'yearly' : 'monthly',
    status: 'active',
    current_period_start: toIso(subscription.current_period_start),
    current_period_end: toIso(subscription.current_period_end),
  }
}

// ── Main handler ──

Deno.serve(withSentry('stripe-webhook', async (req: Request) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', (err as Error).message)
    return new Response('Webhook signature verification failed', { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    switch (event.type) {
      /* ──────────────────────────────────────────────
       * checkout.session.completed
       * ────────────────────────────────────────────── */
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const metadata = session.metadata ?? {}
        const amountDollars = (session.amount_total ?? 0) / 100
        const paymentIntentId = session.payment_intent as string

        if (metadata.type === 'donation') {
          // A monthly donation is a Stripe subscription: its first charge is owned
          // solely by invoice.payment_succeeded (which fires for the first AND every
          // subsequent invoice). Recording it here too double-recorded the first
          // month - two donation rows, points awarded twice, two receipts emailed
          // (backlog PB2). Skip monthly here; the recurring handlers own it.
          if (metadata.frequency === 'monthly') break

          // Idempotency check: skip if this payment was already recorded
          const { data: existingDonation } = await supabase
            .from('donations')
            .select('id')
            .eq('stripe_payment_id', paymentIntentId ?? session.id)
            .maybeSingle()

          if (existingDonation) {
            console.log('Duplicate webhook for donation, skipping:', paymentIntentId)
            break
          }

          // Resolve project name from project_id if provided
          let projectName: string | null = null
          if (metadata.project_id) {
            const { data: proj } = await supabase
              .from('donation_projects')
              .select('name')
              .eq('id', metadata.project_id)
              .maybeSingle()
            projectName = proj?.name ?? metadata.project_id
          }

          // Anonymous (public-site) donations carry an empty user_id and a
          // donor_email/donor_name instead. Map '' -> null and record the donor.
          const donorUserId = metadata.user_id && metadata.user_id !== '' ? metadata.user_id : null
          const donorEmail = metadata.donor_email || session.customer_details?.email || null
          const donorName = metadata.donor_name || session.customer_details?.name || null
          const receiptNumber = await mintReceiptNumber(supabase)

          // 1. Record donation (include all metadata fields)
          const { error: donationError } = await supabase.from('donations').insert({
            user_id: donorUserId,
            donor_email: donorEmail,
            donor_name: donorName,
            amount: amountDollars,
            currency: 'AUD',
            stripe_payment_id: paymentIntentId ?? session.id,
            project_name: projectName,
            message: metadata.message || null,
            on_behalf_of: metadata.on_behalf_of || null,
            is_public: metadata.is_public !== 'false',
            receipt_number: receiptNumber,
            status: 'succeeded',
          })

          if (donationError) {
            console.error('Failed to insert donation:', donationError.message)
            break
          }

          // 2. Award points (1 point per dollar) - authenticated donors only
          const points = Math.floor(amountDollars)
          if (points > 0 && donorUserId) {
            await supabase.rpc('award_points', {
              p_user_id: donorUserId,
              p_amount: points,
              p_reason: 'one_time_donation',
            })
          }

          // 3. Send a receipt to BOTH members (by userId) and anonymous donors
          //    (by email). Anonymous donors previously got no app receipt at all
          //    (backlog DGR). The receipt renders its charity name / ABN / DGR
          //    statement from charity_settings (see getCharityReceiptContext).
          const charity = await getCharityReceiptContext(supabase)
          await sendDonationReceipt(supabase, {
            userId: donorUserId,
            toEmail: donorUserId ? null : donorEmail,
            data: {
              name: donorUserId ? '' : (donorName || ''),
              amount: amountDollars.toFixed(2),
              currency: 'AUD',
              date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
              project_name: projectName || '',
              message: metadata.message || '',
              points_earned: points,
              is_recurring: false,
              receipt_number: receiptNumber || '',
              charity_name: charity.charity_name,
              abn: charity.abn,
              tax_deductible: charity.tax_deductible,
              receipt_url: 'https://app.coexistaus.org/profile/donations',
            },
          })

          console.log('Donation checkout completed:', session.id, `$${amountDollars}`, donorUserId ? '(member)' : '(anon)')
        }

        if (metadata.type === 'merch') {
          const orderId = metadata.order_id

          // Idempotency check: only process if order is still 'pending'
          const { data: currentOrder } = await supabase
            .from('merch_orders')
            .select('id, status, items')
            .eq('id', orderId)
            .single()

          if (!currentOrder) {
            console.error('Merch order not found:', orderId)
            break
          }

          if (currentOrder.status !== 'pending') {
            console.log('Order already processed, skipping:', orderId, currentOrder.status)
            break
          }

          // 1. Update order status and record payment intent
          const { error: updateError } = await supabase
            .from('merch_orders')
            .update({
              status: 'processing',
              stripe_payment_id: paymentIntentId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderId)
            .eq('status', 'pending') // Optimistic lock: only update if still pending

          if (updateError) {
            console.error('Failed to update order status:', updateError.message)
            break
          }

          // 2. Atomically decrement stock for each item using RPC
          if (currentOrder.items && Array.isArray(currentOrder.items)) {
            for (const item of currentOrder.items as Array<{
              product_id: string
              variant_id: string
              variant_key?: string
              quantity: number
            }>) {
              const variantKey = item.variant_key ?? item.variant_id
              // Atomic decrement: SET stock_count = GREATEST(0, stock_count - quantity)
              const { error: stockError } = await supabase.rpc('decrement_stock', {
                p_product_id: item.product_id,
                p_variant_key: variantKey,
                p_quantity: item.quantity,
              })
              if (stockError) {
                console.error(`Stock decrement failed for ${item.product_id}/${variantKey}:`, stockError.message)
              }
            }
          }

          // 2b. Release the buyer's stock reservations now the purchase settled,
          //     so units are not double-held (decrement above + reservation) for
          //     up to the 15-min reservation TTL (#8).
          if (metadata.user_id) {
            const { error: relErr } = await supabase.rpc('release_all_reservations', {
              p_user_id: metadata.user_id,
            })
            if (relErr) console.error('[stripe-webhook] reservation release failed:', relErr.message)
          }

          // 2c. Increment promo usage on real payment (moved off session-create so
          //     an abandoned cart never burns a limited-use code, #10).
          const promoId = typeof metadata.promo_code_id === 'string' ? metadata.promo_code_id : ''
          if (promoId) {
            const { data: promoRow } = await supabase
              .from('promo_codes')
              .select('id, max_uses')
              .eq('id', promoId)
              .maybeSingle()
            if (promoRow) {
              const { error: incrErr } = await supabase.rpc('increment_promo_uses', {
                p_promo_id: promoRow.id,
                p_max_uses: promoRow.max_uses ?? 999999,
              })
              if (incrErr) console.error('[stripe-webhook] promo increment failed:', incrErr.message)
            }
          }

          // Re-fetch order for email template data (incl. server-computed breakdown)
          const { data: order } = await supabase
            .from('merch_orders')
            .select('items, subtotal_cents, shipping_cents, discount_cents, total_cents')
            .eq('id', orderId)
            .single()

          const centsToStr = (c: number | null | undefined) =>
            typeof c === 'number' ? `$${(c / 100).toFixed(2)}` : ''

          // 3. Award points for merch purchase (1 point per $2 spent)
          const merchPoints = Math.floor(amountDollars / 2)
          if (merchPoints > 0 && metadata.user_id) {
            await supabase.rpc('award_points', {
              p_user_id: metadata.user_id,
              p_amount: merchPoints,
              p_reason: 'merch_purchase',
            })
          }

          // 4. Send order confirmation email via template
          await sendTemplateEmail(supabase, 'order_confirmation', metadata.user_id, {
            name: '', // resolved via userId
            order_id: orderId.slice(0, 8),
            items: order?.items ?? [],
            total: `$${amountDollars.toFixed(2)}`,
            subtotal: centsToStr(order?.subtotal_cents),
            shipping: centsToStr(order?.shipping_cents),
            discount: order?.discount_cents ? centsToStr(order.discount_cents) : '',
            shipping_address: {},
            order_url: `https://app.coexistaus.org/shop/orders/${orderId}`,
          })

          console.log('Merch checkout completed:', session.id, `order: ${orderId}`)
        }

        if (metadata.type === 'event_ticket') {
          const ticketId = metadata.ticket_id

          // Idempotency: only process if ticket is still 'pending'
          const { data: ticket } = await supabase
            .from('event_tickets')
            .select('id, status, event_id, user_id, quantity, ticket_code')
            .eq('id', ticketId)
            .single()

          if (!ticket) {
            console.error('Event ticket not found:', ticketId)
            break
          }

          // 'reserved' is a live, unpaid organiser hold that the invitee has now
          // paid for. It confirms exactly like a pending row; only the route in
          // differs (the seat was held ahead of checkout, possibly over capacity).
          if (ticket.status !== 'pending' && ticket.status !== 'reserved') {
            console.log('Ticket already processed, skipping:', ticketId, ticket.status)
            break
          }

          // 1. Confirm the ticket
          const { error: confirmErr } = await supabase
            .from('event_tickets')
            .update({
              status: 'confirmed',
              stripe_payment_intent_id: paymentIntentId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ticketId)
            .in('status', ['pending', 'reserved']) // optimistic lock

          if (confirmErr) {
            console.error('Failed to confirm ticket:', confirmErr.message)
            break
          }

          // 2. Create event_registration so the user appears as registered
          //    (integrates with existing check-in, attendee, and impact flows)
          await supabase
            .from('event_registrations')
            .upsert(
              {
                event_id: ticket.event_id,
                user_id: ticket.user_id,
                status: 'registered',
              },
              { onConflict: 'event_id,user_id' },
            )

          // 3. Award points (1 point per dollar spent)
          const ticketDollars = Math.floor(amountDollars)
          if (ticketDollars > 0) {
            await supabase.rpc('award_points', {
              p_user_id: ticket.user_id,
              p_amount: ticketDollars,
              p_reason: 'event_ticket',
            })
          }

          // 4. Send ticket confirmation email.
          const { data: ticketEvent } = await supabase
            .from('events')
            .select('title, date_start, address')
            .eq('id', ticket.event_id)
            .single()

          // The plain ticket page is auth-gated, so a guest (who has only a
          // shell account, no password) can only reach it via a magic link.
          // For guests, make the email CTA a fresh single-use magic link that
          // signs them in and lands on the ticket (backup to the success
          // redirect). Members keep the normal direct link.
          const ticketPath = `/events/${ticket.event_id}/ticket-confirmation?ticket_id=${ticketId}`
          let ticketUrl = `https://app.coexistaus.org${ticketPath}`
          if (metadata.guest === 'true') {
            const appUrl = Deno.env.get('APP_URL') ?? 'https://app.coexistaus.org'
            const { data: linkData } = await supabase.auth.admin.getUserById(ticket.user_id)
            const guestEmail = linkData?.user?.email
            if (guestEmail) {
              const { data: magic } = await supabase.auth.admin.generateLink({
                type: 'magiclink',
                email: guestEmail,
                options: { redirectTo: `${appUrl}${ticketPath}` },
              })
              if (magic?.properties?.action_link) ticketUrl = magic.properties.action_link
            }
          }

          await sendTemplateEmail(supabase, 'ticket_confirmation', ticket.user_id, {
            name: '',
            event_title: ticketEvent?.title ?? 'Event',
            event_date: ticketEvent?.date_start
              ? new Date(ticketEvent.date_start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : '',
            event_location: ticketEvent?.address ?? '',
            ticket_code: ticket.ticket_code ?? '',
            quantity: ticket.quantity,
            amount: amountDollars.toFixed(2),
            currency: 'AUD',
            ticket_url: ticketUrl,
          })

          console.log('Event ticket confirmed:', ticketId, `$${amountDollars}`, `code: ${ticket.ticket_code}`)
        }
        break
      }

      /* ──────────────────────────────────────────────
       * customer.subscription.created
       * ────────────────────────────────────────────── */
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription

        // Membership subscriptions live in `memberships`, never the donation tables.
        if (subscription.metadata?.type === 'membership') {
          const { data: existingMem } = await supabase
            .from('memberships')
            .select('id')
            .eq('stripe_subscription_id', subscription.id)
            .maybeSingle()
          if (existingMem) {
            console.log('Duplicate membership subscription webhook, skipping:', subscription.id)
            break
          }
          const memRow = membershipRowFromSubscription(subscription)
          const { error: memErr } = await supabase.from('memberships').insert(memRow)
          if (memErr) console.error('Failed to insert membership:', memErr.message)
          else console.log('Membership created:', subscription.id, memRow.interval)
          break
        }

        // Idempotency check
        const { data: existingSub } = await supabase
          .from('recurring_donations')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .maybeSingle()

        if (existingSub) {
          console.log('Duplicate subscription webhook, skipping:', subscription.id)
          break
        }

        const row = await recurringRowFromSubscription(supabase, subscription)
        const { error: subError } = await supabase.from('recurring_donations').insert(row)

        if (subError) {
          console.error('Failed to insert recurring_donation:', subError.message)
        }

        console.log('Subscription created:', subscription.id, `$${row.amount}/mo`, row.user_id ? '(member)' : '(anon)')
        break
      }

      /* ──────────────────────────────────────────────
       * invoice.payment_succeeded (recurring charge)
       * ────────────────────────────────────────────── */
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription.id

        // Membership charge (first or renewal): refresh the period, mark active,
        // and NEVER record a donation. Resolve by the memberships row; self-heal
        // from subscription metadata if this invoice beat subscription.created
        // (the same webhook race the donation path guards against).
        {
          const { data: mem } = await supabase
            .from('memberships')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle()
          let isMembership = !!mem
          let subForPeriod: Stripe.Subscription | null = null
          if (!mem) {
            try {
              const sub = await stripe.subscriptions.retrieve(subscriptionId)
              if (sub.metadata?.type === 'membership') {
                isMembership = true
                subForPeriod = sub
                await supabase
                  .from('memberships')
                  .upsert(membershipRowFromSubscription(sub), { onConflict: 'stripe_subscription_id' })
              }
            } catch (err) {
              console.error('[stripe-webhook] membership self-heal failed:', (err as Error).message)
            }
          }
          if (isMembership) {
            const endUnix =
              invoice.lines?.data?.[0]?.period?.end ?? subForPeriod?.current_period_end ?? null
            const patch: Record<string, unknown> = { status: 'active' }
            if (endUnix) patch.current_period_end = new Date(endUnix * 1000).toISOString()
            await supabase.from('memberships').update(patch).eq('stripe_subscription_id', subscriptionId)
            console.log('Membership payment succeeded:', invoice.id, subscriptionId)
            break
          }
        }

        const amountDollars = (invoice.amount_paid ?? 0) / 100
        const recurringPaymentId = (invoice.payment_intent as string) ?? invoice.id

        // Idempotency check for recurring payment (survives Stripe retries)
        const { data: existingRecurringDonation } = await supabase
          .from('donations')
          .select('id')
          .eq('stripe_payment_id', recurringPaymentId)
          .maybeSingle()

        if (existingRecurringDonation) {
          console.log('Duplicate recurring payment webhook, skipping:', recurringPaymentId)
          break
        }

        // Resolve the donor. Prefer the recurring_donations row; if it is missing
        // (webhook race - this invoice arrived before customer.subscription.created,
        // or a historical anonymous sub that never recorded a row) SELF-HEAL by
        // reading the subscription metadata and recording the row now. This is
        // required because checkout.session.completed no longer records the monthly
        // first charge (PB2), so this handler must own it reliably (PB6).
        type RecurringCtx = {
          user_id: string | null
          donor_email: string | null
          donor_name: string | null
          is_public: boolean
          message: string | null
          project_name: string | null
          on_behalf_of: string | null
        }
        let recurring: RecurringCtx | null = null
        {
          const { data } = await supabase
            .from('recurring_donations')
            .select('user_id, donor_email, donor_name, is_public, message, project_name, on_behalf_of')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle()
          recurring = (data as RecurringCtx | null) ?? null
        }

        if (!recurring) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            const row = await recurringRowFromSubscription(supabase, sub)
            // Idempotent - subscription.created may still land later
            await supabase
              .from('recurring_donations')
              .upsert(row, { onConflict: 'stripe_subscription_id' })
            recurring = {
              user_id: row.user_id,
              donor_email: row.donor_email,
              donor_name: row.donor_name,
              is_public: row.is_public,
              message: row.message,
              project_name: row.project_name,
              on_behalf_of: row.on_behalf_of,
            }
          } catch (err) {
            console.error('[stripe-webhook] recurring self-heal failed:', (err as Error).message)
          }
        }

        // Never drop a real charge: fall back to the invoice's own customer email.
        const donorUserId = recurring?.user_id ?? null
        const donorEmail = recurring?.donor_email ?? invoice.customer_email ?? null
        const donorName = recurring?.donor_name ?? null

        // The first invoice (billing_reason 'subscription_create') mirrors the
        // one-time gift - honour the donor's wall opt-in + message. Renewals are
        // private ledger entries.
        const firstCharge = invoice.billing_reason === 'subscription_create'
        const receiptNumber = await mintReceiptNumber(supabase)

        // Record the charge as a donation
        const { error: recurDonError } = await supabase.from('donations').insert({
          user_id: donorUserId,
          donor_email: donorUserId ? null : donorEmail,
          donor_name: donorUserId ? null : donorName,
          amount: amountDollars,
          currency: 'AUD',
          stripe_payment_id: recurringPaymentId,
          project_name: recurring?.project_name ?? null,
          message: firstCharge ? (recurring?.message || 'Monthly recurring donation') : 'Monthly recurring donation',
          on_behalf_of: firstCharge ? (recurring?.on_behalf_of ?? null) : null,
          is_public: firstCharge ? (recurring?.is_public ?? false) : false,
          receipt_number: receiptNumber,
          status: 'succeeded',
        })

        if (recurDonError) {
          console.error('Failed to record recurring donation:', recurDonError.message)
          break
        }

        // Award points (1 per dollar) - authenticated donors only
        const points = Math.floor(amountDollars)
        if (points > 0 && donorUserId) {
          await supabase.rpc('award_points', {
            p_user_id: donorUserId,
            p_amount: points,
            p_reason: 'recurring_donation',
          })
        }

        // Receipt to member (by userId) OR anonymous donor (by email)
        const charity = await getCharityReceiptContext(supabase)
        await sendDonationReceipt(supabase, {
          userId: donorUserId,
          toEmail: donorUserId ? null : donorEmail,
          data: {
            name: donorUserId ? '' : (donorName || ''),
            amount: amountDollars.toFixed(2),
            currency: 'AUD',
            date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
            project_name: recurring?.project_name ?? '',
            message: 'Monthly recurring donation',
            points_earned: points,
            is_recurring: true,
            receipt_number: receiptNumber || '',
            charity_name: charity.charity_name,
            abn: charity.abn,
            tax_deductible: charity.tax_deductible,
            receipt_url: 'https://app.coexistaus.org/profile/donations',
          },
        })

        console.log('Recurring payment succeeded:', invoice.id, `$${amountDollars}`, donorUserId ? '(member)' : '(anon)', firstCharge ? '[first]' : '[renewal]')
        break
      }

      /* ──────────────────────────────────────────────
       * customer.subscription.deleted
       * ────────────────────────────────────────────── */
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription

        // Membership cancellation lands on the memberships row, not the donation one.
        if (sub.metadata?.type === 'membership') {
          await supabase
            .from('memberships')
            .update({ status: 'cancelled' })
            .eq('stripe_subscription_id', sub.id)
          console.log('Membership cancelled:', sub.id)
          break
        }

        await supabase
          .from('recurring_donations')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        // Notify user via template
        const meta = sub.metadata ?? {}
        if (meta.user_id) {
          await sendTemplateEmail(supabase, 'subscription_cancelled', meta.user_id, {
            name: '',
            donate_url: 'https://app.coexistaus.org/donate',
          })
        }

        console.log('Subscription cancelled:', sub.id)
        break
      }

      /* ──────────────────────────────────────────────
       * invoice.payment_failed
       * ────────────────────────────────────────────── */
      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object as Stripe.Invoice
        if (!failedInvoice.subscription) break

        const subscriptionId =
          typeof failedInvoice.subscription === 'string'
            ? failedInvoice.subscription
            : failedInvoice.subscription.id

        // Membership card failure -> past_due on the memberships row, no donation-side work.
        {
          const { data: mem } = await supabase
            .from('memberships')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle()
          if (mem) {
            await supabase
              .from('memberships')
              .update({ status: 'past_due' })
              .eq('stripe_subscription_id', subscriptionId)
            console.log('Membership payment failed -> past_due:', subscriptionId)
            break
          }
        }

        // Mark as past_due
        const { data: recurring } = await supabase
          .from('recurring_donations')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        // Migration 051 added 'past_due' to the status CHECK specifically so a
        // card failure is distinguishable from a deliberate 'paused'; write it
        // directly instead of the old 'paused' proxy (backlog past_due finding).
        await supabase
          .from('recurring_donations')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', subscriptionId)

        // Notify user about failed payment via template
        if (recurring) {
          const failedAmount = (failedInvoice.amount_due ?? 0) / 100
          await sendTemplateEmail(supabase, 'payment_failed', recurring.user_id, {
            name: '',
            amount: failedAmount.toFixed(2),
            update_url: 'https://app.coexistaus.org/profile/donations',
          })
        }

        console.log('Recurring payment failed:', failedInvoice.id)
        break
      }

      /* ──────────────────────────────────────────────
       * charge.refunded
       * ────────────────────────────────────────────── */
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const paymentIntentId = charge.payment_intent as string

        // Try to find and update a merch order
        const { data: order } = await supabase
          .from('merch_orders')
          .select('id, items, user_id')
          .eq('stripe_payment_id', paymentIntentId)
          .single()

        // Try event ticket refund first
        const { data: refundTicket } = await supabase
          .from('event_tickets')
          .select('id, event_id, user_id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle()

        if (refundTicket) {
          await supabase
            .from('event_tickets')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .eq('id', refundTicket.id)

          // Registration + campout chat membership are reconciled by the
          // reconcile_ticket_membership DB trigger on event_tickets (dupe-aware:
          // it only cancels the registration / removes from chat when NO valid
          // ticket remains). Doing it here as well caused the dupe bug where
          // refunding one of a buyer's duplicate tickets evicted them entirely.
          // Migration 20260628000000_ticket_membership_enforcement.

          const refundAmount = (charge.amount_refunded ?? 0) / 100
          await sendTemplateEmail(supabase, 'refund_confirmation', refundTicket.user_id, {
            name: '',
            order_id: refundTicket.id.slice(0, 8),
            refund_amount: refundAmount.toFixed(2),
            currency: 'AUD',
          })

          console.log('Event ticket refunded:', refundTicket.id)
          break
        }

        if (order) {
          // Update order status to refunded
          await supabase
            .from('merch_orders')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .eq('id', order.id)

          // Restore inventory atomically for each item
          if (order.items && Array.isArray(order.items)) {
            for (const item of order.items as Array<{
              product_id: string
              variant_id: string
              variant_key?: string
              quantity: number
            }>) {
              const variantKey = item.variant_key ?? item.variant_id
              // Atomic increment: SET stock_count = stock_count + quantity
              const { error: restoreError } = await supabase.rpc('increment_stock', {
                p_product_id: item.product_id,
                p_variant_key: variantKey,
                p_quantity: item.quantity,
              })
              if (restoreError) {
                console.error(`Stock restore failed for ${item.product_id}/${variantKey}:`, restoreError.message)
              }
            }
          }

          // Send refund confirmation email via template
          const refundAmount = (charge.amount_refunded ?? 0) / 100
          await sendTemplateEmail(supabase, 'refund_confirmation', order.user_id, {
            name: '',
            order_id: order.id.slice(0, 8),
            refund_amount: refundAmount.toFixed(2),
            currency: 'AUD',
          })

          console.log('Merch order refunded:', order.id)
        } else {
          // Donation refund: update donation status to 'refunded'
          const { data: donation } = await supabase
            .from('donations')
            .select('id, user_id')
            .eq('stripe_payment_id', paymentIntentId)
            .maybeSingle()

          if (donation) {
            await supabase
              .from('donations')
              .update({ status: 'refunded' })
              .eq('id', donation.id)

            // Send refund confirmation email
            if (donation.user_id) {
              const refundAmount = (charge.amount_refunded ?? 0) / 100
              await sendTemplateEmail(supabase, 'refund_confirmation', donation.user_id, {
                name: '',
                order_id: donation.id.slice(0, 8),
                refund_amount: refundAmount.toFixed(2),
                currency: 'AUD',
              })
            }

            console.log('Donation refunded:', donation.id)
          } else {
            console.log('Charge refunded (no matching order or donation):', charge.id, paymentIntentId)
          }
        }

        break
      }

      default:
        console.log('Unhandled event type:', event.type)
    }
  } catch (err) {
    // Log but return 200 to prevent Stripe retries on processing errors
    console.error('Webhook processing error:', (err as Error).message)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}))
