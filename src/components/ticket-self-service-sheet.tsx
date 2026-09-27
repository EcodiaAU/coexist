/**
 * TicketSelfServiceSheet - the ticket HOLDER manages their own ticket.
 *
 * Before this, a refund or a change meant messaging an organiser and waiting
 * (Angelica, 2026-08-24). Two actions live here, both acting only on the
 * caller's own ticket:
 *   - Refund my ticket (Stripe refund against the original payment), before the
 *     refund cutoff.
 *   - Release my ticket, INSIDE the cutoff (2026-09-27): the seat goes back on
 *     sale and the holder is refunded in full once someone else buys a paid
 *     ticket, or not at all if nobody does. A $0 ticket is simply released.
 *   - Pass my ticket to someone else by email (no refund, no re-buy: the same
 *     ticket and the same original charge move to the new holder).
 *
 * What is ALLOWED is decided server-side by get_my_ticket_self_service and
 * arrives via useTicketSelfService. This component renders that answer; it does
 * not re-derive the policy, so the button can never promise what the edge
 * function will refuse.
 *
 * TERMS: the member-facing refund/transfer wording lives in @/lib/ticket-terms
 * and is NOT invented here. While TICKET_TERMS_PENDING is true the sheet shows
 * the placeholder notice instead of policy text; once it is flipped the sheet
 * shows the real refund terms (and the transfer terms when transfer is on).
 */
import { useState } from 'react'
import { useToast } from '@/components/toast'
import { BottomSheet, Button } from '@/components'
import { AlertTriangle, ArrowRightLeft, Info, RotateCcw, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useImeSafeOnChange } from '@/hooks/use-ime-safe-on-change'
import { ticketTermsCopy, TICKET_TERMS_PENDING } from '@/lib/ticket-terms'
import {
  useTicketSelfService,
  useMyTicketTransfers,
  useSelfRefundTicket,
  useReleaseMyTicket,
  useStartTicketTransfer,
  useCancelTicketTransfer,
} from '@/hooks/use-event-tickets'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputCls = cn(
  'w-full rounded-sm border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900',
  'placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40',
  'focus:border-primary-400 transition-colors duration-150',
)

/**
 * Plain-language reason the server gave for refusing an action. When release is
 * on offer, the closed refund window is not a dead end, so it says what to do.
 */
export function blockedCopy(
  reason: string | null | undefined,
  refundEnabled: boolean,
  canRelease = false,
): string | null {
  if (reason === 'past_refund_cutoff' && canRelease) {
    return "It's too close to the event to refund directly, but you can release your ticket below."
  }
  switch (reason) {
    case 'checked_in':
      return "You've already checked in to this event, so it can't be changed here."
    case 'event_started':
      return 'This event has already started.'
    case 'event_cancelled':
      return 'This event was cancelled. Your organiser will be in touch about the refund.'
    case 'past_refund_cutoff':
      return 'The refund window for this event has closed.'
    case 'not_confirmed':
      return 'This ticket is not confirmed yet.'
    default:
      return refundEnabled ? null : null
  }
}

export function TicketSelfServiceSheet({
  ticketId,
  eventId,
  open,
  onClose,
}: {
  ticketId: string
  eventId?: string
  open: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const { data: policy, isLoading } = useTicketSelfService(open ? ticketId : undefined)
  const { data: offers } = useMyTicketTransfers(open ? ticketId : undefined)
  const refund = useSelfRefundTicket()
  const release = useReleaseMyTicket()
  const startTransfer = useStartTicketTransfer()
  const cancelTransfer = useCancelTicketTransfer()

  const [mode, setMode] = useState<'menu' | 'refund' | 'release' | 'transfer'>('menu')
  const [email, setEmail] = useState('')
  const emailProps = useImeSafeOnChange<HTMLInputElement>(setEmail)

  function close() {
    setMode('menu')
    setEmail('')
    onClose()
  }

  async function handleRefund() {
    try {
      const res = await refund.mutateAsync({ ticketId, eventId })
      toast.success(
        res?.action === 'refunded'
          ? 'Refunded. It can take a few days to land back on your card.'
          : 'Your ticket has been released.',
      )
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not refund that ticket')
    }
  }

  async function handleRelease() {
    try {
      const res = await release.mutateAsync({ ticketId, eventId })
      toast.success(
        res?.action === 'released'
          ? "Released. You'll be refunded when someone takes your spot."
          : 'Your ticket has been released.',
      )
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not release that ticket')
    }
  }

  async function handleTransfer() {
    const trimmed = email.trim().toLowerCase()
    if (!EMAIL_RE.test(trimmed)) {
      toast.error('Enter a valid email for the person taking your ticket')
      return
    }
    try {
      await startTransfer.mutateAsync({ ticketId, toEmail: trimmed, eventId })
      toast.success(`Sent. ${trimmed} has 14 days to claim your ticket.`)
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start that transfer')
    }
  }

  const canRefund = policy?.can_refund === true
  const canTransfer = policy?.can_transfer === true
  const canRelease = policy?.can_release === true
  const blocked = blockedCopy(policy?.blocked_reason, policy?.refund_enabled_for_event === true, canRelease)
  const nothingAvailable = !isLoading && policy?.found && !canRefund && !canTransfer && !canRelease
  const anyAction = canRefund || canTransfer || canRelease

  return (
    <BottomSheet open={open} onClose={close} snapPoints={[0.7]}>
      <div className="space-y-5 pb-2">
        <div className="flex items-center gap-2">
          <RotateCcw size={18} className="text-primary-500" />
          <h2 className="text-base font-bold text-neutral-900">Manage your ticket</h2>
        </div>

        {isLoading && <p className="text-xs text-neutral-400">Checking your options...</p>}

        {/* Terms. A placeholder notice until TICKET_TERMS_PENDING is flipped. */}
        {anyAction && TICKET_TERMS_PENDING && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-sm bg-warning-50 border border-warning-200/50">
            <Info size={15} className="text-warning-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-warning-700 leading-relaxed">
              {ticketTermsCopy('refund')}
            </p>
          </div>
        )}
        {anyAction && !TICKET_TERMS_PENDING && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-sm bg-neutral-50 border border-neutral-200/60">
            <Info size={15} className="text-neutral-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              {(canRefund || canRelease) && (
                <p className="text-[11px] text-neutral-600 leading-relaxed">{ticketTermsCopy('refund')}</p>
              )}
              {canTransfer && (
                <p className="text-[11px] text-neutral-600 leading-relaxed">{ticketTermsCopy('transfer')}</p>
              )}
            </div>
          </div>
        )}

        {blocked && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-sm bg-neutral-50 border border-neutral-200/60">
            <AlertTriangle size={15} className="text-neutral-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-neutral-600 leading-relaxed">{blocked}</p>
          </div>
        )}

        {nothingAvailable && !blocked && (
          <p className="text-xs text-neutral-500 leading-relaxed">
            Changes to this ticket are handled by the organiser. Get in touch with them and
            they can sort it out for you.
          </p>
        )}

        {/* ---- Outstanding transfer offers ---- */}
        {(offers?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Waiting to be claimed
            </p>
            {offers?.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-2 px-3 py-2 rounded-sm bg-neutral-50 border border-neutral-100"
              >
                <ArrowRightLeft size={14} className="text-neutral-400 shrink-0" />
                <p className="flex-1 min-w-0 text-xs text-neutral-700 truncate">{o.to_email}</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await cancelTransfer.mutateAsync({ transferId: o.id, eventId })
                      toast.success('Transfer withdrawn')
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Could not withdraw that')
                    }
                  }}
                  className="p-1 rounded-sm hover:bg-neutral-200/60 text-neutral-400"
                  aria-label={`Withdraw transfer to ${o.to_email}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ---- Menu ---- */}
        {mode === 'menu' && (
          <div className="space-y-2">
            {canTransfer && (
              <Button variant="secondary" size="md" fullWidth onClick={() => setMode('transfer')}>
                <ArrowRightLeft size={16} className="mr-1.5" />
                Pass my ticket to someone else
              </Button>
            )}
            {canRefund && (
              <Button variant="ghost" size="md" fullWidth onClick={() => setMode('refund')}>
                <RotateCcw size={16} className="mr-1.5" />
                Refund my ticket
              </Button>
            )}
            {canRelease && (
              <Button variant="ghost" size="md" fullWidth onClick={() => setMode('release')}>
                <Undo2 size={16} className="mr-1.5" />
                Release my ticket
              </Button>
            )}
          </div>
        )}

        {/* ---- Release (inside the refund cutoff) ---- */}
        {mode === 'release' && (
          <div className="space-y-3 border-t border-neutral-100 pt-4">
            <p className="text-xs text-neutral-500 leading-relaxed">
              {policy?.is_paid
                ? "Your spot goes back on sale. When someone else buys a ticket, you're refunded in full, automatically, to the card you paid with. If nobody buys one before the event, you won't be refunded. You can't undo this."
                : "Your spot goes back on sale for someone else. You can't undo this."}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="md" onClick={() => setMode('menu')}>
                Keep my ticket
              </Button>
              <Button
                variant="danger"
                size="md"
                fullWidth
                loading={release.isPending}
                disabled={release.isPending}
                onClick={handleRelease}
              >
                Release my ticket
              </Button>
            </div>
          </div>
        )}

        {/* ---- Transfer ---- */}
        {mode === 'transfer' && (
          <div className="space-y-3 border-t border-neutral-100 pt-4">
            <p className="text-xs text-neutral-500 leading-relaxed">
              We'll email them a link to claim your ticket. Nothing is refunded and they pay
              nothing: your ticket moves across as it is. It stays yours until they claim it.
            </p>
            <input
              {...emailProps}
              value={email}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Their email"
              className={inputCls}
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="md" onClick={() => setMode('menu')}>
                Back
              </Button>
              <Button
                variant="primary"
                size="md"
                fullWidth
                loading={startTransfer.isPending}
                disabled={startTransfer.isPending || !email.trim()}
                onClick={handleTransfer}
              >
                Send transfer
              </Button>
            </div>
          </div>
        )}

        {/* ---- Refund ---- */}
        {mode === 'refund' && (
          <div className="space-y-3 border-t border-neutral-100 pt-4">
            <p className="text-xs text-neutral-500 leading-relaxed">
              {policy?.is_paid
                ? 'Your payment goes back to the card you paid with, and your spot is released for someone else. This cannot be undone.'
                : 'Your spot is released for someone else. This cannot be undone.'}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="md" onClick={() => setMode('menu')}>
                Keep my ticket
              </Button>
              <Button
                variant="danger"
                size="md"
                fullWidth
                loading={refund.isPending}
                disabled={refund.isPending}
                onClick={handleRefund}
              >
                {policy?.is_paid ? 'Refund my ticket' : 'Release my ticket'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
