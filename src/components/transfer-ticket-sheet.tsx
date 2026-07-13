/**
 * TransferTicketSheet - managers/admins move a ticket to another event.
 *
 * Two modes, one sheet:
 *   - single: move one attendee's ticket.
 *   - bulk:   move every live ticket on this event across to another event
 *             (the "the whole 7 Aug roster is going to Wild Mountains instead"
 *             case, Angelica 2026-07-13).
 *
 * Both call the transfer-event-ticket edge function (manager/admin gated
 * server-side), which routes bulk through the same single-ticket path.
 *
 * NOTHING is refunded and nobody re-buys: the same ticket row moves to the new
 * event, so the Stripe charge stays exactly where it is. The confirm copy says
 * that in plain words, because an admin clicking this needs to know it is not
 * a refund button.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '@/components/toast'
import { supabase } from '@/lib/supabase'
import { BottomSheet, Button } from '@/components'
import { ArrowRightLeft, CalendarDays, MapPin } from 'lucide-react'
import { cn } from '@/lib/cn'

interface TargetEvent {
  id: string
  title: string
  date_start: string
  address: string | null
}

/** Ticketed events this event's tickets could move to. */
function useTransferTargets(sourceEventId: string | undefined) {
  return useQuery({
    queryKey: ['transfer-target-events', sourceEventId],
    queryFn: async (): Promise<TargetEvent[]> => {
      if (!sourceEventId) return []
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date_start, address')
        .eq('is_ticketed', true)
        .eq('status', 'published')
        .neq('id', sourceEventId)
        .gte('date_start', new Date().toISOString())
        .order('date_start', { ascending: true })
      if (error) throw error
      return (data ?? []) as TargetEvent[]
    },
    enabled: !!sourceEventId,
    staleTime: 60 * 1000,
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function TransferTicketSheet({
  eventId,
  open,
  onClose,
  onSuccess,
  mode,
  ticketId,
  attendeeLabel,
  liveTicketCount,
}: {
  /** The event the ticket(s) are currently on. */
  eventId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
  mode: 'single' | 'bulk'
  /** Required when mode === 'single'. */
  ticketId?: string
  /** Required when mode === 'single'. */
  attendeeLabel?: string
  /** Live tickets on this event, shown in the bulk confirm copy. */
  liveTicketCount?: number
}) {
  const { toast } = useToast()
  const { data: targets, isLoading } = useTransferTargets(open ? eventId : undefined)
  const [selected, setSelected] = useState<TargetEvent | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function close() {
    setSelected(null)
    onClose()
  }

  async function handleTransfer() {
    if (!selected) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { target_event_id: selected.id, notify: true }
      if (mode === 'single') body.ticket_id = ticketId
      else body.source_event_id = eventId

      const { data, error } = await supabase.functions.invoke('transfer-event-ticket', { body })
      const result = (data ?? {}) as { ok?: boolean; moved?: number; skipped?: number; failed?: number; error?: string }
      if (error || result.error) {
        throw new Error(result.error || error?.message || 'Could not move the ticket')
      }

      if (mode === 'single') {
        toast.success(`${attendeeLabel ?? 'Ticket'} moved to ${selected.title}`)
      } else {
        const bits = [`${result.moved ?? 0} moved`]
        if (result.skipped) bits.push(`${result.skipped} skipped`)
        if (result.failed) bits.push(`${result.failed} failed`)
        toast.success(`${bits.join(', ')} to ${selected.title}`)
      }
      onSuccess()
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not move the ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const who = mode === 'single'
    ? (attendeeLabel ?? 'This attendee')
    : `All ${liveTicketCount ?? 0} ticket holders`

  return (
    <BottomSheet open={open} onClose={close} snapPoints={[0.85]}>
      <div className="space-y-5 pb-2">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={18} className="text-primary-500" />
          <h2 className="text-base font-bold text-neutral-900">
            {mode === 'single' ? 'Move to another event' : 'Move all attendees'}
          </h2>
        </div>

        <p className="text-xs text-neutral-500 leading-relaxed">
          {mode === 'single'
            ? `Move ${attendeeLabel ?? 'this attendee'}'s ticket across to another event. They keep the same ticket. Nothing is refunded and they do not pay again.`
            : `Move every live ticket on this event across to another event. Everyone keeps the ticket they already bought. Nothing is refunded and nobody pays again.`}
        </p>

        {/* Target picker */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Move to</p>
          {isLoading && <p className="text-xs text-neutral-400 px-1">Loading events...</p>}
          {!isLoading && (targets ?? []).length === 0 && (
            <p className="text-xs text-neutral-400 px-1">No other upcoming ticketed events to move to.</p>
          )}
          <div className="space-y-1 max-h-[240px] overflow-y-auto">
            {(targets ?? []).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelected(e)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-sm border transition-colors duration-150',
                  selected?.id === e.id
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-neutral-200 bg-white hover:bg-neutral-50',
                )}
              >
                <p className="text-sm font-medium text-neutral-800 truncate">{e.title}</p>
                <p className="text-[11px] text-neutral-500 flex items-center gap-1 mt-0.5">
                  <CalendarDays size={11} />
                  {formatDate(e.date_start)}
                </p>
                {e.address && (
                  <p className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5 truncate">
                    <MapPin size={11} className="shrink-0" />
                    <span className="truncate">{e.address}</span>
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plain-words confirmation of exactly what is about to happen */}
        {selected && (
          <div className="rounded-sm border border-warning-200 bg-warning-50 p-3 space-y-1.5">
            <p className="text-xs font-bold text-warning-800">
              {who} will move to {selected.title}.
            </p>
            <ul className="text-[11px] text-warning-700 leading-relaxed list-disc pl-4 space-y-0.5">
              <li>No refund is issued and nobody is charged again. The ticket moves as-is.</li>
              <li>They leave the group chat for this event and join the one for {selected.title}.</li>
              <li>Their spot on this event is released.</li>
              <li>They get an email telling them which event they are now going to.</li>
            </ul>
          </div>
        )}

        <Button
          variant="primary"
          size="md"
          fullWidth
          loading={submitting}
          disabled={submitting || !selected}
          onClick={handleTransfer}
        >
          <ArrowRightLeft size={16} className="mr-1.5" />
          {mode === 'single' ? 'Move ticket' : `Move ${liveTicketCount ?? 0} tickets`}
        </Button>
      </div>
    </BottomSheet>
  )
}
