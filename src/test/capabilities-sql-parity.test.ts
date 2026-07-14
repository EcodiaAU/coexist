/**
 * The TypeScript capability model and the SQL one must not drift.
 *
 * The P1 (2026-07-14): Co-Exist shipped an 18-capability model with a per-user override
 * editor, and NONE of it was enforced in the database. RLS gated on role, the app gated on
 * capability, and the two never met. Six capabilities had been explicitly revoked from a live
 * manager and that manager held all six anyway.
 *
 * The fix ported ROLE_DEFAULT_CAPS into SQL (coexist_role_caps) so the database resolves
 * capabilities itself, and RLS write policies now call has_cap(). Which means the two
 * definitions can silently disagree again. This test is the thing that stops that: it parses
 * the SQL function out of the migration and asserts it matches the TypeScript, capability for
 * capability, role for role.
 *
 * If you add a capability to CAPABILITIES or change ROLE_DEFAULT_CAPS, change
 * coexist_role_caps() in a new migration too, or this fails.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROLE_DEFAULT_CAPS, CAPABILITY_KEYS } from '@/lib/capabilities'

const MIGRATION = resolve(
  __dirname,
  '../../supabase/migrations/20260714030000_capabilities_enforced_in_db.sql',
)

/** Pull the capability list for one branch of the coexist_role_caps CASE expression. */
function sqlCapsFor(sql: string, branchMatcher: RegExp): string[] {
  const branch = sql.match(branchMatcher)
  if (!branch) throw new Error(`branch not found in migration: ${branchMatcher}`)
  return [...branch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

describe('capabilities: TypeScript and SQL agree', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('admin caps in SQL match ROLE_DEFAULT_CAPS.admin (the full catalog)', () => {
    const sqlAdmin = sqlCapsFor(sql, /when p_role in \('admin', 'super_admin'\) then array\[([\s\S]*?)\]/)
    expect([...sqlAdmin].sort()).toEqual([...ROLE_DEFAULT_CAPS.admin].sort())
    expect([...sqlAdmin].sort()).toEqual([...CAPABILITY_KEYS].sort())
  })

  it('manager caps in SQL match ROLE_DEFAULT_CAPS.manager', () => {
    const sqlManager = sqlCapsFor(sql, /when p_role in \('manager', 'national_admin'\) then array\[([\s\S]*?)\]/)
    expect([...sqlManager].sort()).toEqual([...ROLE_DEFAULT_CAPS.manager].sort())
  })

  it('manage_membership is grantable from the UI (it was the one cap the DB checked and the catalog lacked)', () => {
    expect(CAPABILITY_KEYS).toContain('manage_membership')
    // admin-default only: a manager needs an explicit grant, which now actually works.
    expect(ROLE_DEFAULT_CAPS.admin).toContain('manage_membership')
    expect(ROLE_DEFAULT_CAPS.manager).not.toContain('manage_membership')
  })

  it('every capability the RLS policies gate on exists in the catalog', () => {
    const gated = new Set([...sql.matchAll(/has_cap\('([a-z_]+)'\)/g)].map((m) => m[1]))
    expect(gated.size).toBeGreaterThan(0)
    for (const cap of gated) {
      expect(CAPABILITY_KEYS, `RLS gates on '${cap}' but it is not in CAPABILITIES`).toContain(cap)
    }
  })

  it('no role below manager holds a global capability (they work through /leader)', () => {
    expect(ROLE_DEFAULT_CAPS.leader).toEqual([])
    expect(ROLE_DEFAULT_CAPS.national_leader).toEqual([])
    expect(ROLE_DEFAULT_CAPS.co_leader).toEqual([])
    expect(ROLE_DEFAULT_CAPS.assist_leader).toEqual([])
    expect(ROLE_DEFAULT_CAPS.participant).toEqual([])
  })
})
