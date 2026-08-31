import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* Kurt Jones ran the Darwin East Point Beach Clean Up on 2026-08-30, recorded
   nine walk-ins, and the day screen never moved off eleven.

   Nothing was lost. All nine rows were in event_walk_ins with status
   'attended'. The screen was reading a frozen cache: WalkInSheet writes the
   row with a raw `supabase.from('event_walk_ins').insert(...)` rather than a
   react-query mutation, so no invalidation followed it. useDeleteWalkIn
   invalidated the key, the insert never did, and the day screen's `walkIns`
   array stayed at whatever it held when the screen mounted, for the whole
   event. That single stale array produced both halves of what Kurt saw:
   `checkedInCount = roster.counts.checkedIn + walkIns.length` only ever moved
   by registered check-ins, and the walk-in list renders behind
   `walkIns.length > 0` so it never appeared at all.

   This class cannot be caught at runtime. Every query succeeds, every insert
   returns without error, the toast says "Walk-in recorded" truthfully, and the
   database is correct the entire time. The only signal is a number that fails
   to move, which looks identical to nobody having walked up. So the invariant
   is pinned to the source instead. */

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

const WALK_IN_KEY = "['event-walk-ins'"

describe('walk-in count freshness', () => {
  it('invalidates the walk-in query in every file that writes event_walk_ins', () => {
    /* A writer that does not invalidate leaves every mounted reader stale. The
       delete path always did this; the insert path is what was missing. */
    const writers = [
      'components/walk-in-sheet.tsx',
      'hooks/use-events.ts',
    ]
    for (const file of writers) {
      const src = read(file)
      const writes = /\.from\('event_walk_ins'\)\s*\n?\s*\.(insert|update|delete|upsert)\(/s.test(src)
      if (!writes) continue
      // Must be a real call, not a mention in a comment. The comment above the
      // fix names the key, so `toContain` alone would pass on a reverted fix.
      const invalidates = new RegExp(
        `invalidateQueries\\(\\{\\s*queryKey:\\s*\\${WALK_IN_KEY}`,
      ).test(src)
      expect(invalidates, `${file} writes event_walk_ins without invalidating ${WALK_IN_KEY}`).toBe(true)
    }
  })

  it('invalidates the walk-in query on the insert path specifically', () => {
    const src = read('components/walk-in-sheet.tsx')
    expect(src).toContain(".from('event_walk_ins').insert(")
    expect(src).toContain(`invalidateQueries({ queryKey: ${WALK_IN_KEY}, eventId] })`)
  })

  it('polls walk-ins while the check-in gate is open', () => {
    /* Several staff check people in from their own phones at once. A walk-in
       recorded on one device reaches another only by a refetch, and a native
       build fires no window-focus event, so the hook has to poll. */
    const src = read('hooks/use-events.ts')
    const hook = src.slice(src.indexOf('export function useEventWalkIns'))
    const body = hook.slice(0, hook.indexOf('export function useDeleteWalkIn'))
    expect(body).toMatch(/refetchInterval:/)
  })

  it('refreshes the roster and walk-ins when the app resumes', () => {
    /* A leader who backgrounds the app mid-event must not come back to the
       tallies from before they left. */
    const src = read('hooks/use-app-lifecycle.ts')
    const set = src.slice(
      src.indexOf('RESUME_REFRESH_PREFIXES'),
      src.indexOf('SLOW_RESUME_THRESHOLD_MS'),
    )
    expect(set).toContain("'event-walk-ins'")
    expect(set).toContain("'event-roster'")
  })

  it('counts walk-ins into attendance wherever attendance is shown', () => {
    /* event_registrations alone is half of attendance. The canonical engine
       coexist_attendance_metrics() is registered-attended UNION ALL walk-ins,
       and every surface that shows a turnout number owes the same union.
       log-impact was the last one reading registrations only, and its number
       is not merely displayed: it is the default written to
       event_impact.attendees and the divisor in the hours total. */
    const src = read('pages/events/log-impact.tsx')
    expect(src).toContain('useEventWalkIns')
    const memo = src.slice(src.indexOf('const checkedInCount = useMemo'))
    expect(memo.slice(0, 400)).toMatch(/walkIns/)
  })
})
