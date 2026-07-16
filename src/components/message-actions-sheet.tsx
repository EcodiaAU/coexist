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
  /**
   * Emojis the current user has already applied to this message. Used to
   * highlight them in the react row so that "tap to remove" (unreact) is a
   * discoverable, explicit action rather than a hidden second-tap, matching
   * the iMessage / Slack pattern. Added 22 Jun 2026.
   */
  activeReactions?: string[]
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
  activeReactions,
}: MessageActionsProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Reset delete confirmation when the sheet closes or a different message is selected
  useEffect(() => {
    if (!message) setConfirmingDelete(false)
  }, [message])

  if (!message) return null

  const canDelete = isOwnMessage || isModerator

  return (
    <BottomSheet data-eos-id="src/components/message-actions-sheet.tsx#0" data-eos-v="2" open={!!message} onClose={onClose}>
      {/* Fixed min-height so the sheet never shrinks/flickers between states */}
      <div data-eos-id="src/components/message-actions-sheet.tsx#1" className="min-h-[296px] flex flex-col">
        {confirmingDelete ? (
          /* ── Delete confirmation view ── */
          <div data-eos-id="src/components/message-actions-sheet.tsx#2" className="flex flex-1 flex-col items-center px-5 pb-4 pt-2 text-center">
            <div data-eos-id="src/components/message-actions-sheet.tsx#3"
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-100"
              aria-hidden="true"
            >
              <Trash2 data-eos-id="src/components/message-actions-sheet.tsx#4" size={24} className="text-error-600" />
            </div>

            <h3 data-eos-id="src/components/message-actions-sheet.tsx#5" className="font-heading text-lg font-semibold text-neutral-900">
              Delete this message?
            </h3>

            <p data-eos-id="src/components/message-actions-sheet.tsx#6" className="mt-2 text-sm leading-relaxed text-neutral-500">
              This message will be permanently removed for everyone in the chat.
            </p>

            <div data-eos-id="src/components/message-actions-sheet.tsx#7" className="mt-6 flex w-full flex-col gap-2">
              <Button data-eos-id="src/components/message-actions-sheet.tsx#8"
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
              <Button data-eos-id="src/components/message-actions-sheet.tsx#9"
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
          <div data-eos-id="src/components/message-actions-sheet.tsx#10" className="space-y-1 pb-2">
            {/* React row (collective only). 1.8.5 polish (10 May 2026):
                replaces the always-visible reaction picker that used to sit
                under every message bubble. Tapping toggles + closes. */}
            {onReact && (
              <div data-eos-id="src/components/message-actions-sheet.tsx#11"
                className="mx-1 mb-2 flex items-center justify-around rounded-md bg-neutral-50 px-2 py-2 ring-1 ring-neutral-100"
                role="group"
                aria-label="React with emoji"
              >
                {REACTION_EMOJIS.map((emoji) => {
                  const isActive = activeReactions?.includes(emoji) ?? false
                  return (
                    <button data-eos-id="src/components/message-actions-sheet.tsx#12"
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(emoji)
                        onClose()
                      }}
                      aria-pressed={isActive}
                      aria-label={
                        isActive
                          ? `Remove your ${emoji} reaction`
                          : `React with ${emoji}`
                      }
                      className={cn(
                        'flex items-center justify-center min-h-11 min-w-11 rounded-full',
                        'text-2xl leading-none',
                        'active:scale-[0.88]',
                        'transition-transform duration-100 cursor-pointer select-none',
                        isActive
                          ? 'bg-primary-100 ring-2 ring-primary-400'
                          : 'hover:bg-white',
                      )}
                    >
                      {emoji}
                    </button>
                  )
                })}
              </div>
            )}

            <button data-eos-id="src/components/message-actions-sheet.tsx#13"
              type="button"
              onClick={onReply}
              className="flex w-full items-center gap-3 rounded-sm px-4 py-3 min-h-11 text-sm text-neutral-800 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
            >
              <Reply data-eos-id="src/components/message-actions-sheet.tsx#14" size={18} className="text-neutral-400" />
              Reply
            </button>

            {onEdit && isOwnMessage && message.content && message.created_at && canEdit(message.created_at) && (
              <button data-eos-id="src/components/message-actions-sheet.tsx#15"
                type="button"
                onClick={onEdit}
                className="flex w-full items-center gap-3 rounded-sm px-4 py-3 min-h-11 text-sm text-neutral-800 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
              >
                <Pencil data-eos-id="src/components/message-actions-sheet.tsx#16" size={18} className="text-neutral-400" />
                Edit message
              </button>
            )}

            {onPin && isModerator && (
              <button data-eos-id="src/components/message-actions-sheet.tsx#17" data-eos-var="message.is_pinned" data-eos-var-label="Is pinned" data-eos-var-scope="prop"
                type="button"
                onClick={onPin}
                className="flex w-full items-center gap-3 rounded-sm px-4 py-3 min-h-11 text-sm text-neutral-800 hover:bg-neutral-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
              >
                <Pin data-eos-id="src/components/message-actions-sheet.tsx#18" size={18} className="text-neutral-400" />
                {message.is_pinned ? 'Unpin message' : 'Pin message'}
              </button>
            )}

            {canDelete && (
              <button data-eos-id="src/components/message-actions-sheet.tsx#19"
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex w-full items-center gap-3 rounded-sm px-4 py-3 min-h-11 text-sm text-error-600 hover:bg-error-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
              >
                <Trash2 data-eos-id="src/components/message-actions-sheet.tsx#20" size={18} />
                Delete message
              </button>
            )}

            {/* ── Report & Block (only for other users' messages) ── */}
            {!isOwnMessage && (
              <>
                <div data-eos-id="src/components/message-actions-sheet.tsx#21" className="mx-4 my-1 border-t border-neutral-100" />

                {onReport && (
                  <button data-eos-id="src/components/message-actions-sheet.tsx#22"
                    type="button"
                    onClick={onReport}
                    className="flex w-full items-center gap-3 rounded-sm px-4 py-3 min-h-11 text-sm text-warning-700 hover:bg-warning-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                  >
                    <Flag data-eos-id="src/components/message-actions-sheet.tsx#23" size={18} />
                    Report message
                  </button>
                )}

                {onBlockUser && (
                  <button data-eos-id="src/components/message-actions-sheet.tsx#24"
                    type="button"
                    onClick={onBlockUser}
                    className="flex w-full items-center gap-3 rounded-sm px-4 py-3 min-h-11 text-sm text-error-600 hover:bg-error-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
                  >
                    <ShieldOff data-eos-id="src/components/message-actions-sheet.tsx#25" size={18} />
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
