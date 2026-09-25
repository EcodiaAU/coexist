/**
 * The admin "cannot receive email" list and the sender must agree on which
 * addresses are sendable.
 *
 * admin_unreachable_members() (migration 20260925120000) judges an address with
 * coexist_email_sendable(), a Postgres port of SENDABLE_RE in
 * supabase/functions/_shared/recipient-email.ts. If the two regexes drift, the
 * admin page tells Kurt a member is fine while the sender silently skips them,
 * or the reverse, and nobody notices because both sides look healthy on their
 * own. This test parses BOTH patterns out of source and asserts they are the
 * same string, then runs the sender's regex over the known cases.
 *
 * If you change SENDABLE_RE, ship a migration that redefines
 * coexist_email_sendable() with the same pattern, and point SQL_MIGRATION at it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SENDER = resolve(__dirname, '../../supabase/functions/_shared/recipient-email.ts')
const SQL_MIGRATION = resolve(
  __dirname,
  '../../supabase/migrations/20260925120000_admin_unreachable_members.sql',
)

function senderPattern(): string {
  const m = readFileSync(SENDER, 'utf8').match(/const SENDABLE_RE = \/(.+)\/\s*$/m)
  if (!m) throw new Error('SENDABLE_RE not found in recipient-email.ts')
  return m[1]
}

function sqlPattern(): string {
  const sql = readFileSync(SQL_MIGRATION, 'utf8')
  const fn = sql.match(/function public\.coexist_email_sendable[\s\S]*?\$\$([\s\S]*?)\$\$/)
  if (!fn) throw new Error('coexist_email_sendable body not found in migration')
  // The literal after `~ '` up to the closing quote; '' is an escaped quote in SQL.
  const lit = fn[1].match(/~ '((?:[^']|'')*)'/)
  if (!lit) throw new Error('regex literal not found in coexist_email_sendable')
  return lit[1].replace(/''/g, "'")
}

describe('unreachable members: SQL sendable check matches the sender', () => {
  it('the Postgres pattern is character-for-character SENDABLE_RE', () => {
    expect(sqlPattern()).toBe(senderPattern())
  })

  it('gives the verdicts the 2026-09-18 cases need', () => {
    const re = new RegExp(senderPattern())
    const sendable = (e: string) => re.test(e.trim())
    // The member with no TLD at all: the sender skips her, so the list must show her.
    expect(sendable('hayesabigail@y7mail')).toBe(false)
    // A normal address is fine.
    expect(sendable('someone.normal@gmail.com')).toBe(true)
    expect(sendable('  someone.normal@gmail.com ')).toBe(true)
    // Typo domains PASS the shape check. That is why the SQL side also checks
    // email_suppressions and the typo-domain rule: shape alone finds 1 of the 8.
    expect(sendable('kiliclyla@gmai.com')).toBe(true)
    expect(sendable('benjaminhjudkins@gmail.con')).toBe(true)
  })
})
