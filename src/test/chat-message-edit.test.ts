import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  EDIT_WINDOW_MS,
  applyEditToPages,
  assertEdited,
  canEditMessage,
  editErrorMessage,
  isMessageEdited,
} from '@/lib/chat-edit'

/*
 * Message editing in every chat, own messages only (Tate 2026-09-24).
 *
 * Before: editing existed in collective chats only, the UI was the only guard,
 * and the database let a leader or admin rewrite anyone's words
 * (chat_update_leader) and let a member move their own message into a channel
 * they were not in. The rollback-only probe matrix run against production on
 * 2026-09-24 measured both holes (rows=1) before the migration and a 42501
 * refusal after it.
 */

const ME = 'user-me'
const NOW = Date.parse('2026-09-24T10:00:00Z')
const base = {
  id: 'm1',
  content: 'hello',
  user_id: ME,
  is_deleted: false,
  created_at: new Date(NOW - 60_000).toISOString(),
  message_type: 'text',
}

describe('canEditMessage', () => {
  it('lets the author edit their own recent text message', () => {
    expect(canEditMessage(base, ME, NOW)).toBe(true)
  })

  it('refuses someone else\'s message, whatever their role', () => {
    expect(canEditMessage(base, 'user-other', NOW)).toBe(false)
  })

  it('refuses when signed out', () => {
    expect(canEditMessage(base, null, NOW)).toBe(false)
    expect(canEditMessage(base, undefined, NOW)).toBe(false)
  })

  it('refuses an optimistic message that has no server row yet', () => {
    expect(canEditMessage({ ...base, _optimistic: true }, ME, NOW)).toBe(false)
    expect(canEditMessage({ ...base, id: 'optimistic-123' }, ME, NOW)).toBe(false)
  })

  it('refuses deleted, empty and generated messages', () => {
    expect(canEditMessage({ ...base, is_deleted: true }, ME, NOW)).toBe(false)
    expect(canEditMessage({ ...base, content: null }, ME, NOW)).toBe(false)
    for (const t of ['poll', 'announcement', 'system', 'html', 'voice', 'video', 'carpool']) {
      expect(canEditMessage({ ...base, message_type: t }, ME, NOW)).toBe(false)
    }
  })

  it('allows an image caption and a legacy row with no message_type', () => {
    expect(canEditMessage({ ...base, message_type: 'image' }, ME, NOW)).toBe(true)
    expect(canEditMessage({ ...base, message_type: null }, ME, NOW)).toBe(true)
  })

  it('keeps the original 15 minute window, now in every chat', () => {
    expect(EDIT_WINDOW_MS).toBe(15 * 60 * 1000)
    const edge = { ...base, created_at: new Date(NOW - EDIT_WINDOW_MS + 1000).toISOString() }
    const past = { ...base, created_at: new Date(NOW - EDIT_WINDOW_MS - 1000).toISOString() }
    expect(canEditMessage(edge, ME, NOW)).toBe(true)
    expect(canEditMessage(past, ME, NOW)).toBe(false)
  })
})

describe('the edited label', () => {
  it('reads edited_at, never updated_at', () => {
    expect(isMessageEdited({ edited_at: '2026-09-24T10:00:00Z' })).toBe(true)
    expect(isMessageEdited({ edited_at: null })).toBe(false)
    // A pinned message has a moved updated_at and must NOT read as edited.
    expect(isMessageEdited({ updated_at: '2026-09-24T10:00:00Z' } as { edited_at?: string | null })).toBe(false)
  })

  it('is rendered in every chat mode, not only collective', () => {
    const list = readFileSync(resolve(__dirname, '../pages/chat/chat-message-list.tsx'), 'utf8')
    expect(list).toContain('isMessageEdited(msg')
    expect(list).not.toMatch(/updated_at !== msg\.created_at/)
    // channel mode returns the bubble plus the label
    expect(list).toMatch(/return editedLabel \? \(/)
  })
})

describe('a refused edit is reported, never read as saved', () => {
  it('treats zero returned rows (RLS filtered the UPDATE) as a refusal', () => {
    expect(() => assertEdited([])).toThrow(/own messages/)
    expect(() => assertEdited(null)).toThrow()
    expect(() => assertEdited([{ id: 'm1' }])).not.toThrow()
  })

  it('maps each database refusal to plain copy', () => {
    expect(editErrorMessage(new Error('only the author can edit a message'))).toMatch(/own messages/)
    expect(editErrorMessage({ message: 'an edited message cannot be empty; delete it instead' })).toMatch(/cannot be empty/)
    expect(editErrorMessage(new Error('message too long'))).toMatch(/too long/)
    expect(editErrorMessage(new Error('socket hang up'))).toMatch(/Try again/)
  })

  it('both edit hooks ask for the updated rows and assert on them', () => {
    const collective = readFileSync(resolve(__dirname, '../hooks/use-chat.ts'), 'utf8')
    const channel = readFileSync(resolve(__dirname, '../hooks/use-staff-channels.ts'), 'utf8')
    for (const src of [collective, channel]) {
      expect(src).toMatch(/\.update\(\{ content \}\)\s*\.eq\('id', messageId\)\s*\.select\('id'\)/)
      expect(src).toContain('assertEdited(data)')
    }
    expect(channel).toContain('export function useEditChannelMessage')
  })
})

describe('applyEditToPages', () => {
  it('changes only the target message and stamps edited_at', () => {
    const pages = [[{ id: 'a', content: 'x', edited_at: null }, { id: 'b', content: 'y', edited_at: null }]]
    const out = applyEditToPages(pages, 'b', 'y2', '2026-09-24T10:00:00Z')
    expect(out[0][0]).toEqual({ id: 'a', content: 'x', edited_at: null })
    expect(out[0][1]).toEqual({ id: 'b', content: 'y2', edited_at: '2026-09-24T10:00:00Z' })
    expect(pages[0][1].content).toBe('y') // not mutated
  })
})

describe('chat room offers edit in every chat', () => {
  const room = readFileSync(resolve(__dirname, '../pages/chat/chat-room.tsx'), 'utf8')
  it('no longer gates edit on collective mode', () => {
    expect(room).not.toContain('onEdit={isCollective ? handleEdit : undefined}')
    expect(room).not.toContain('Edit bar (collective only)')
    expect(room).toContain('onEdit={canEditMessage(selectedMessage, user?.id) ? handleEdit : undefined}')
    expect(room).toContain('channelEdit.mutateAsync')
  })
})

describe('database guard (migration 20260924090000)', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../supabase/migrations/20260924090000_chat_message_edit_own_only.sql'),
    'utf8',
  )

  it('adds edited_at and a BEFORE UPDATE guard trigger', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS edited_at timestamptz')
    expect(sql).toMatch(/CREATE TRIGGER trg_chat_messages_guard_edit\s+BEFORE UPDATE ON public\.chat_messages/)
  })

  it('binds end-user sessions only, so SECURITY DEFINER moderation keeps working', () => {
    expect(sql).toContain("IF current_user NOT IN ('authenticated', 'anon') THEN")
    expect(sql).not.toMatch(/SECURITY DEFINER\s*\n\s*SET search_path TO 'public'\s*\nAS \$function\$\s*\nDECLARE\s*\n\s*v_uid/)
  })

  it('refuses a content change from anyone but the author, leaders and admins included', () => {
    expect(sql).toContain('OLD.user_id IS DISTINCT FROM v_uid')
    expect(sql).toContain("'only the author can edit a message'")
  })

  it('freezes identity so a message cannot be moved into another chat', () => {
    for (const col of ['user_id', 'collective_id', 'channel_id', 'created_at', 'message_type']) {
      expect(sql).toContain(`NEW.${col}`)
    }
  })

  it('is the only writer of edited_at', () => {
    expect(sql).toContain('NEW.edited_at := now();')
    expect(sql).toContain('NEW.edited_at := OLD.edited_at;')
  })
})
