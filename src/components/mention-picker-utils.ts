/**
 * Helpers for the @mention picker. Lives in a separate file from
 * mention-picker.tsx so React Fast Refresh can fast-reload the component
 * without invalidating the whole module graph (lint rule
 * react-refresh/only-export-components).
 */

export interface MentionCandidate {
  user_id: string
  display_name: string
  avatar_url: string | null
}

/**
 * Detect an active `@mention` in progress at the caret position.
 *
 * Returns null if the caret isn't immediately after an `@`-prefixed word.
 * Returns the query (text between `@` and caret) plus the start index of
 * the `@` so the caller can splice in the chosen display name.
 *
 * Rules:
 * - `@` must be at start of input or immediately after whitespace
 * - The query may be empty (just `@`) - shows all members
 * - Whitespace inside the query terminates the mention
 */
export function detectActiveMention(
  text: string,
  caret: number,
): { atIndex: number; query: string } | null {
  let i = caret - 1
  while (i >= 0) {
    const ch = text[i]
    if (ch === '@') {
      if (i === 0 || /\s/.test(text[i - 1] ?? '')) {
        return { atIndex: i, query: text.slice(i + 1, caret) }
      }
      return null
    }
    if (/\s/.test(ch)) return null
    i -= 1
  }
  return null
}

/**
 * Replace the in-progress mention at `atIndex` with a finalised
 * `@DisplayName ` token (with trailing space so caret advances past it).
 *
 * Returns the new text and the caret position after the inserted name.
 */
export function applyMention(
  text: string,
  atIndex: number,
  caret: number,
  displayName: string,
): { text: string; caret: number } {
  const before = text.slice(0, atIndex)
  const after = text.slice(caret)
  const inserted = `@${displayName} `
  return {
    text: before + inserted + after,
    caret: atIndex + inserted.length,
  }
}

/**
 * Find every `@DisplayName` in a finalised message and resolve to user_ids
 * using the supplied candidates list (collective members).
 *
 * Greedy match: longest display_name first so "@Jamie Smith" beats "@Jamie".
 */
export function resolveMentionedUserIds(
  content: string,
  candidates: MentionCandidate[],
): string[] {
  if (!candidates.length) return []
  const sorted = [...candidates].sort(
    (a, b) => b.display_name.length - a.display_name.length,
  )
  const found = new Set<string>()
  for (const c of sorted) {
    const escaped = c.display_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[^A-Za-z0-9])@${escaped}(?![A-Za-z0-9])`)
    if (re.test(content)) {
      found.add(c.user_id)
    }
  }
  return Array.from(found)
}
