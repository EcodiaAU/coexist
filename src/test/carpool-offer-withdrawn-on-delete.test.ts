/**
 * carpool-offer-withdrawn-on-delete.test.ts
 *
 * Reported by Yee Zhao via Tate, 2026-10-27: Branden deleted his carpool post
 * from the Grampians Campout chat, the offer stayed on the event page, and a
 * member booked a seat on it the next day. Deleting the post only flagged the
 * chat message; the carpool_widgets row stayed 'open'.
 *
 * Pins every layer of the fix so it cannot quietly come apart:
 *   1. the event page lists an offer only while it is open/full and its post
 *      is not deleted (isListedCarpoolOffer + the query shape),
 *   2. the migration withdraws the offer on BOTH delete paths and refuses a
 *      seat on a deleted offer,
 *   3. carpool-save-seat refuses a withdrawn offer before the RPC runs,
 *   4. the passenger reads the edge function's own refusal text.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isListedCarpoolOffer, LISTED_CARPOOL_STATUSES } from '@/hooks/use-event-carpools'
import { edgeErrorMessage } from '@/hooks/use-carpool'

const root = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

describe('isListedCarpoolOffer', () => {
  it('lists an open or full offer whose post is live', () => {
    expect(isListedCarpoolOffer({ status: 'open', message: { is_deleted: false } })).toBe(true)
    expect(isListedCarpoolOffer({ status: 'full', message: [{ is_deleted: false }] })).toBe(true)
  })

  it('never lists an offer whose post was deleted, even while the row reads open', () => {
    expect(isListedCarpoolOffer({ status: 'open', message: { is_deleted: true } })).toBe(false)
    expect(isListedCarpoolOffer({ status: 'full', message: [{ is_deleted: true }] })).toBe(false)
  })

  it('never lists a cancelled or archived offer', () => {
    expect(isListedCarpoolOffer({ status: 'cancelled', message: { is_deleted: false } })).toBe(false)
    expect(isListedCarpoolOffer({ status: 'archived', message: null })).toBe(false)
  })

  it('treats a post RLS hides from the viewer as live, not deleted', () => {
    expect(isListedCarpoolOffer({ status: 'open', message: null })).toBe(true)
    expect(isListedCarpoolOffer({ status: 'open' })).toBe(true)
  })

  it('lists exactly the joinable statuses', () => {
    expect([...LISTED_CARPOOL_STATUSES]).toEqual(['open', 'full'])
  })
})

describe('useEventCarpools query shape', () => {
  const src = read('src/hooks/use-event-carpools.ts')

  it('filters to the listed statuses instead of excluding only archived', () => {
    expect(src).toContain(".in('status', [...LISTED_CARPOOL_STATUSES])")
    expect(src).not.toContain(".neq('status', 'archived')")
  })

  it('reads the post through the widget->message FK and filters on it', () => {
    expect(src).toContain('message:chat_messages!carpool_widgets_message_id_fkey(is_deleted)')
    expect(src).toContain('.filter(isListedCarpoolOffer)')
  })
})

describe('migration 20261027120000', () => {
  const sql = read('supabase/migrations/20261027120000_carpool_offer_dies_with_its_message.sql')

  it('withdraws the offer on a soft delete', () => {
    expect(sql).toMatch(/AFTER UPDATE OF is_deleted ON public\.chat_messages/)
    expect(sql).toMatch(/WHEN \(NEW\.is_deleted IS TRUE AND OLD\.is_deleted IS DISTINCT FROM TRUE\)/)
  })

  it('withdraws the offer on a hard delete, BEFORE the FK nulls message_id', () => {
    expect(sql).toMatch(/BEFORE DELETE ON public\.chat_messages/)
    expect(sql).not.toMatch(/AFTER DELETE ON public\.chat_messages/)
  })

  it('cancels the widget and its confirmed seats', () => {
    expect(sql).toMatch(/UPDATE carpool_widgets\s+SET status = 'cancelled'/)
    expect(sql).toMatch(/AND status IN \('open', 'full'\)/)
    expect(sql).toMatch(/UPDATE carpool_seats\s+SET status = 'cancelled'/)
  })

  it('save_carpool_seat refuses an offer whose post is deleted', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.save_carpool_seat/)
    expect(sql).toContain("the offer was removed")
  })

  it('backfills existing ghosts without notifying anyone', () => {
    expect(sql).toMatch(/carpool_withdraw_offer_for_message\(m\.id, m\.carpool_id, false\)/)
  })

  it('notifies with a type every bundle in the field already renders', () => {
    expect(sql).toContain("'event_updated'")
    expect(sql).toContain("'route', v_route")
  })

  it('keeps the notice from ever blocking the delete', () => {
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/)
  })
})

describe('carpool-save-seat edge function', () => {
  const src = read('supabase/functions/carpool-save-seat/index.ts')

  it('refuses a withdrawn offer before the seat RPC runs', () => {
    const guard = src.indexOf('OFFER_REMOVED)')
    const rpc = src.indexOf("rpc('save_carpool_seat'")
    expect(guard).toBeGreaterThan(-1)
    expect(rpc).toBeGreaterThan(guard)
    expect(src).toContain("offer.status === 'cancelled' || msg?.is_deleted === true")
  })

  it('maps the RPC refusal to the same passenger-facing text', () => {
    expect(src).toContain("msg.includes('offer was removed')) return bad(409, OFFER_REMOVED)")
  })
})

describe('edgeErrorMessage', () => {
  it('reads the edge function error text off the response', async () => {
    const err = {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ success: false, error: 'This carpool offer was removed by the driver.' }), { status: 409 }),
    }
    await expect(edgeErrorMessage(err, 'Failed to save seat')).resolves.toBe(
      'This carpool offer was removed by the driver.',
    )
  })

  it('falls back when the body is not JSON or carries no error', async () => {
    await expect(edgeErrorMessage({ context: new Response('nope', { status: 500 }) }, 'Failed')).resolves.toBe('Failed')
    await expect(edgeErrorMessage(new Error('x'), 'Failed')).resolves.toBe('Failed')
    await expect(edgeErrorMessage(null, 'Failed')).resolves.toBe('Failed')
  })
})
