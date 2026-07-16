import { useState } from 'react'
import { X } from 'lucide-react'
import { SearchBar } from '@/components/search-bar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { Avatar } from '@/components/avatar'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useChatSearch } from '@/hooks/use-chat-search'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ChatSearchProps {
  collectiveId: string
  onClose: () => void
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChatSearch({ collectiveId, onClose }: ChatSearchProps) {
  const { searchQuery, results, isLoading, search } = useChatSearch(collectiveId)
  const showSearchLoading = useDelayedLoading(isLoading)
  const [query, setQuery] = useState('')

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="flex items-center gap-2 px-3 py-2 shadow-sm">
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={search}
          placeholder="Search messages..."
          compact
          autoFocus
          className="flex-1"
          aria-label="Search messages"
        />
        <button type="button" onClick={onClose} aria-label="Close search" className="flex items-center justify-center shrink-0 min-h-11 min-w-11 rounded-full hover:bg-neutral-100 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none">
          <X size={18} className="text-neutral-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {showSearchLoading ? (
          <Skeleton variant="list-item" count={5} />
        ) : results.length === 0 && searchQuery ? (
          <EmptyState
            illustration="search"
            title="No messages found"
            description={`No messages match "${searchQuery}"`}
          />
        ) : (
          <div className="space-y-2">
            {results.map((msg) => (
              <div key={msg.id} className="rounded-md bg-white p-4 shadow-sm border border-neutral-100">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Avatar
                    src={msg.profiles?.avatar_url}
                    name={msg.profiles?.display_name}
                    size="xs"
                  />
                  <span className="text-[13px] font-bold text-neutral-800">
                    {msg.profiles?.display_name}
                  </span>
                  <span className="text-[11px] font-medium text-neutral-400 ml-auto">
                    {relativeTime(msg.created_at!)}
                  </span>
                </div>
                <p className="text-sm text-neutral-600 leading-relaxed">{msg.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
