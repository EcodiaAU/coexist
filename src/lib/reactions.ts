/**
 * Canonical reaction emoji set for chat messages.
 *
 * This is the ONLY place this list should live. Everywhere else
 * (UI, validation, analytics) imports REACTION_EMOJIS from here.
 *
 * Order matters: it's the order shown in the picker.
 */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'] as const

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value)
}
