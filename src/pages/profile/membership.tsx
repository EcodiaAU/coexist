import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Calendar, CreditCard, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react'
import {
  useMyMembership,
  useCancelMembership,
  useMembershipPortal,
  useMembershipHeroImage,
  type Membership,
} from '@/hooks/use-membership'
import { Page } from '@/components/page'
import { OptimizedImage } from '@/components/optimized-image'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const STATUS_BADGE: Record<Membership['status'], { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-white/20 text-white' },
  trialing: { label: 'Trial', className: 'bg-white/20 text-white' },
  past_due: { label: 'Payment failed', className: 'bg-error-500/80 text-white' },
  cancelled: { label: 'Cancelled', className: 'bg-white/15 text-white/80' },
}

export default function MembershipManagePage() {
  const navigate = useNavigate()
  const rm = useReducedMotion()
  const { toast } = useToast()
  const { data: membership, isLoading } = useMyMembership()
  const { data: heroImage } = useMembershipHeroImage()
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
    <Page noBackground className="bg-surface-2">
      {/* Full-bleed photographic hero carrying the membership status */}
      <div className="-mx-4 lg:-mx-6">
        <div className="relative min-h-[300px] overflow-hidden bg-primary-900">
          {heroImage && (
            <OptimizedImage
              src={heroImage}
              alt=""
              priority
              quality={72}
              sizes="100vw"
              srcSetWidths={[640, 960, 1280, 1600]}
              wrapperClassName="absolute inset-0"
              className={cn(membership && !isLive && 'grayscale')}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15" aria-hidden="true" />

          <div className="absolute top-3 left-4 z-10">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm text-white hover:bg-white/25 active:scale-[0.98] transition-[colors,transform] duration-150"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
          </div>

          <motion.div
            className="absolute inset-x-0 bottom-0 z-10 p-6"
            variants={rm ? undefined : { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
            initial="hidden"
            animate="visible"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70 mb-3">My Membership</p>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-heading text-[2rem] font-bold uppercase leading-[0.95] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
                {membership?.membership_plans?.name ?? 'Co-Exist Membership'}
              </h1>
              {badge && (
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm uppercase tracking-wide', badge.className)}>
                  {badge.label}
                </span>
              )}
            </div>
            {membership && (
              <p className="text-sm text-white/85 mt-1">{priceLabel}</p>
            )}
            {membership?.current_period_end && isLive && (
              <p className="text-[11px] text-white/75 mt-1.5 flex items-center gap-1">
                <Calendar size={11} />
                Renews {fmtDate(membership.current_period_end)}
              </p>
            )}
          </motion.div>
        </div>
      </div>

      {/* De-chromed content */}
      <div className="px-1 pt-6 pb-12 space-y-5">
        {showLoading ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : !membership ? (
          <EmptyState
            illustration="empty"
            title="No membership yet"
            description="Join Co-Exist membership for cheaper campout tickets and member perks."
            action={{ label: 'See membership', to: '/membership' }}
          />
        ) : (
          <>
            {membership.status === 'past_due' && (
              <div className="flex items-start gap-2 rounded-2xl bg-error-50 p-4">
                <AlertTriangle size={16} className="text-error-600 mt-0.5 shrink-0" />
                <p className="text-xs text-error-700">
                  Your last payment did not go through. Update your card to keep your membership.
                </p>
              </div>
            )}

            {isLive && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleUpdateCard}
                  disabled={portalMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-4 rounded-2xl bg-sprout-500 text-white active:scale-[0.99] transition-transform disabled:opacity-60"
                >
                  {portalMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                  Update payment method
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="w-full text-sm font-semibold px-4 py-4 rounded-2xl bg-white text-neutral-600 shadow-sm active:scale-[0.99] transition-transform"
                >
                  Cancel membership
                </button>
              </div>
            )}

            {membership.status === 'cancelled' && (
              <button
                type="button"
                onClick={() => navigate('/membership')}
                className="w-full text-sm font-semibold px-4 py-4 rounded-2xl bg-sprout-500 text-white active:scale-[0.99] transition-transform"
              >
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
