// Unit tests for per-recipient accounting in the batch send (2026-09-17).
// Run: deno test supabase/functions/_tests/recipient-partition.test.ts
//
// Grounded in the live loss: the Perth Coastal Festival reminder of
// 2026-09-17 10:52:47Z delivered to 375 of 424 eligible members and reported a
// clean success, because a member whose address could not be resolved left the
// pipeline through the same `.filter()` as a member who had opted out.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { partitionRecipients } from '../_shared/recipient-partition.ts'

Deno.test('an unresolved recipient is counted apart from an opted-out one', () => {
  // Deliberately unequal counts: 2 opted out, 1 unresolved, so a partition
  // that mixed the two buckets cannot pass by coincidence.
  const recipients = [
    { userId: 'a' }, // resolves
    { userId: 'b' }, // resolves but opted out
    { userId: 'd' }, // resolves but opted out
    { userId: 'c' }, // resolves to nothing: THE LOSS
    { to: 'literal@example.org' }, // caller supplied the address
    {}, // neither
  ]
  const resolved = new Map([
    ['a', 'a@example.org'],
    ['b', 'b@example.org'],
    ['d', 'd@example.org'],
  ])
  const optedOut = new Set(['b', 'd'])

  const p = partitionRecipients(recipients, resolved, optedOut)

  assertEquals(p.addressed.map((r) => r.to), ['a@example.org', 'literal@example.org'])
  assertEquals(p.unresolvedIds, ['c'])
  assertEquals(p.optedOut, 2)
  assertEquals(p.unaddressable, 1)

  // THE WHOLE POINT. Under the old single-filter shape b, c, d and the empty
  // recipient all landed in one `skipped` count of 4 and were
  // indistinguishable, so the one person actually LOST was invisible. The old
  // shape's only available number is reconstructed here; asserting it is 4
  // while unresolved is 1 is what proves the fates are now told apart.
  assertEquals(recipients.length - p.addressed.length, 4)
  assertEquals(p.unresolvedIds.length, 1)
})

Deno.test('every recipient is accounted for exactly once', () => {
  // The invariant that makes `unresolved` trustworthy: nothing may vanish
  // between the input list and the four output buckets.
  const recipients = Array.from({ length: 424 }, (_, i) => ({ userId: `u${i}` }))
  const resolved = new Map(
    recipients.slice(0, 375).map((r) => [r.userId, `${r.userId}@example.org`] as const),
  )
  // 49 unresolved, matching the measured Perth shortfall exactly.
  const p = partitionRecipients(recipients, resolved, new Set())

  assertEquals(p.addressed.length, 375)
  assertEquals(p.unresolvedIds.length, 49)
  assertEquals(
    p.addressed.length + p.unresolvedIds.length + p.optedOut + p.unaddressable,
    recipients.length,
  )
})

Deno.test('CONTROL: a run with nothing lost reports unresolved 0', () => {
  // Without this arm a partition that counted everything as unresolved would
  // pass the tests above by always being non-zero. A healthy send must read 0,
  // because gate (b) of the P1 closes on exactly that number.
  const recipients = Array.from({ length: 800 }, (_, i) => ({ userId: `u${i}` }))
  const resolved = new Map(recipients.map((r) => [r.userId, `${r.userId}@example.org`] as const))

  const p = partitionRecipients(recipients, resolved, new Set())

  assertEquals(p.unresolvedIds.length, 0)
  assertEquals(p.unaddressable, 0)
  assertEquals(p.addressed.length, 800)
})

Deno.test('a literal address wins over resolution and is never called unresolved', () => {
  // The single-send callers pass `to` and no userId. They must not be dragged
  // into the loss count by a resolution map that does not know them.
  const p = partitionRecipients(
    [{ to: 'someone@example.org', userId: 'x' }],
    new Map(),
    new Set(),
  )
  assertEquals(p.addressed.length, 1)
  assertEquals(p.unresolvedIds.length, 0)
})

Deno.test('opt-out is checked only after an address exists', () => {
  // A member who opted out AND has no address is a loss first: fixing their
  // account is what makes the opt-out meaningful. Counting them as opted-out
  // would hide the resolution bug behind a legitimate-looking number.
  const p = partitionRecipients([{ userId: 'z' }], new Map(), new Set(['z']))
  assertEquals(p.unresolvedIds, ['z'])
  assertEquals(p.optedOut, 0)
})
