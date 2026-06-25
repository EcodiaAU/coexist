import { useState } from 'react'
import { Bell, Clock } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Avatar } from '@/components/avatar'
import type { BroadcastLogEntry } from '@/hooks/use-chat'

interface BroadcastNotificationSheetProps {
  open: boolean
  onClose: () => void
  onSend: (data: { title: string; body: string }) => void
  loading?: boolean
  recentBroadcasts?: BroadcastLogEntry[]
  collectiveName?: string
}

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

export function BroadcastNotificationSheet({
  open,
  onClose,
  onSend,
  loading,
  recentBroadcasts = [],
  collectiveName,
}: BroadcastNotificationSheetProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const canSend = title.trim().length > 0 && body.trim().length > 0

  const handleSend = () => {
    if (!canSend) return
    onSend({ title: title.trim(), body: body.trim() })
    setTitle('')
    setBody('')
  }

  // Recent broadcasts within last 24h for dedup awareness
  const [now] = useState(() => Date.now())
  const recentBroadcasts24h = recentBroadcasts.filter(
    (b) => now - new Date(b.created_at).getTime() < 24 * 60 * 60 * 1000,
  )

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pb-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-warning-100 text-warning-600">
            <Bell size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-primary-900">Push Notification</h3>
            <p className="text-xs text-neutral-500">
              Send to all {collectiveName ? `${collectiveName} ` : ''}members
            </p>
          </div>
        </div>

        {/* Recent broadcasts warning (dedup) */}
        {recentBroadcasts24h.length > 0 && (
          <div className="mb-4 rounded-sm bg-warning-50 p-3 ring-1 ring-warning-200/60">
            <p className="text-xs font-semibold text-warning-700 mb-2 flex items-center gap-1.5">
              <Clock size={12} />
              Recent notifications (last 24h)
            </p>
            <div className="space-y-2">
              {recentBroadcasts24h.slice(0, 3).map((b) => (
                <div key={b.id} className="flex items-start gap-2">
                  <Avatar
                    src={b.profiles?.avatar_url}
                    name={b.profiles?.display_name}
                    size="xs"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-warning-800 truncate">
                      {b.profiles?.display_name ?? 'Staff'}: {b.title}
                    </p>
                    <p className="text-[11px] text-warning-500">
                      {relativeTime(b.created_at)} &middot; sent to {b.recipient_count} member{b.recipient_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-warning-500 mt-2 italic">
              Check above to avoid sending duplicate notifications
            </p>
          </div>
        )}

        {/* Title */}
        <div className="mb-3">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Beach Cleanup This Saturday!"
            maxLength={100}
          />
        </div>

        {/* Body */}
        <div className="mb-4">
          <Input
            type="textarea"
            label="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tell members what they need to know..."
            rows={3}
            maxLength={300}
          />
          <p className="text-[11px] text-neutral-500 mt-1 text-right">
            {body.length}/300
          </p>
        </div>

        {/* Warning */}
        <p className="text-[11px] text-neutral-500 mb-3 bg-primary-50 rounded-sm px-3 py-2">
          This will send a push notification to <strong>all registered members</strong> of this collective who have notifications enabled. Use sparingly.
        </p>

        {/* Send */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSend}
          disabled={!canSend || loading}
          loading={loading}
          icon={<Bell size={16} />}
        >
          Send Push Notification
        </Button>
      </div>
    </BottomSheet>
  )
}
