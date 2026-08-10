// Unit tests for the D3 remediation guard helpers (2026-08-10).
// Run: deno test supabase/functions/_tests/d3-guards.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { outranks, sanitizeReportReason, timingSafeEqual, ROLE_RANK } from '../_shared/d3-guards.ts'

// ---- delete-user rank guard (D3-5) ----
// Live roles: participant, leader, assist_leader, co_leader, manager, admin.
Deno.test('outranks: a manager cannot delete an admin (the reported hole)', () => {
  assertEquals(outranks('manager', 'admin'), false)
})
Deno.test('outranks: an admin can delete a manager', () => {
  assertEquals(outranks('admin', 'manager'), true)
})
Deno.test('outranks: no lateral delete (manager cannot delete a peer manager)', () => {
  assertEquals(outranks('manager', 'manager'), false)
})
Deno.test('outranks: no lateral delete (admin cannot delete a peer admin)', () => {
  assertEquals(outranks('admin', 'admin'), false)
})
Deno.test('outranks: admin can delete every lower tier', () => {
  for (const r of ['participant', 'assist_leader', 'co_leader', 'leader', 'manager']) {
    assertEquals(outranks('admin', r), true, `admin should outrank ${r}`)
  }
})
Deno.test('outranks: leader cannot delete a peer leader or above', () => {
  assertEquals(outranks('leader', 'leader'), false)
  assertEquals(outranks('leader', 'manager'), false)
  assertEquals(outranks('leader', 'admin'), false)
})
Deno.test('outranks: unknown/null roles never outrank (fail closed)', () => {
  assertEquals(outranks('bogus', 'participant'), false) // bogus=-1 < participant=0
  assertEquals(outranks(null, 'admin'), false)
  assertEquals(outranks('admin', undefined), true) // admin=5 > unknown=-1
})
Deno.test('outranks: legacy aliases resolve to the same rank as their canonical role', () => {
  assertEquals(ROLE_RANK['national_leader'], ROLE_RANK['leader'])
  assertEquals(ROLE_RANK['super_admin'], ROLE_RANK['admin'])
})

// ---- notify-report reason sanitizer (D3-3) ----
Deno.test('sanitizeReportReason: collapses newlines so injected structure is flattened', () => {
  const injected = 'harmless\n\nTitle: FAKE ADMIN ALERT\nClick https://evil.example'
  const out = sanitizeReportReason(injected)
  assertEquals(out.includes('\n'), false)
  assertEquals(out, 'harmless Title: FAKE ADMIN ALERT Click https://evil.example')
})
Deno.test('sanitizeReportReason: caps length at 280', () => {
  assertEquals(sanitizeReportReason('x'.repeat(5000)).length, 280)
})
Deno.test('sanitizeReportReason: trims and tolerates null/undefined', () => {
  assertEquals(sanitizeReportReason('   spaced   '), 'spaced')
  assertEquals(sanitizeReportReason(null), '')
  assertEquals(sanitizeReportReason(undefined), '')
})

// ---- excel-sync service-role token compare (D3-1) ----
Deno.test('timingSafeEqual: matches equal strings, rejects differing / different-length', () => {
  assertEquals(timingSafeEqual('abc123', 'abc123'), true)
  assertEquals(timingSafeEqual('abc123', 'abc124'), false)
  assertEquals(timingSafeEqual('abc', 'abcd'), false)
  assertEquals(timingSafeEqual('', ''), true)
})
