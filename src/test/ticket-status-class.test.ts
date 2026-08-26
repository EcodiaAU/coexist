import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  TICKET_STATUSES,
  TERMINAL_GONE_TICKET_STATUSES,
  RESOLVING_TICKET_STATUSES,
  ticketStatusTone,
  ticketStatusBadge,
  ticketStatusText,
  ticketStatusPresentation,
  isResolvingTicketStatus,
} from '@/lib/event-capacity'

/**
 * The CLASS this file locks, not one instance of it.
 *
 * `reserved` was added to `event_tickets.status` on 2026-08-24 and five sites
 * that switch on ticket status were never revisited. The member-visible one:
 * someone who paid for an organiser hold landed on the confirmation page under
 * the success animation and "Total paid $80.00 AUD" with a RED status reading
 * the raw enum string "reserved", and the poll predicate (`status === 'pending'`)
 * returned false on the first tick so the page never self-resolved.
 *
 * Two invariants hold the class:
 *   1. NO status may fall through to an error style. Red means the seat is gone.
 *   2. A resolving status MUST keep the confirmation page polling.
 *
 * Both are asserted against the shipped source, not only against the helpers,
 * because a fully-tested helper that no production call site imports is exactly
 * how this defect survived three static passes.
 */

const src = (rel: string) => readFileSync(path.resolve(__dirname, '..', rel), 'utf-8')

/**
 * Strip comments so these checks read CODE. A doctrine comment is allowed to
 * name the anti-pattern it replaced; a live branch is not.
 */
const stripComments = (body: string) =>
  body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('ticket status: no status falls through to an error style', () => {
  it('gives every enum status an explicit tone', () => {
    for (const status of TICKET_STATUSES) {
      expect(ticketStatusTone(status), `${status} has no entry in the status table`).not.toBe('unknown')
    }
  })

  it('paints red ONLY where the seat is gone', () => {
    const gone = new Set<string>(TERMINAL_GONE_TICKET_STATUSES)
    for (const status of TICKET_STATUSES) {
      const isGone = gone.has(status)
      const badge = ticketStatusBadge(status)
      const text = ticketStatusText(status)
      expect(ticketStatusTone(status) === 'error', `${status} tone`).toBe(isGone)
      expect(badge.className.includes('error'), `${status} badge className`).toBe(isGone)
      expect(text.className.includes('error'), `${status} text className`).toBe(isGone)
    }
  })

  it('renders an unrecognised status neutral rather than red', () => {
    const seventh = ticketStatusPresentation('a-status-nobody-has-added-yet')
    expect(seventh.tone).toBe('unknown')
    expect(seventh.badgeClassName).not.toContain('error')
    expect(seventh.textClassName).not.toContain('error')
    // Prototype keys must not resolve through Object.prototype.
    expect(ticketStatusPresentation('toString').tone).toBe('unknown')
    expect(ticketStatusPresentation(null).textClassName).not.toContain('error')
    expect(ticketStatusPresentation(undefined).textClassName).not.toContain('error')
  })

  it('reads a live hold as seat-taken-money-owed, never as a dead ticket', () => {
    expect(ticketStatusText('reserved').className).toBe(ticketStatusText('pending').className)
    expect(ticketStatusText('reserved').className).not.toBe(ticketStatusText('cancelled').className)
    // A human label, not the raw enum string the member used to be shown.
    expect(ticketStatusText('reserved').label).toBe('Spot held')
    expect(ticketStatusText('reserved').label).not.toBe('reserved')
  })

  it('gives every status a member-readable label', () => {
    for (const status of TICKET_STATUSES) {
      const label = ticketStatusText(status).label
      expect(label.length).toBeGreaterThan(0)
      // 'checked_in' must never reach a member as the raw enum token.
      expect(label).not.toContain('_')
    }
  })
})

describe('ticket status: a resolving status keeps polling', () => {
  it('treats every resolving status as unsettled and the rest as settled', () => {
    const resolving = new Set<string>(RESOLVING_TICKET_STATUSES)
    for (const status of TICKET_STATUSES) {
      expect(isResolvingTicketStatus(status), `${status} resolving`).toBe(resolving.has(status))
      expect(ticketStatusPresentation(status).resolving).toBe(resolving.has(status))
    }
  })

  it('holds a paid organiser hold open, because the webhook confirms it in place', () => {
    // stripe-webhook: .in('status', ['pending','reserved']) is the optimistic
    // lock, so `reserved` is mid-flight exactly as `pending` is.
    expect(isResolvingTicketStatus('reserved')).toBe(true)
    expect(isResolvingTicketStatus('pending')).toBe(true)
    expect(isResolvingTicketStatus('confirmed')).toBe(false)
  })

  it('does not poll forever on a status the table does not know', () => {
    expect(isResolvingTicketStatus('a-status-nobody-has-added-yet')).toBe(false)
    expect(isResolvingTicketStatus(null)).toBe(false)
  })

  it('mirrors the statuses the stripe webhook actually confirms in place', () => {
    const webhook = readFileSync(
      path.resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf-8',
    )
    // The webhook's optimistic lock defines what "still resolving" means. If it
    // gains a status, this fails until RESOLVING_TICKET_STATUSES gains it too.
    const lock = webhook.match(/\.in\('status',\s*\[([^\]]*)\]\)\s*\/\/\s*optimistic lock/)
    expect(lock, 'stripe-webhook optimistic lock not found').toBeTruthy()
    const locked = (lock as RegExpMatchArray)[1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort()
    expect(locked).toEqual([...RESOLVING_TICKET_STATUSES].sort())
  })
})

/**
 * Wiring, not just helpers. A helper nobody calls is how the leader panel kept
 * its own red-hold ternary after `ticketStatusBadge` had already been written
 * and tested.
 */
describe('ticket status: the surfaces derive, they do not re-implement', () => {
  /**
   * Every ticket-status literal still permitted on a member surface, with the
   * reason it is a BEHAVIOUR gate rather than a presentation branch. Anything
   * not on this list fails, which is what forces the next person adding a
   * status to come here rather than write a seventh inline ternary.
   */
  const ALLOWED_STATUS_LITERALS: Record<string, Record<string, string>> = {
    'pages/events/ticket-confirmation.tsx': {},
    'pages/events/my-tickets.tsx': {
      // Routing and card layout: a held spot goes to the pay-to-confirm flow.
      "status === 'reserved'": 'routing and layout, not colour or label',
      // Self-service is only offered on a live paid ticket.
      "status === 'confirmed'": 'self-service eligibility gate',
    },
  }

  it('leaves no inline ticket-status PRESENTATION branch on a member surface', () => {
    const literal = new RegExp(`status\\s*[=!]==\\s*'(${TICKET_STATUSES.join('|')})'`, 'g')
    for (const [rel, allowed] of Object.entries(ALLOWED_STATUS_LITERALS)) {
      const body = stripComments(src(rel))
      const found = body.match(literal) ?? []
      const unexpected = found
        .map((f) => f.replace(/\s+/g, ' '))
        .filter((f) => !(f in allowed))
      expect(unexpected, `${rel} re-implements the status table: ${unexpected.join(', ')}`).toEqual([])
    }
  })

  it('renders the confirmation status line from the shared table', () => {
    const body = src('pages/events/ticket-confirmation.tsx')
    expect(body).toContain('ticketStatusText')
    expect(body).toContain('isResolvingTicketStatus')
    expect(body).not.toContain('text-error-600')
  })

  it('drives the confirmation poll from the resolving set, not a status literal', () => {
    const body = stripComments(src('hooks/use-event-tickets.ts'))
    const block = body.slice(body.indexOf('refetchInterval:'))
    const predicate = block.slice(0, block.indexOf(': false,') + 8)
    expect(predicate).toContain('isResolvingTicketStatus')
    expect(predicate).not.toMatch(/status\s*===\s*'/)
  })
})
