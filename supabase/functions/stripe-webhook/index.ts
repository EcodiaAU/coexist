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
      body: { type, userId, data },
    })
  } catch (err) {
    console.error(`[stripe-webhook] send-email (${type}) failed:`, (err as Error).message)
  }
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
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

          // 1. Record donation (include all metadata fields)
          const { error: donationError } = await supabase.from('donations').insert({
            user_id: metadata.user_id,
            amount: amountDollars,
            currency: 'AUD',
            stripe_payment_id: paymentIntentId ?? session.id,
            project_name: projectName,
            message: metadata.message || null,
            on_behalf_of: metadata.on_behalf_of || null,
            is_public: metadata.is_public !== 'false',
            status: 'succeeded',
          })

          if (donationError) {
            console.error('Failed to insert donation:', donationError.message)
            break
          }

          // 2. Award points (1 point per dollar)
          const points = Math.floor(amountDollars)
          if (points > 0) {
            await supabase.rpc('award_points', {
              p_user_id: metadata.user_id,
              p_amount: points,
              p_reason: metadata.frequency === 'monthly'
                ? 'recurring_donation'
                : 'one_time_donation',
            })
          }

          // 3. Send receipt email via template
          await sendTemplateEmail(supabase, 'donation_receipt', metadata.user_id, {
            name: '', // resolved via userId
            amount: amountDollars.toFixed(2),
            currency: 'AUD',
            date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
            project_name: projectName || '',
            message: metadata.message || '',
            points_earned: points,
            is_recurring: metadata.frequency === 'monthly',
            receipt_url: 'https://app.coexistaus.org/profile/donations',
          })

          console.log('Donation checkout completed:', session.id, `$${amountDollars}`)
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

          // Re-fetch order for email template data
          const { data: order } = await supabase
            .from('merch_orders')
            .select('items')
            .eq('id', orderId)
            .single()

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
            subtotal: '',
            shipping: '',
            discount: '',
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

          if (ticket.status !== 'pending') {
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
            .eq('status', 'pending') // optimistic lock

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

          // 4. Send ticket confirmation email
          const { data: ticketEvent } = await supabase
            .from('events')
            .select('title, date_start, address')
            .eq('id', ticket.event_id)
            .single()

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
            ticket_url: `https://app.coexistaus.org/events/${ticket.event_id}/ticket-confirmation?ticket_id=${ticketId}`,
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
        const meta = subscription.metadata ?? {}
        const amount =
          (subscription.items.data[0]?.price?.unit_amount ?? 0) / 100

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

        const { error: subError } = await supabase.from('recurring_donations').insert({
          user_id: meta.user_id,
          stripe_subscription_id: subscription.id,
          amount,
          currency: 'AUD',
          status: 'active',
        })

        if (subError) {
          console.error('Failed to insert recurring_donation:', subError.message)
        }

        console.log('Subscription created:', subscription.id, `$${amount}/mo`)
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

        // Look up recurring donation to get user_id
        const { data: recurring } = await supabase
          .from('recurring_donations')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        if (!recurring) {
          console.warn('No recurring_donation found for subscription:', subscriptionId)
          break
        }

        const amountDollars = (invoice.amount_paid ?? 0) / 100

        // Idempotency check for recurring payment
        const recurringPaymentId = (invoice.payment_intent as string) ?? invoice.id
        const { data: existingRecurringDonation } = await supabase
          .from('donations')
          .select('id')
          .eq('stripe_payment_id', recurringPaymentId)
          .maybeSingle()

        if (existingRecurringDonation) {
          console.log('Duplicate recurring payment webhook, skipping:', recurringPaymentId)
          break
        }

        // Record the charge as a donation
        const { error: recurDonError } = await supabase.from('donations').insert({
          user_id: recurring.user_id,
          amount: amountDollars,
          currency: 'AUD',
          stripe_payment_id: recurringPaymentId,
          message: 'Monthly recurring donation',
          is_public: false,
          status: 'succeeded',
        })

        if (recurDonError) {
          console.error('Failed to record recurring donation:', recurDonError.message)
          break
        }

        // Award points
        const points = Math.floor(amountDollars)
        if (points > 0) {
          await supabase.rpc('award_points', {
            p_user_id: recurring.user_id,
            p_amount: points,
            p_reason: 'recurring_donation',
          })
        }

        // Send receipt via template
        await sendTemplateEmail(supabase, 'donation_receipt', recurring.user_id, {
          name: '',
          amount: amountDollars.toFixed(2),
          currency: 'AUD',
          date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
          project_name: '',
          message: 'Monthly recurring donation',
          points_earned: points,
          is_recurring: true,
          receipt_url: 'https://app.coexistaus.org/profile/donations',
        })

        console.log('Recurring payment succeeded:', invoice.id, `$${amountDollars}`)
        break
      }

      /* ──────────────────────────────────────────────
       * customer.subscription.deleted
       * ────────────────────────────────────────────── */
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription

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

        // Mark as past_due
        const { data: recurring } = await supabase
          .from('recurring_donations')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        // Update status - the schema CHECK allows 'active', 'cancelled', 'paused'
        // Use 'paused' to represent past_due since that's closest
        await supabase
          .from('recurring_donations')
          .update({ status: 'paused' })
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

          // Cancel the event registration
          await supabase
            .from('event_registrations')
            .update({ status: 'cancelled' })
            .eq('event_id', refundTicket.event_id)
            .eq('user_id', refundTicket.user_id)

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
})
