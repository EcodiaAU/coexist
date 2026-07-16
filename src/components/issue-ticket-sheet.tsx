/**
 * IssueTicketSheet - managers/admins issue a free ticket ahead of time.
 *
 * Like the day-of WalkInSheet, but it grants a confirmed ticket (not a day-of
 * walk-in): the recipient gets a $0 ticket, is registered, and auto-joins the
 * campout group chat via the sync_campout_chat_membership trigger. Two ways in:
 *   1. Search an existing app user and issue to them.
 *   2. No match - type a name + email; we provision a shell account and email
 *      them a magic-link ticket so they can get in.
 *
 * Calls the grant-event-ticket edge function (manager/admin gated server-side).
 */
import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import { supabase } from '@/lib/supabase'
import { BottomSheet, Button } from '@/components'
import { Avatar } from '@/components/avatar'
import { Ticket, Search as SearchIcon, Send } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useImeSafeOnChange } from '@/hooks/use-ime-safe-on-change'

interface SearchResult {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputCls = cn(
  'w-full rounded-sm border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900',
  'placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40',
  'focus:border-primary-400 transition-colors duration-150',
)

export function IssueTicketSheet({
  eventId,
  open,
  onClose,
  onSuccess,
}: {
  eventId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [issuingId, setIssuingId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const searchProps = useImeSafeOnChange<HTMLInputElement>(setSearchQuery)
  const nameProps = useImeSafeOnChange<HTMLInputElement>(setName)
  const emailProps = useImeSafeOnChange<HTMLInputElement>(setEmail)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (searchQuery.trim().length < 2 || !eventId) {
      setSearchResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const { data, error } = await supabase.rpc('search_app_users_for_event', {
          p_event_id: eventId,
          p_query: searchQuery.trim(),
          p_max_results: 10,
        })
        if (!error && data) setSearchResults(data as SearchResult[])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, eventId])

  function reset() {
    setSearchQuery('')
    setSearchResults([])
    setName('')
    setEmail('')
  }

  async function grant(payload: { user_id?: string; email?: string; name?: string }, label: string) {
    const { data, error } = await supabase.functions.invoke('grant-event-ticket', {
      body: { event_id: eventId, notify: true, ...payload },
    })
    const result = (data ?? {}) as { ticket_id?: string; already?: boolean; error?: string }
    if (error || result.error) {
      throw new Error(result.error || error?.message || 'Could not issue the ticket')
    }
    toast.success(result.already ? `${label} already had a ticket` : `Ticket issued to ${label}`)
    reset()
    onSuccess()
    onClose()
  }

  async function handleIssueExisting(user: SearchResult) {
    setIssuingId(user.id)
    try {
      await grant({ user_id: user.id }, user.display_name || user.email || 'attendee')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not issue the ticket')
    } finally {
      setIssuingId(null)
    }
  }

  async function handleIssueByEmail() {
    const trimmed = email.trim().toLowerCase()
    if (!EMAIL_RE.test(trimmed)) {
      toast.error('Enter a valid email')
      return
    }
    setSubmitting(true)
    try {
      await grant({ email: trimmed, name: name.trim() || undefined }, name.trim() || trimmed)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not issue the ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet data-eos-id="src/components/issue-ticket-sheet.tsx#0" data-eos-v="2" open={open} onClose={onClose} snapPoints={[0.85]}>
      <div data-eos-id="src/components/issue-ticket-sheet.tsx#1" className="space-y-5 pb-2">
        <div data-eos-id="src/components/issue-ticket-sheet.tsx#2" className="flex items-center gap-2">
          <Ticket data-eos-id="src/components/issue-ticket-sheet.tsx#3" size={18} className="text-primary-500" />
          <h2 data-eos-id="src/components/issue-ticket-sheet.tsx#4" className="text-base font-bold text-neutral-900">Issue a ticket</h2>
        </div>
        <p data-eos-id="src/components/issue-ticket-sheet.tsx#5" className="text-xs text-neutral-500 leading-relaxed">
          Give someone a free ticket ahead of time. They get a confirmed ticket and join the
          group chat. Search an existing member, or add them by email.
        </p>

        {/* Search existing users */}
        <div data-eos-id="src/components/issue-ticket-sheet.tsx#6" className="space-y-2">
          <div data-eos-id="src/components/issue-ticket-sheet.tsx#7" className="relative">
            <SearchIcon data-eos-id="src/components/issue-ticket-sheet.tsx#8" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input data-eos-id="src/components/issue-ticket-sheet.tsx#9"
              {...searchProps}
              value={searchQuery}
              placeholder="Search members by name or email"
              className={cn(inputCls, 'pl-9')}
            />
          </div>
          {searchLoading && <p data-eos-id="src/components/issue-ticket-sheet.tsx#10" className="text-xs text-neutral-400 px-1">Searching...</p>}
          {searchResults.length > 0 && (
            <div data-eos-id="src/components/issue-ticket-sheet.tsx#11" className="space-y-1 max-h-[220px] overflow-y-auto">
              {searchResults.map((u) => (
                <button data-eos-id="src/components/issue-ticket-sheet.tsx#12"
                  key={u.id}
                  type="button"
                  disabled={issuingId === u.id}
                  onClick={() => handleIssueExisting(u)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm hover:bg-neutral-50 text-left disabled:opacity-50"
                >
                  <Avatar data-eos-id="src/components/issue-ticket-sheet.tsx#13" src={u.avatar_url} name={u.display_name ?? u.email ?? '?'} size="sm" />
                  <div data-eos-id="src/components/issue-ticket-sheet.tsx#14" className="flex-1 min-w-0">
                    <p data-eos-id="src/components/issue-ticket-sheet.tsx#15" data-eos-var="u.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-800 truncate">{u.display_name ?? 'Member'}</p>
                    {u.email && <p data-eos-id="src/components/issue-ticket-sheet.tsx#16" data-eos-var="u.email" data-eos-var-label="Email" data-eos-var-scope="item" className="text-[11px] text-neutral-400 truncate">{u.email}</p>}
                  </div>
                  <Send data-eos-id="src/components/issue-ticket-sheet.tsx#17" size={15} className="text-primary-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add by email */}
        <div data-eos-id="src/components/issue-ticket-sheet.tsx#18" className="space-y-2 border-t border-neutral-100 pt-4">
          <p data-eos-id="src/components/issue-ticket-sheet.tsx#19" className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Or add by email</p>
          <input data-eos-id="src/components/issue-ticket-sheet.tsx#20" {...nameProps} value={name} placeholder="Name (optional)" className={inputCls} />
          <input data-eos-id="src/components/issue-ticket-sheet.tsx#21"
            {...emailProps}
            value={email}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email"
            className={inputCls}
          />
          <Button data-eos-id="src/components/issue-ticket-sheet.tsx#22"
            variant="primary"
            size="md"
            fullWidth
            loading={submitting}
            disabled={submitting || !email.trim()}
            onClick={handleIssueByEmail}
          >
            <Ticket data-eos-id="src/components/issue-ticket-sheet.tsx#23" size={16} className="mr-1.5" />
            Issue ticket
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
