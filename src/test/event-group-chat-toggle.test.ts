import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  effectiveGroupChatEnabled,
  eventChatCopy,
  groupChatToggleDescription,
  isArchivedEventChat,
  isGroupChatLocked,
} from '@/lib/event-group-chat'

/*
 * Per-event group chat toggle (Tate 2026-09-24).
 *
 * "Add a feature to the event creation that Jess can use to toggle on/off if an
 * event creates a groupchat for the registered people. The campouts already
 * automatically make group chats." First real use: Hannah's Brisbane North
 * Stradbroke Island Trip, a clean-up with ~25 going and no tickets.
 *
 * The camp-out chat mechanism is GENERALISED, not duplicated: the same
 * chat_channels type 'campout', the same ensure function, widened by
 * events.group_chat_enabled. The database behaviour is proven by the
 * rollback-only matrix in scripts/event-group-chat-matrix.mjs; these tests pin
 * the rules that matrix exercises so a later edit cannot quietly undo them.
 */

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')
const sql = read('../../supabase/migrations/20260924120000_event_group_chat_toggle.sql')
// Executable SQL only: the header explains the rejected alternatives by name.
const code = sql.replace(/--[^\n]*/g, '')
const createEvent = read('../pages/events/create-event.tsx')
const editEvent = read('../pages/events/edit-event.tsx')
const staffHook = read('../hooks/use-staff-channels.ts')
const chatRoom = read('../pages/chat/chat-room.tsx')
const messageList = read('../pages/chat/chat-message-list.tsx')
const matrix = read('../../scripts/event-group-chat-matrix.mjs')

const between = (text: string, from: string, to: string) =>
  text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)))

describe('the toggle in the event form', () => {
  it('is locked on for a camp-out, which always has a chat', () => {
    expect(isGroupChatLocked('camp_out')).toBe(true)
    expect(effectiveGroupChatEnabled('camp_out', false)).toBe(true)
    expect(groupChatToggleDescription('camp_out')).toMatch(/always/i)
  })

  it('follows the organiser for every other activity', () => {
    expect(isGroupChatLocked('clean_up')).toBe(false)
    expect(effectiveGroupChatEnabled('clean_up', false)).toBe(false)
    expect(effectiveGroupChatEnabled('clean_up', true)).toBe(true)
  })

  it('treats an unchosen activity as not a camp-out', () => {
    expect(isGroupChatLocked('')).toBe(false)
    expect(effectiveGroupChatEnabled('', false)).toBe(false)
  })

  it('is sent on create, including every recurring occurrence', () => {
    const insert = between(createEvent, 'const baseInsert = {', 'const event = await createEvent')
    expect(insert).toContain(
      'group_chat_enabled: effectiveGroupChatEnabled(form.fields.activity_type, extra.group_chat_enabled)',
    )
    // Recurring rows are built by spreading baseInsert.
    expect(createEvent).toMatch(/\.\.\.baseInsert,/)
  })

  it('is on the create wizard and survives a duplicate', () => {
    expect(createEvent).toContain('data-testid="event-group-chat-toggle"')
    expect(createEvent).toContain('group_chat_enabled: false,')
    expect(createEvent).toContain('group_chat_enabled: (source as { group_chat_enabled?: boolean | null }).group_chat_enabled ?? false')
  })

  it('is on the edit page and sent by both Save and Publish, never by the day-of edit', () => {
    expect(editEvent).toContain('data-testid="event-group-chat-toggle"')
    const sent = editEvent.match(/group_chat_enabled: effectiveGroupChatEnabled\(form\.fields\.activity_type, groupChatEnabled\)/g) ?? []
    expect(sent).toHaveLength(2)
    const dayOf = between(editEvent, 'if (isDayOfMode) {', '} else {')
    expect(dayOf).not.toContain('group_chat_enabled')
  })
})

describe('what an event chat calls itself', () => {
  it('keeps the camp-out wording for a camp-out and for an unknown event', () => {
    expect(eventChatCopy('camp_out').title).toBe('Campout group chat')
    expect(eventChatCopy(null).isCampout).toBe(true)
    expect(eventChatCopy(undefined).placeholder).toBe('Message the campout...')
  })

  it('never calls a clean-up chat a campout', () => {
    const copy = eventChatCopy('clean_up')
    expect(copy.isCampout).toBe(false)
    for (const text of [copy.title, copy.emptyBody, copy.placeholder, copy.ariaLabel, copy.cardSubtitle, copy.sectionLabel, copy.rowLabel]) {
      expect(text.toLowerCase()).not.toContain('campout')
    }
  })

  it('reads the wording from the event, not the channel type, in the room', () => {
    expect(chatRoom).not.toContain("'Message the campout...'")
    expect(chatRoom).toContain('eventChat.placeholder')
    expect(messageList).not.toContain('Say hi to everyone coming to this campout')
    expect(messageList).toContain('eventChatCopy(channelActivityType)')
    expect(staffHook).toMatch(/events\(title, cover_image_url[^)]*, activity_type\)/)
    expect(staffHook).toContain('activity_type: ch.events?.activity_type ?? null')
  })
})

describe('switching the chat off', () => {
  it('hides an archived event chat, and only an event chat', () => {
    expect(isArchivedEventChat('campout', 'archived')).toBe(true)
    expect(isArchivedEventChat('campout', 'open')).toBe(false)
    // Carpool breakouts have their own archive sweep; their visibility is unchanged.
    expect(isArchivedEventChat('carpool_breakout', 'archived')).toBe(false)
  })

  it('filters the list, the unread badge and the event card', () => {
    expect(staffHook).toContain('if (isArchivedEventChat(ch.type, ch.lifecycle_status)) return null')
    expect(staffHook).toContain('isArchivedEventChat(m.chat_channels.type, m.chat_channels.lifecycle_status)) continue')
    expect(staffHook).toMatch(/\.eq\('type', 'campout'\)\s+\.eq\('lifecycle_status', 'open'\)/)
  })

  it('archives a chat with history and deletes only an empty one', () => {
    const off = between(sql, 'FUNCTION public.tg_ensure_campout_chat_channel', 'PERFORM public.ensure_campout_chat_channel(NEW.id)')
    expect(off).toContain('OLD.group_chat_enabled IS TRUE')
    expect(off).toMatch(/DELETE FROM public\.chat_channels[\s\S]*NOT EXISTS \(SELECT 1 FROM public\.chat_messages m WHERE m\.channel_id = cc\.id\)[\s\S]*NOT EXISTS \(SELECT 1 FROM public\.carpool_widgets/)
    expect(off).toContain("SET lifecycle_status = 'archived'")
  })

  it('revives the archived chat when switched back on', () => {
    const ensure = between(sql, 'FUNCTION public.ensure_campout_chat_channel', 'FUNCTION public.tg_ensure_campout_chat_channel')
    expect(ensure).toMatch(/IF v_reg_driven AND v_lifecycle = 'archived' THEN\s+UPDATE public\.chat_channels\s+SET lifecycle_status = 'open'/)
  })
})

describe('who is in the chat (migration 20260924120000)', () => {
  const ensure = between(sql, 'FUNCTION public.ensure_campout_chat_channel', 'FUNCTION public.tg_ensure_campout_chat_channel')

  it('adds the column off by default, so no existing event changes', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS group_chat_enabled boolean NOT NULL DEFAULT false')
  })

  it('widens the one existing mechanism instead of adding a second', () => {
    expect(ensure).toContain("v_reg_driven := COALESCE(v_event.activity_type::text, '') <> 'camp_out'")
    expect(ensure).toContain('AND v_event.group_chat_enabled IS TRUE')
    expect(ensure).toContain("VALUES ('campout', p_event_id, NULL, v_title)")
    expect(code).not.toMatch(/chat_channels_type_check/)
  })

  it('keeps a camp-out ticket-driven: registrations are read only for a toggle-driven chat', () => {
    // Measured before the migration: unioning registrations into the 7 live
    // camp-out chats would have added 3 ticketless people to a paid chat.
    const beforeToggleBranch = ensure.slice(0, ensure.indexOf('IF v_reg_driven THEN'))
    expect(beforeToggleBranch).not.toContain('event_registrations')
    expect(ensure.slice(ensure.indexOf('IF v_reg_driven THEN'))).toContain('FROM public.event_registrations r')
  })

  it('counts only people going, never invited or waitlisted', () => {
    expect(code).not.toMatch(/'invited'|'waitlisted'/)
    const regs = sql.match(/r\.status IN \(([^)]*)\)/g) ?? []
    expect(regs.length).toBeGreaterThan(0)
    for (const r of regs) expect(r).toBe("r.status IN ('registered', 'attended')")
  })

  it('lets the host collective leaders in, so the organiser is never locked out', () => {
    expect(ensure).toMatch(/cm\.collective_id = v_event\.collective_id\s+AND cm\.status = 'active'\s+AND cm\.role IN \('leader', 'co_leader', 'assist_leader'\)/)
  })

  it('keeps the chat in step as people register, cancel, move or are deleted', () => {
    expect(sql).toContain('AFTER INSERT OR DELETE OR UPDATE OF status, event_id, user_id ON public.event_registrations')
    const sync = between(sql, 'FUNCTION public.sync_event_group_chat_member', 'FUNCTION public.tg_event_registration_group_chat')
    expect(sync).toContain('IF public._event_chat_wants_member(p_event, p_user) THEN')
    expect(sync).toContain("lifecycle_status = 'open'")
  })

  it('never drops a national, a ticket holder, a going registrant or a host leader, from any path', () => {
    const wants = between(sql, 'FUNCTION public._event_chat_wants_member', '-- 3. Create')
    expect(wants).toContain('public._is_national_role(pr.role::text)')
    expect(wants).toContain("t.status IN ('confirmed', 'checked_in')")
    expect(wants).toContain("r.status IN ('registered', 'attended')")
    expect(wants).toContain("cm.role IN ('leader', 'co_leader', 'assist_leader')")
    const reconcile = between(sql, 'FUNCTION public.reconcile_ticket_membership', '$function$;')
    expect(reconcile).toContain('and not public._event_chat_wants_member(p_event, p_user)')
    const demote = between(sql, 'FUNCTION public.sync_national_role_to_campout_channels', '$function$;')
    expect(demote).toContain('AND NOT public._event_chat_wants_member(cc.event_id, NEW.id)')
  })

  it('does not let a client call the membership helpers', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._event_chat_wants_member(uuid, uuid) FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.sync_event_group_chat_member(uuid, uuid) FROM PUBLIC, anon, authenticated')
  })
})

describe('the rollback-only matrix', () => {
  it('always ends in an exception, so nothing it writes can persist', () => {
    expect(matrix).toContain("RAISE EXCEPTION 'MATRIX PASS: % assertions (rolled back)', passed")
  })

  it('carries a mutation control that must fail without the migration', () => {
    expect(matrix).toContain("process.argv.includes('--control')")
    expect(matrix).toContain('MATRIX FAIL C1: toggled published event has no chat')
  })

  it('asserts the cases the brief names', () => {
    for (const c of ['C2b', 'C2c', 'C3:', 'C3c', 'C6:', 'C7b', 'C10:', 'C13c', 'C13d', 'C13e', 'C14b', 'C14c']) {
      expect(matrix).toContain(`MATRIX FAIL ${c}`)
    }
  })
})
