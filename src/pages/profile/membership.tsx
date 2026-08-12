import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Calendar, CreditCard, AlertTriangle, Loader2 } from 'lucide-react'
import {
  useMyMembership,
  useCancelMembership,
  useMembershipPortal,
  type Membership,
} from '@/hooks/use-membership'
import { Page, Header, Skeleton, EmptyState, ConfirmationSheet } from '@/components'
import { useToast } from '@/components/toast'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const STATUS_BADGE: Record<Membership['status'], { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-success-100 text-success-700' },
  trialing: { label: 'Trial', className: 'bg-success-100 text-success-700' },
  past_due: { label: 'Payment failed', className: 'bg-error-100 text-error-700' },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-500' },
}

export default function MembershipManagePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: membership, isLoading } = useMyMembership()
  const cancelMutation = useCancelMembership()
  const portalMutation = useMembershipPortal()
  const showLoading = useDelayedLoading(isLoading)

  const [confirmCancel, setConfirmCancel] = useState(false)

  const handleCancel = async () => {
    setConfirmCancel(false)
    if (!membership?.stripe_subscription_id) return
    try {
      await cancelMutation.mutateAsync(membership.stripe_subscription_id)
      toast.success('Your membership has been cancelled.')
    } catch {
      toast.error('We could not cancel that just now. Please try again.')
    }
  }

  const handleUpdateCard = async () => {
    if (!membership?.stripe_subscription_id) return
    try {
      const { url } = await portalMutation.mutateAsync(membership.stripe_subscription_id)
      window.location.href = url
    } catch {
      toast.error('Card management is not available right now. Please try again.')
    }
  }

  const badge = membership ? STATUS_BADGE[membership.status] : null
  const isLive =
    membership?.status === 'active' ||
    membership?.status === 'trialing' ||
    membership?.status === 'past_due'
  const priceLabel = membership
    ? membership.interval === 'yearly'
      ? `$${Number(membership.membership_plans?.price_yearly ?? 0).toFixed(0)} / year`
      : `$${Number(membership.membership_plans?.price_monthly ?? 0).toFixed(0)} / month`
    : ''

  return (
    <Page swipeBack header={<Header title="My Membership" back />}>
      <div className="p-4 space-y-6 pb-12">
        {showLoading ? (
          <Skeleton className="h-40 rounded-md" />
        ) : !membership ? (
          <EmptyState
            illustration="empty"
            title="No membership yet"
            description="Join Co-Exist membership for cheaper campout tickets and member perks."
            action={{ label: 'See membership', to: '/membership' }}
          />
        ) : (
          <>
            <div
              className={cn(
                'rounded-md bg-white shadow-sm p-4',
                membership.status === 'cancelled' && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-sprout-100 flex items-center justify-center shrink-0">
                    <Sparkles size={16} className="text-sprout-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                      {membership.membership_plans?.name ?? 'Co-Exist Membership'}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{priceLabel}</p>
                  </div>
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

              {membership.current_period_end && isLive && (
                <p className="text-[11px] text-neutral-400 mt-3 flex items-center gap-1">
                  <Calendar size={11} />
                  Renews {fmtDate(membership.current_period_end)}
                </p>
              )}

              {membership.status === 'past_due' && (
                <p className="text-[11px] text-error-600 mt-2 flex items-start gap-1">
                  <AlertTriangle size={12} className="mt-px shrink-0" />
                  Your last payment did not go through. Update your card to keep your membership.
                </p>
              )}

              {isLive && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleUpdateCard}
                    disabled={portalMutation.isPending}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-sprout-500 text-white active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    {portalMutation.isPending ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CreditCard size={13} />
                    )}
                    Update card
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 active:scale-[0.98] transition-transform"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {membership.status === 'cancelled' && (
              <button
                type="button"
                onClick={() => navigate('/membership')}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-3 rounded-lg bg-sprout-500 text-white active:scale-[0.98] transition-transform"
              >
                <Sparkles size={15} />
                Rejoin membership
              </button>
            )}
          </>
        )}
      </div>

      <ConfirmationSheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancel membership?"
        description="Your membership will stop and you will not be charged again. You can rejoin any time."
        confirmLabel="Cancel membership"
        variant="warning"
      />
    </Page>
  )
}
