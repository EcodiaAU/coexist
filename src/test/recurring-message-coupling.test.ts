/**
 * The recurring ledger message is written by the Stripe webhook and READ, as a
 * sentinel, by /profile/donations to tag a history row "(recurring)".
 *
 * That coupling is invisible in both files and it has already bitten once: the
 * webhook wrote the literal "Monthly recurring donation" against $25-a-YEAR
 * gifts, and the page matched that one spelling exactly. Correcting the writer
 * to tell the truth about an annual gift would, on its own, have made every
 * annual charge stop reading as recurring on the donor's own page.
 *
 * So this suite does not restate either side. It reads BOTH FROM SOURCE and
 * asserts they still agree, which is the only way a future edit to one of them
 * fails loudly instead of quietly dropping the tag.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const WEBHOOK = readFileSync(
  resolve(ROOT, 'supabase/functions/stripe-webhook/index.ts'),
  'utf8',
)
const PAGE = readFileSync(resolve(ROOT, 'src/pages/profile/donations.tsx'), 'utf8')

/** Every message string the webhook can write against a recurring charge. */
function writerVocabulary(): string[] {
  const block = WEBHOOK.match(
    /const RECURRING_MESSAGE: Record<string, string> = \{([\s\S]*?)\}/,
  )
  if (!block) throw new Error('RECURRING_MESSAGE map not found in stripe-webhook')
  const values = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  const fallback = WEBHOOK.match(
    /RECURRING_MESSAGE\[interval \?\? ''\] \?\? '([^']+)'/,
  )
  if (!fallback) throw new Error('recurringMessage fallback not found in stripe-webhook')
  return [...values, fallback[1]]
}

/** The predicate the donations page actually applies to a history row. */
function readerPredicate(): RegExp {
  const m = PAGE.match(/const RECURRING_MESSAGE_RE = (\/.*\/[a-z]*)\s*$/m)
  if (!m) throw new Error('RECURRING_MESSAGE_RE not found in donations.tsx')
  const [, body, flags] = m[1].match(/^\/(.*)\/([a-z]*)$/)!
  return new RegExp(body, flags)
}

describe('recurring ledger message: writer and reader agree', () => {
  it('the webhook has a cadence for every Stripe billing interval', () => {
    const vocab = writerVocabulary()
    expect(vocab).toContain('Daily recurring donation')
    expect(vocab).toContain('Weekly recurring donation')
    expect(vocab).toContain('Monthly recurring donation')
    expect(vocab).toContain('Annual recurring donation')
    expect(vocab).toContain('Recurring donation')
  })

  it('every message the webhook can write is tagged recurring by the page', () => {
    const re = readerPredicate()
    for (const message of writerVocabulary()) {
      expect(re.test(message), `page does not tag "${message}" as recurring`).toBe(true)
    }
  })

  it('still tags rows written under the old monthly-only spelling', () => {
    // Two live rows predate the fix and carry this exact string against gifts
    // that are billed annually. They must keep their tag.
    expect(readerPredicate().test('Monthly recurring donation')).toBe(true)
  })

  it('does not tag a donor-written message as a recurring charge', () => {
    const re = readerPredicate()
    for (const notARecurringCharge of [
      'care very passionately about our earth and the natural world',
      'want to protect organisations that protect the environment!',
      'in memory of my recurring donation to another charity',
      '',
    ]) {
      expect(re.test(notARecurringCharge.trim()), notARecurringCharge).toBe(false)
    }
  })

  it('the webhook no longer hardcodes the monthly string at a write site', () => {
    // The two write sites must both go through recurringMessage(). A literal
    // reappearing outside the vocabulary map is the regression.
    const writeSites = [...WEBHOOK.matchAll(/message: '([^']*recurring donation)'/gi)]
    expect(writeSites.map((m) => m[1])).toEqual([])
  })
})
