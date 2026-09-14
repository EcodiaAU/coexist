import { describe, it, expect } from 'vitest'

/**
 * Regression guard for Jess's 2026-09-14 report: "the app isn't letting me
 * invite the group chat to an event", on the Perth staff chat, for the 19 Sep
 * screening.
 *
 * The event picker in the Event Invite sheet is fed by
 * useCollectiveEvents(collectiveId). chat-leader-panel passed
 * `isCollective ? collectiveId : undefined`, so EVERY channel chat handed it
 * undefined, the query was disabled, the list came back empty, and the sheet
 * told the leader "No upcoming events found. Create an event first" while the
 * event sat published in their own collective. canSubmit requires an eventId
 * for an event_invite, so the Post button then did nothing at all.
 *
 * The fix resolves a scope collective for every chat kind. This test pins that
 * resolution, because the failure was pure wiring: a prop the interface already
 * declared (`channelCollectiveId`) was never destructured or read.
 */

const PERTH = '72feee49-cb98-406b-9d91-1c496733d6b7'
const EVENT = '91041c4c-e17a-4083-b287-c9185870a91a'

/** Mirrors chat-room.tsx: effectiveCollectiveId then the campout-event fallback. */
function resolveInviteScope(args: {
  isCollective: boolean
  collectiveId?: string
  channel?: { type: string; collective_id: string | null; event_id: string | null }
  campoutEventCollectiveId?: string | null
}): string | undefined {
  const { isCollective, collectiveId, channel, campoutEventCollectiveId } = args
  const effective = isCollective ? collectiveId : (channel?.collective_id ?? undefined)
  return effective ?? (campoutEventCollectiveId ?? undefined)
}

/** Mirrors chat-leader-panel.tsx: what the sheet actually receives. */
function sheetCollectiveId(
  isCollective: boolean,
  collectiveId: string | undefined,
  channelCollectiveId: string | undefined,
): string | undefined {
  return isCollective ? collectiveId : (channelCollectiveId ?? undefined)
}

/** The sheet's own gate: an event_invite cannot be posted without an event. */
function canSubmitEventInvite(title: string, eventId: string): boolean {
  return title.trim().length > 0 && !!eventId
}

describe('event invite scope resolves for every chat kind', () => {
  it('collective chat keeps working', () => {
    const scope = resolveInviteScope({ isCollective: true, collectiveId: PERTH })
    expect(scope).toBe(PERTH)
    expect(sheetCollectiveId(true, PERTH, scope)).toBe(PERTH)
  })

  it('staff_collective channel resolves its collective (Jess + Perth Staff, the reported case)', () => {
    const scope = resolveInviteScope({
      isCollective: false,
      channel: { type: 'staff_collective', collective_id: PERTH, event_id: null },
    })
    expect(scope).toBe(PERTH)
    // The assertion that actually catches the bug: the SHEET must get it.
    expect(sheetCollectiveId(false, undefined, scope)).toBe(PERTH)
  })

  it('carpool_breakout channel resolves its collective', () => {
    const scope = resolveInviteScope({
      isCollective: false,
      channel: { type: 'carpool_breakout', collective_id: PERTH, event_id: null },
    })
    expect(sheetCollectiveId(false, undefined, scope)).toBe(PERTH)
  })

  it('campout channel has no collective_id and falls back to its event collective', () => {
    const scope = resolveInviteScope({
      isCollective: false,
      channel: { type: 'campout', collective_id: null, event_id: EVENT },
      campoutEventCollectiveId: PERTH,
    })
    expect(sheetCollectiveId(false, undefined, scope)).toBe(PERTH)
  })

  it('staff_state and staff_national span no single collective and stay undefined', () => {
    for (const type of ['staff_state', 'staff_national']) {
      const scope = resolveInviteScope({
        isCollective: false,
        channel: { type, collective_id: null, event_id: null },
      })
      expect(scope).toBeUndefined()
      expect(sheetCollectiveId(false, undefined, scope)).toBeUndefined()
    }
  })
})

describe('the empty picker is what blocked the post', () => {
  it('an event_invite with no event cannot be submitted', () => {
    expect(canSubmitEventInvite('Join us: The Plastic Country Screening', '')).toBe(false)
  })

  it('and can be submitted once the picker yields one', () => {
    expect(canSubmitEventInvite('Join us: The Plastic Country Screening', EVENT)).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  Wiring assertions against the REAL source                          */
/*                                                                     */
/*  The cases above mirror the resolution logic, which means they pass  */
/*  whether or not the app is wired that way, and the bug WAS pure      */
/*  wiring: `channelCollectiveId` sat on the props interface, declared  */
/*  and commented, never destructured, never read. So these read the    */
/*  files and fail if that wiring is removed again. Rendering chat-room */
/*  for real needs auth, router, query-client and supabase mocks; the   */
/*  source assertion is the cheap binding that still catches a revert.  */
/* ------------------------------------------------------------------ */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

describe('the invite-scope wiring is present in source', () => {
  it('chat-leader-panel destructures channelCollectiveId', () => {
    const src = read('pages/chat/chat-leader-panel.tsx')
    const destructure = src.slice(
      src.indexOf('export function ChatLeaderPanel({'),
      src.indexOf('}: ChatLeaderPanelProps)'),
    )
    expect(destructure).toContain('channelCollectiveId')
  })

  it('chat-leader-panel feeds it to the announcement sheet instead of undefined', () => {
    const src = read('pages/chat/chat-leader-panel.tsx')
    expect(src).toContain(
      'collectiveId={isCollective ? collectiveId : (channelCollectiveId ?? undefined)}',
    )
    // The exact pre-fix line must be gone.
    expect(src).not.toContain('collectiveId={isCollective ? collectiveId : undefined}')
  })

  it('chat-room passes a resolved scope into the panel', () => {
    const src = read('pages/chat/chat-room.tsx')
    expect(src).toContain('channelCollectiveId={inviteScopeCollectiveId}')
    expect(src).toContain('const inviteScopeCollectiveId')
  })

  it('chat-room falls back to the campout event collective', () => {
    const src = read('pages/chat/chat-room.tsx')
    expect(src).toContain('campoutEvent.data?.collective_id')
  })

  it('the empty state distinguishes no-collective from no-events', () => {
    const src = read('components/create-announcement-sheet.tsx')
    expect(src).toContain('not tied to a single collective')
    expect(src).toContain('No upcoming events found')
  })
})
