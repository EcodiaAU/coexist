import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heart,
  Repeat,
  Calendar,
  CreditCard,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import {
  useMyDonations,
  useMyRecurringDonations,
  useCancelRecurringDonation,
  useBillingPortal,
} from '@/hooks/use-donations'
import type { Donation, RecurringDonation } from '@/types/donations'
import {
  Page,
  Header,
  Skeleton,
  EmptyState,
  ConfirmationSheet,
} from '@/components'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { useToast } from '@/components/toast'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

const fmtAmount = (amount: number, currency = 'AUD') =>
  `$${Number(amount).toFixed(2)} ${currency}`

/* ------------------------------------------------------------------ */
/*  Recurring donation card (active / past_due / paused / cancelled)   */
/* ------------------------------------------------------------------ */

const RECURRING_BADGE: Record<
  RecurringDonation['status'],
  { label: string; className: string }
> = {
  active: { label: 'Active', className: 'bg-success-100 text-success-700' },
  past_due: { label: 'Payment failed', className: 'bg-error-100 text-error-700' },
  paused: { label: 'Paused', className: 'bg-warning-100 text-warning-700' },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-500' },
}

function RecurringCard({
  donation,
  onCancel,
  onUpdateCard,
  updatingCard,
}: {
  donation: RecurringDonation
  onCancel: (subscriptionId: string) => void
  onUpdateCard: (subscriptionId: string) => void
  updatingCard: boolean
}) {
  const badge = RECURRING_BADGE[donation.status]
  const isLive = donation.status === 'active' || donation.status === 'past_due'

  return (
    <StaggeredItem
      className={cn(
        'rounded-md bg-white shadow-sm p-4',
        donation.status === 'cancelled' && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-sprout-100 flex items-center justify-center shrink-0">
            <Repeat size={16} className="text-sprout-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">
              {fmtAmount(donation.amount, donation.currency)}
              <span className="font-normal text-neutral-500"> / month</span>
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Started {fmtDate(donation.created_at)}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0',
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </div>

      {donation.status === 'past_due' && (
        <p className="text-[11px] text-error-600 mt-2 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          Your last payment did not go through. Update your card to keep your monthly gift going.
        </p>
      )}

      {isLive && (
        <div className="flex items-center gap-2 mt-3">
          {donation.status === 'past_due' && (
            <button
              type="button"
              onClick={() => onUpdateCard(donation.stripe_subscription_id)}
              disabled={updatingCard}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-sprout-500 text-white active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {updatingCard ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
              Update card
            </button>
          )}
          <button
            type="button"
            onClick={() => onCancel(donation.stripe_subscription_id)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 active:scale-[0.98] transition-transform"
          >
            Cancel
          </button>
        </div>
      )}
    </StaggeredItem>
  )
}

/* ------------------------------------------------------------------ */
/*  Donation history row                                               */
/* ------------------------------------------------------------------ */

const HISTORY_BADGE: Record<Donation['status'], { label: string; className: string } | null> = {
  succeeded: null,
  pending: { label: 'Pending', className: 'bg-warning-100 text-warning-700' },
  failed: { label: 'Failed', className: 'bg-error-100 text-error-700' },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-500' },
  refunded: { label: 'Refunded', className: 'bg-neutral-100 text-neutral-500' },
}

function HistoryRow({ donation }: { donation: Donation }) {
  const badge = HISTORY_BADGE[donation.status]
  const recurring = donation.message === 'Monthly recurring donation'
  return (
    <StaggeredItem className="rounded-md bg-white shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">
            {fmtAmount(donation.amount, donation.currency)}
            {recurring && <span className="font-normal text-neutral-400"> (monthly)</span>}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-400">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {fmtDate(donation.created_at)}
            </span>
            {donation.project_name && <span className="truncate">{donation.project_name}</span>}
          </div>
          {donation.receipt_number && (
            <p className="font-mono text-[10px] text-neutral-400 mt-1">
              Receipt {donation.receipt_number}
            </p>
          )}
        </div>
        {badge && (
          <span
            className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0',
              badge.className,
            )}
          >
            {badge.label}
          </span>
        )}
      </div>
    </StaggeredItem>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DonationsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: donations, isLoading: loadingDonations } = useMyDonations()
  const { data: recurring, isLoading: loadingRecurring } = useMyRecurringDonations()
  const cancelMutation = useCancelRecurringDonation()
  const portalMutation = useBillingPortal()
  const showLoading = useDelayedLoading(loadingDonations || loadingRecurring)

  const [confirmSubId, setConfirmSubId] = useState<string | null>(null)

  const liveRecurring = (recurring ?? []).filter(
    (r) => r.status === 'active' || r.status === 'past_due' || r.status === 'paused',
  )
  const cancelledRecurring = (recurring ?? []).filter((r) => r.status === 'cancelled')

  const handleCancel = async () => {
    if (!confirmSubId) return
    const subId = confirmSubId
    setConfirmSubId(null)
    try {
      await cancelMutation.mutateAsync(subId)
      toast.success('Your monthly donation has been cancelled.')
    } catch {
      toast.error('We could not cancel that just now. Please try again.')
    }
  }

  const handleUpdateCard = async (subId: string) => {
    try {
      const { url } = await portalMutation.mutateAsync(subId)
      window.location.href = url
    } catch {
      toast.error('Card management is not available right now. You can restart your monthly gift instead.')
    }
  }

  const nothing = !liveRecurring.length && !cancelledRecurring.length && !donations?.length

  return (
    <Page swipeBack header={<Header title="My Donations" back />}>
      <div className="p-4 space-y-6 pb-12">
        {showLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-md" />
            <Skeleton className="h-24 rounded-md" />
            <Skeleton className="h-24 rounded-md" />
          </div>
        ) : nothing ? (
          <EmptyState
            illustration="empty"
            title="No donations yet"
            description="When you support Co-Exist, your gifts and receipts will appear here."
            action={{ label: 'Donate', to: '/donate' }}
          />
        ) : (
          <>
            {liveRecurring.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3 px-1">
                  Monthly giving
                </h3>
                <StaggeredList className="space-y-2">
                  {liveRecurring.map((r) => (
                    <RecurringCard
                      key={r.id}
                      donation={r}
                      onCancel={setConfirmSubId}
                      onUpdateCard={handleUpdateCard}
                      updatingCard={portalMutation.isPending}
                    />
                  ))}
                </StaggeredList>
              </div>
            )}

            {donations && donations.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3 px-1">
                  History
                </h3>
                <StaggeredList className="space-y-2">
                  {donations.map((d) => (
                    <HistoryRow key={d.id} donation={d} />
                  ))}
                </StaggeredList>
              </div>
            )}

            {cancelledRecurring.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-1">
                  Ended
                </h3>
                <StaggeredList className="space-y-2">
                  {cancelledRecurring.map((r) => (
                    <RecurringCard
                      key={r.id}
                      donation={r}
                      onCancel={setConfirmSubId}
                      onUpdateCard={handleUpdateCard}
                      updatingCard={portalMutation.isPending}
                    />
                  ))}
                </StaggeredList>
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate('/donate')}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-3 rounded-lg bg-sprout-500 text-white active:scale-[0.98] transition-transform"
            >
              <Heart size={15} />
              Make another donation
            </button>
          </>
        )}
      </div>

      <ConfirmationSheet
        open={!!confirmSubId}
        onClose={() => setConfirmSubId(null)}
        onConfirm={handleCancel}
        title="Cancel monthly donation?"
        description="Your recurring gift will stop and you will not be charged again. You can start a new one any time."
        confirmLabel="Cancel donation"
        variant="warning"
      />
    </Page>
  )
}
