import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { AtSign } from 'lucide-react'
import { useCollectiveMembers } from '@/hooks/use-collective'
import { Avatar } from '@/components/avatar'
import { cn } from '@/lib/cn'

export interface MentionCandidate {
  user_id: string
  display_name: string
  avatar_url: string | null
}

interface MentionPickerProps {
  collectiveId: string | undefined
  /** Raw query string after the active `@`. Example: "ja" matches "Jamie". */
  query: string
  /** Whether the picker should be visible (active mention in progress). */
  open: boolean
  /** Selection callback. Picker passes the chosen candidate back. */
  onPick: (candidate: MentionCandidate) => void
  /** Close without selection (e.g. blur, escape). */
  onClose: () => void
  /** Hide own user from suggestions. */
  selfUserId?: string
}

const DEBOUNCE_MS = 250
const MAX_SUGGESTIONS = 6

/**
 * Debounce a value so we don't refilter the candidate list on every keystroke.
 * The underlying useCollectiveMembers query is cached locally; we throttle
 * the filter pass + re-render so the picker feels calm rather than flooding.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * @mention typeahead picker.
 *
 * Shows up to MAX_SUGGESTIONS matching collective members above the message
 * input. Matching is case-insensitive substring on display_name. Empty query
 * shows the most recently-active members (the natural ordering returned by
 * the members hook).
 */
export function MentionPicker({
  collectiveId,
  query,
  open,
  onPick,
  onClose,
  selfUserId,
}: MentionPickerProps) {
  const shouldReduceMotion = useReducedMotion()
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS)
  const { data: members } = useCollectiveMembers(collectiveId)

  const candidates = useMemo<MentionCandidate[]>(() => {
    if (!members) return []
    const q = debouncedQuery.trim().toLowerCase()
    const out: MentionCandidate[] = []
    for (const member of members) {
      const profile = member.profiles
      if (!profile?.id || !profile.display_name) continue
      if (selfUserId && profile.id === selfUserId) continue
      const name = profile.display_name
      if (q && !name.toLowerCase().includes(q)) continue
      out.push({
        user_id: profile.id,
        display_name: name,
        avatar_url: profile.avatar_url ?? null,
      })
      if (out.length >= MAX_SUGGESTIONS) break
    }
    return out
  }, [members, debouncedQuery, selfUserId])

  return (
    <AnimatePresence>
      {open && candidates.length > 0 && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="px-3 pb-2"
          role="listbox"
          aria-label="Mention suggestions"
        >
          <div className="rounded-2xl bg-white shadow-lg ring-1 ring-neutral-200 overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 border-b border-primary-100">
              <AtSign size={12} className="text-primary-500" />
              <p className="text-[11px] font-bold text-primary-700">
                Mention a member{debouncedQuery ? ` matching "${debouncedQuery}"` : ''}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto text-[11px] font-semibold text-neutral-500 hover:text-neutral-700 cursor-pointer select-none px-1.5 py-0.5"
                aria-label="Close mention picker"
              >
                Esc
              </button>
            </div>
            <ul className="max-h-56 overflow-y-auto overscroll-contain">
              {candidates.map((c) => (
                <li key={c.user_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Prevent the textarea from losing focus before the
                      // click resolves. Without this, blur fires first, the
                      // picker collapses, the click never lands.
                      e.preventDefault()
                    }}
                    onClick={() => onPick(c)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 min-h-11 text-left',
                      'hover:bg-neutral-50 active:bg-neutral-100',
                      'transition-colors duration-100 cursor-pointer select-none',
                      'focus-visible:outline-none focus-visible:bg-primary-50',
                    )}
                    role="option"
                    aria-selected="false"
                  >
                    <Avatar
                      src={c.avatar_url ?? undefined}
                      name={c.display_name}
                      size="sm"
                    />
                    <span className="text-sm font-semibold text-neutral-900 truncate flex-1">
                      {c.display_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Mention parsing helpers                                            */
/* ------------------------------------------------------------------ */

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
  // Walk back from caret to find the most recent `@` that starts a mention.
  let i = caret - 1
  while (i >= 0) {
    const ch = text[i]
    if (ch === '@') {
      // `@` must be at start or preceded by whitespace.
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
    // Display names can include spaces and unicode. Escape regex metachars.
    const escaped = c.display_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match `@Name` not preceded by alpha-numeric (avoids "email@me" matching).
    const re = new RegExp(`(^|[^A-Za-z0-9])@${escaped}(?![A-Za-z0-9])`)
    if (re.test(content)) {
      found.add(c.user_id)
    }
  }
  return Array.from(found)
}
