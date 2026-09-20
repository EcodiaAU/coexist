// Unit tests for excel-sync to-excel change detection (2026-09-21).
// Run: deno test supabase/functions/_tests/excel-row-diff.test.ts
//
// The comparator is load-bearing in BOTH directions and the two failures are
// not symmetric: a false "unchanged" silently drops real client data off the
// Master Impact Data Sheet, while a false "changed" only costs one wasted
// Graph PATCH. Every case below that asserts `true` is therefore a safety
// case, not a performance one.
//
// Mutation-verified 2026-09-21: disabling the missing-fresh-row guard, dropping
// the blank-vs-numeric guard, and forcing the comparator to always answer
// "unchanged" each turn this suite red.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { normCell, rowDiffers } from '../_shared/excel-row-diff.ts'

Deno.test('identical rows are unchanged', () => {
  assertEquals(rowDiffers(['a', 'b'], ['a', 'b']), false)
  assertEquals(rowDiffers(Array(28).fill('x'), Array(28).fill('x')), false)
})

Deno.test('Excel type round-trips do not read as changed', () => {
  // The whole reason a raw === comparison would make this fix a no-op.
  assertEquals(rowDiffers(['5'], [5]), false)
  assertEquals(rowDiffers(['5.0'], [5]), false)
  assertEquals(rowDiffers([5], ['5.00']), false)
  assertEquals(rowDiffers([null], ['']), false)
  assertEquals(rowDiffers(['  a  '], ['a']), false)
})

Deno.test('a real difference is always changed', () => {
  assertEquals(rowDiffers(['a'], ['b']), true)
  assertEquals(rowDiffers([5], [6]), true)
  assertEquals(rowDiffers(['5'], ['five']), true)
  assertEquals(rowDiffers(Array(28).fill('x'), [...Array(27).fill('x'), 'y']), true)
})

Deno.test('SAFETY: no evidence about the sheet means changed', () => {
  // The pre-write re-read failed, so the caller hands us nothing. PATCH anyway.
  assertEquals(rowDiffers(['a'], undefined), true)
})

Deno.test('SAFETY: a value we want where the sheet has nothing is changed', () => {
  assertEquals(rowDiffers(['a', 'b'], ['a']), true)
  // ...but wanting blank where the sheet has nothing is genuinely unchanged.
  assertEquals(rowDiffers(['a', ''], ['a']), false)
  assertEquals(rowDiffers(['a', null], ['a']), false)
})

Deno.test('SAFETY: blank is not zero', () => {
  // Number('') is 0, so a naive numeric compare would skip writing a real 0
  // over an empty cell, and skip clearing a 0 back to blank.
  assertEquals(rowDiffers([''], [0]), true)
  assertEquals(rowDiffers([0], ['']), true)
})

Deno.test('case differences are changed', () => {
  assertEquals(rowDiffers(['No'], ['no']), true)
})

Deno.test('normCell collapses null, undefined and whitespace', () => {
  assertEquals(normCell(null), '')
  assertEquals(normCell(undefined), '')
  assertEquals(normCell('  x '), 'x')
  assertEquals(normCell(7), '7')
})
