/*
 * Message editing, shared by collective chats and every channel chat
 * (campout, staff, carpool). Tate 2026-09-24: "Add message editing in all
 * chats for all members on their own messages."
 *
 * The UI rules live here so both chat modes ask one implementation and a test
 * can pin them. They are a courtesy, not the security boundary: the database
 * trigger chat_messages_guard_edit (migration 20260924090000) refuses a content
 * change from anyone but the author, whatever RLS lets them see, and it is the
 * only thing that stamps edited_at.
 */

/** How long after sending the author can still edit. Unchanged from the
 *  original collective-only feature; applied to every chat now. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000

/** Message types whose text the author may change. Polls, announcements,
 *  system and html cards are generated content and are never editable. */
const EDITABLE_TYPES = new Set(['text', 'image'])

export interface EditableMessageShape {
  id: string
  content: string | null
  user_id: string | null
  is_deleted: boolean | null
  created_at: string | null
  message_type?: string | null
  edited_at?: string | null
  _optimistic?: boolean
}

export function canEditMessage(
  message: EditableMessageShape | null | undefined,
  userId: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!message || !userId) return false
  if (message.user_id !== userId) return false
  if (message._optimistic || message.id.startsWith('optimistic-')) return false
  if (message.is_deleted) return false
  if (!EDITABLE_TYPES.has(message.message_type ?? 'text')) return false
  if (!message.content) return false
  if (!message.created_at) return false
  return now - new Date(message.created_at).getTime() < EDIT_WINDOW_MS
}

/**
 * "(edited)" reads edited_at, which only the database sets and only when the
 * author changes the text. It used to read updated_at <> created_at, and
 * updated_at moves on EVERY update, so pinning a message labelled it edited.
 */
export function isMessageEdited(message: { edited_at?: string | null } | null | undefined): boolean {
  return !!message?.edited_at
}

/**
 * PostgREST answers an UPDATE that RLS filtered out with 200 and zero rows,
 * not an error, so an edit on a row the caller cannot touch would otherwise
 * look like it saved. Callers pass the returned rows here.
 */
export function assertEdited(rows: unknown[] | null | undefined): void {
  if (!rows || rows.length === 0) {
    throw new Error('You can only edit your own messages')
  }
}

/** Human copy for a refused edit, whichever layer refused it. */
export function editErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : ''
  if (/only the author|own messages/i.test(raw)) return 'You can only edit your own messages'
  if (/cannot be empty/i.test(raw)) return 'A message cannot be empty. Delete it instead.'
  if (/too long/i.test(raw)) return 'That message is too long'
  if (/deleted message/i.test(raw)) return 'That message was deleted'
  return 'Could not save your edit. Try again.'
}

/** Optimistically apply an edit to a paged message cache. */
export function applyEditToPages<T extends { id: string; content: string | null; edited_at?: string | null }>(
  pages: T[][],
  messageId: string,
  content: string,
  editedAt: string,
): T[][] {
  return pages.map((page) =>
    page.map((msg) => (msg.id === messageId ? { ...msg, content, edited_at: editedAt } : msg)),
  )
}
