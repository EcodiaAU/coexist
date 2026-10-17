import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * Installed apps on a bundle from before 2026-08-11 cancel an event with a
 * direct client write (`events.update({ status: 'cancelled' })`), not the
 * cancel-event function. Cancelled events are admin-only to read
 * (20261009120000), so that write only succeeds while the PATCH-scoped SELECT
 * policy from 20261017060000 exists, and it is only safe while the guard
 * trigger refuses a direct cancel on an event with live tickets.
 *
 * Reported by Brandon Marlow (Adelaide leader) on 2026-10-17: the Brown Hill
 * Nature Hike would not cancel. Dropping either object brings that back for
 * every leader whose phone has not taken an OTA, and nothing on a current
 * bundle would notice, because current bundles never send that write.
 */

const dir = resolve(__dirname, '../..', 'supabase/migrations')
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ f, sql: readFileSync(resolve(dir, f), 'utf8') }))

const lastIndex = (re: RegExp) => {
  let at = -1
  migrations.forEach((m, i) => { if (re.test(m.sql)) at = i })
  return at
}

describe('legacy-bundle event cancel stays possible', () => {
  it('the PATCH-scoped SELECT policy is created and never dropped after', () => {
    const created = lastIndex(/CREATE POLICY\s+events_select_cancelled_inside_patch\b/i)
    const dropped = lastIndex(/DROP POLICY\s+(IF EXISTS\s+)?events_select_cancelled_inside_patch\b/i)
    expect(created, 'no migration creates events_select_cancelled_inside_patch').toBeGreaterThanOrEqual(0)
    expect(dropped).toBeLessThan(created)
    const sql = migrations[created].sql
    const body = sql.slice(sql.search(/CREATE POLICY\s+events_select_cancelled_inside_patch\b/i))
    expect(body).toMatch(/current_setting\('request\.method',\s*true\)\s*=\s*'PATCH'/)
    expect(body).toMatch(/status\s*=\s*'cancelled'/)
  })

  it('the guard trigger is created and never dropped after', () => {
    const created = lastIndex(/CREATE TRIGGER\s+trg_guard_direct_event_update\b/i)
    const dropped = lastIndex(/DROP TRIGGER\s+(IF EXISTS\s+)?trg_guard_direct_event_update\b/i)
    expect(created, 'no migration creates trg_guard_direct_event_update').toBeGreaterThanOrEqual(0)
    expect(dropped).toBeLessThan(created)
  })

  it('the guard refuses a direct cancel while live tickets exist, for every live status', () => {
    const at = lastIndex(/FUNCTION\s+public\.guard_direct_event_update\s*\(/i)
    expect(at).toBeGreaterThanOrEqual(0)
    const sql = migrations[at].sql
    for (const s of ['pending', 'confirmed', 'checked_in', 'reserved']) {
      expect(sql, `guard does not count '${s}' tickets as live`).toContain(`'${s}'`)
    }
    expect(sql).toMatch(/is_trusted_backend_caller\(\)/)
  })
})
