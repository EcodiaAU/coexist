import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { AtSign } from 'lucide-react'
import { useCollectiveMembers } from '@/hooks/use-collective'
import { Avatar } from '@/components/avatar'
import { cn } from '@/lib/cn'
import type { MentionCandidate } from '@/components/mention-picker-utils'

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
    <AnimatePresence data-eos-id="src/components/mention-picker.tsx#0" data-eos-v="2">
      {open && candidates.length > 0 && (
        <motion.div data-eos-id="src/components/mention-picker.tsx#1"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="px-3 pb-2"
          role="listbox"
          aria-label="Mention suggestions"
        >
          <div data-eos-id="src/components/mention-picker.tsx#2" className="rounded-md bg-white shadow-sm ring-1 ring-neutral-200 overflow-hidden">
            <div data-eos-id="src/components/mention-picker.tsx#3" className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 border-b border-primary-100">
              <AtSign data-eos-id="src/components/mention-picker.tsx#4" size={12} className="text-primary-500" />
              <p data-eos-id="src/components/mention-picker.tsx#5" className="text-[11px] font-bold text-primary-700">
                Mention a member{debouncedQuery ? ` matching "${debouncedQuery}"` : ''}
              </p>
              <button data-eos-id="src/components/mention-picker.tsx#6"
                type="button"
                onClick={onClose}
                className="ml-auto text-[11px] font-semibold text-neutral-500 hover:text-neutral-700 cursor-pointer select-none px-1.5 py-0.5"
                aria-label="Close mention picker"
              >
                Esc
              </button>
            </div>
            <ul data-eos-id="src/components/mention-picker.tsx#7" className="max-h-56 overflow-y-auto overscroll-contain">
              {candidates.map((c) => (
                <li data-eos-id="src/components/mention-picker.tsx#8" key={c.user_id}>
                  <button data-eos-id="src/components/mention-picker.tsx#9"
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
                    <Avatar data-eos-id="src/components/mention-picker.tsx#10"
                      src={c.avatar_url ?? undefined}
                      name={c.display_name}
                      size="sm"
                    />
                    <span data-eos-id="src/components/mention-picker.tsx#11" data-eos-var="c.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate flex-1">
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

// Helpers (detectActiveMention/applyMention/resolveMentionedUserIds) live
// in ./mention-picker-utils.ts and are re-exported at the top of this file.
