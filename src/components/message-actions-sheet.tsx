import { useState, useEffect } from 'react'
import { Reply, Pencil, Pin, Trash2, Flag, ShieldOff } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { cn } from '@/lib/cn'
import { REACTION_EMOJIS, type ReactionEmoji } from '@/lib/reactions'

/* ------------------------------------------------------------------ */
/*  Shared message shape  works for both collective & channel msgs    */
/* ------------------------------------------------------------------ */

export interface ActionableMessage {
  id: string
  content: string | null
  user_id: string | null
  is_pinned: boolean | null
  is_deleted: boolean | null
  created_at: string | null
  message_type?: string | null
  _optimistic?: boolean
}

/* ------------------------------------------------------------------ */
/*  MessageActionsSheet                                                */
/* ------------------------------------------------------------------ */

function canEdit(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 15 * 60 * 1000
}

interface MessageActionsProps {
  message: ActionableMessage | null
  isModerator: boolean
  isOwnMessage: boolean
  onClose: () => void
  onReply: () => void
  onEdit?: () => void
  onDelete: () => void
  onPin?: () => void
  onReport?: () => void
  onBlockUser?: () => void
  /**
   * 1.8.5 polish (10 May 2026): the "add a reaction" affordance moved from
   * an always-visible row under every message into this sheet. When provided,
   * a 6-emoji react row renders at the top of the actions list. Tapping an
   * emoji toggles the reaction (add yours / remove yours) and closes the
   * sheet. Wired only in collective mode for non-optimistic messages.
   */
  onReact?: (emoji: ReactionEmoji) => void
}

export function MessageActionsSheet({
  message,
  isModerator,
  isOwnMessage,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onReport,
  onBlockUser,
  onReact,
}: MessageActionsProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Reset delete confirmation when the sheet closes or a different message is selected
  useEffect(() => {
    if (!message) setConfirmingDelete(false)
  }, [message])

  if (!message) return null

  const canDelete = isOwnMessage || isModerator

  return (
    <BottomSheet open={!!message} onClose={onClose}>
      {/* Fixed min-height so the sheet never shrinks/flickers between states */}
      <div className="min-h-[296px] flex flex-col">
        {confirmingDelete ? (
          /* ── Delete confirmation view ── */
          <div className="flex flex-1 flex-col items-center px-5 pb-4 pt-2 text-center">
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-100"
              aria-hidden="true"
            >
              <Trash2 size={24} className="text-error-600" />
            </div>

            <h3 className="font-heading text-lg font-semibold text-neutral-900">
              Delete this message?
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              This message will be permanently removed for everyone in the chat.
            </p>

            <div className="mt-6 flex w-full flex-col gap-2">
              <Button
                variant="danger"
                fullWidth
                onClick={() => {
                  onDelete()
                  onClose()
                }}
                aria-label="Delete Message"
              >
                Delete Message
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setConfirmingDelete(false)}
                aria-label="Cancel"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* ── Actions list view ── */
          <div className="space-y-1 pb-2">
            {/* React row (collective only). 1.8.5 polish (10 May 2026):
                replaces the always-visible reaction picker that used to sit
                under every message bubble. Tapping toggles + closes. */}
            {onReact && (
              <div
                className="mx-1 mb-2 flex items-center justify-around rounded-2xl bg-neutral-50 px-2 py-2 ring-1 ring-neutral-100"
                role="group"
                aria-label="React with emoji"
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(emoji)
                      onClose()
                    }}
                    aria-label={`React with ${emoji}`}
                    className={cn(
                      'flex items-center justify-center min-h-11 min-w-11 rounded-full',
                      'text-2xl leading-none',
                      'hover:bg-white active:scale-[0.88]',
                      'transition-transform duration-100 cursor-pointer select-none',
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onReply}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 min-h-11 text-sm text-neutral-800 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
            >
              <Reply size={18} className="text-neutral-400" />
              Reply
            </button>

            {onEdit && isOwnMessage && message.content && message.created_at && canEdit(message.created_at) && (
              <button
                type="button"
                onClick={onEdit}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 min-h-11 text-sm text-neutral-800 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
              >
                <Pencil size={18} className="text-neutral-400" />
                Edit message
              </button>
            )}

            {onPin && isModerator && (
              <button
                type="button"
                onClick={onPin}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 min-h-11 text-sm text-neutral-800 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
              >
                <Pin size={18} className="text-neutral-400" />
                {message.is_pinned ? 'Unpin message' : 'Pin message'}
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 min-h-11 text-sm text-error-600 hover:bg-error-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
              >
                <Trash2 size={18} />
                Delete message
              </button>
            )}

            {/* ── Report & Block (only for other users' messages) ── */}
            {!isOwnMessage && (
              <>
                <div className="mx-4 my-1 border-t border-neutral-100" />

                {onReport && (
                  <button
                    type="button"
                    onClick={onReport}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 min-h-11 text-sm text-warning-700 hover:bg-warning-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                  >
                    <Flag size={18} />
                    Report message
                  </button>
                )}

                {onBlockUser && (
                  <button
                    type="button"
                    onClick={onBlockUser}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 min-h-11 text-sm text-error-600 hover:bg-error-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                  >
                    <ShieldOff size={18} />
                    Block user
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
