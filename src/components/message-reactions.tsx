import { useCallback } from 'react'
import { cn } from '@/lib/cn'
import type { ReactionEmoji } from '@/lib/reactions'
import {
  useMessageReactions,
  useToggleReaction,
} from '@/hooks/use-message-reactions'

/* ------------------------------------------------------------------ */
/*  MessageReactions row                                               */
/*                                                                     */
/*  1.8.5 polish (10 May 2026): the always-visible "+ SmilePlus"       */
/*  add-reaction picker was pushing chat layout down under every       */
/*  message. The "add a reaction" affordance now lives in the          */
/*  message-actions-sheet (long-press / tap-and-hold), aligning with   */
/*  iMessage / Slack / Discord patterns. This component is now         */
/*  display-only: it renders existing reactions when any exist, or     */
/*  returns null. Tapping an existing reaction badge still toggles     */
/*  (add yours / remove yours) - that affordance is preserved.         */
/* ------------------------------------------------------------------ */

interface MessageReactionsProps {
  messageId: string
  collectiveId: string
  /** Whether this message was sent by the current user (controls alignment). */
  sent: boolean
  /** Skip rendering when the message is optimistic and has no real id yet. */
  disabled?: boolean
}

export function MessageReactions({
  messageId,
  collectiveId,
  sent,
  disabled = false,
}: MessageReactionsProps) {
  const groups = useMessageReactions(messageId, collectiveId)
  const toggle = useToggleReaction()

  const handleToggle = useCallback(
    (emoji: ReactionEmoji) => {
      if (disabled) return
      toggle.mutate({ messageId, collectiveId, emoji })
    },
    [toggle, messageId, collectiveId, disabled],
  )

  if (disabled) return null
  // Display-only: when no reactions exist, render nothing. The "add"
  // affordance lives in MessageActionsSheet (long-press).
  if (groups.length === 0) return null

  return (
    <div data-eos-id="src/components/message-reactions.tsx#0" data-eos-v="2"
      className={cn(
        'mt-1 flex flex-wrap items-center gap-1.5',
        sent ? 'justify-end pr-1' : 'justify-start pl-10',
      )}
    >
      {groups.map((g) => (
        <button data-eos-id="src/components/message-reactions.tsx#1"
          key={g.emoji}
          type="button"
          onClick={() => handleToggle(g.emoji as ReactionEmoji)}
          aria-pressed={g.userReacted}
          aria-label={`${g.emoji} ${g.count} ${g.count === 1 ? 'reaction' : 'reactions'}${g.userReacted ? ', tap to remove yours' : ', tap to add yours'}`}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 min-h-7',
            'text-xs font-semibold tabular-nums',
            'transition-transform duration-150 active:scale-[0.98] cursor-pointer select-none',
            g.userReacted
              ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
              : 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50',
          )}
        >
          <span data-eos-id="src/components/message-reactions.tsx#2" data-eos-var="g.emoji" data-eos-var-label="Emoji" data-eos-var-scope="item" className="text-sm leading-none">{g.emoji}</span>
          <span data-eos-id="src/components/message-reactions.tsx#3" data-eos-var="g.count" data-eos-var-label="Count" data-eos-var-scope="item">{g.count}</span>
        </button>
      ))}
    </div>
  )
}
