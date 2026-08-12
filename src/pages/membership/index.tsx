import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Page } from '@/components/page'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { OptimizedImage } from '@/components/optimized-image'
import { useToast } from '@/components/toast'
import { useAuth } from '@/hooks/use-auth'
import {
  useMembershipPlans,
  useMyMembership,
  useCreateMembership,
  useMembershipHeroImage,
  type MembershipInterval,
} from '@/hooks/use-membership'
import { cn } from '@/lib/cn'

const PERKS = [
  { title: 'Cheaper campout tickets', body: 'Member pricing on every Co-Exist campout.' },
  { title: 'More perks coming', body: 'Partner discounts and member drops are on the way.' },
]

/**
 * Membership join page (full-bleed). WEB-FIRST by design: purchase happens on the
 * website via Stripe. Inside the native app we never show a buy button (Apple
 * 3.1.1), only a pointer to manage it on the web.
 */
export default function MembershipPage() {
  const navigate = useNavigate()
  const rm = useReducedMotion()
  const { toast } = useToast()
  const { user } = useAuth()
  const isNative = Capacitor.isNativePlatform()

  const { data: plans, isLoading: loadingPlans } = useMembershipPlans()
  const { data: myMembership } = useMyMembership()
  const { data: heroImage } = useMembershipHeroImage()
  const createMembership = useCreateMembership()

  const [interval, setInterval] = useState<MembershipInterval>('monthly')

  const plan = plans?.[0] ?? null
  const isMember =
    myMembership?.status === 'active' ||
    myMembership?.status === 'trialing' ||
    myMembership?.status === 'past_due'

  const handleJoin = async () => {
    if (!plan) return
    if (!user) { navigate('/'); return }
    try {
      const { url } = await createMembership.mutateAsync({ planId: plan.id, interval })
      window.location.href = url
    } catch {
      toast.error('We could not start your membership just now. Please try again.')
    }
  }

  return (
    <Page noBackground className="bg-surface-2">
      {/* Full-bleed photographic hero - a real Co-Exist campout, not UI chrome */}
      <div className="-mx-4 lg:-mx-6">
        <div className="relative min-h-[360px] overflow-hidden bg-primary-900">
          {heroImage && (
            <OptimizedImage
              src={heroImage}
              alt=""
              priority
              quality={72}
              sizes="100vw"
              srcSetWidths={[640, 960, 1280, 1600]}
              wrapperClassName="absolute inset-0"
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
            className="absolute inset-x-0 bottom-0 z-10 p-6 sm:p-8"
            variants={rm ? undefined : { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
            initial="hidden"
            animate="visible"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70 mb-3">Co-Exist</p>
            <h1 className="font-heading text-[2.5rem] font-bold uppercase leading-[0.92] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
              {plan?.name ?? 'Membership'}
            </h1>
            <p className="text-sm text-white/85 mt-3 max-w-[32ch]">
              {plan?.description ?? 'Support Co-Exist and unlock member perks.'}
            </p>
          </motion.div>
        </div>
      </div>

      {/* De-chromed content */}
      <div className="px-1 pt-6 pb-12 space-y-7">
        {loadingPlans ? (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : !plan ? (
          <EmptyState
            illustration="empty"
            title="Membership is coming soon"
            description="Co-Exist membership is not open yet. Check back shortly."
          />
        ) : (
          <>
            {/* Perks - editorial text rows, no icon chrome */}
            <div className="divide-y divide-neutral-200/70">
              {PERKS.map((perk) => (
                <div key={perk.title} className="py-3.5 first:pt-0">
                  <p className="text-sm font-semibold text-neutral-900">{perk.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{perk.body}</p>
                </div>
              ))}
            </div>

            {isMember ? (
              <button
                type="button"
                onClick={() => navigate('/profile/membership')}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-sprout-500 text-white active:scale-[0.99] transition-transform"
              >
                <span className="text-sm font-semibold">You are a member</span>
                <span className="text-xs text-white/90">Manage</span>
              </button>
            ) : (
              <div className="space-y-4">
                {/* Interval choice: "$5 a week" is the framing of the monthly price. */}
                <div className="grid grid-cols-2 gap-3">
                  <IntervalCard
                    active={interval === 'monthly'}
                    onClick={() => setInterval('monthly')}
                    title="Monthly"
                    price={`$${plan.price_monthly.toFixed(0)}`}
                    unit="/ month"
                    sub="about $5 a week"
                  />
                  <IntervalCard
                    active={interval === 'yearly'}
                    onClick={() => setInterval('yearly')}
                    title="Yearly"
                    price={`$${plan.price_yearly.toFixed(0)}`}
                    unit="/ year"
                    sub="best value"
                  />
                </div>

                {isNative ? (
                  <div className="rounded-2xl bg-white shadow-sm p-5 text-center">
                    <p className="text-sm text-neutral-800 font-semibold">Join on the web</p>
                    <p className="text-xs text-neutral-500 mt-1 max-w-[34ch] mx-auto">
                      Membership is managed at coexistaus.org. Your perks, like cheaper campout
                      tickets, apply automatically here once you have joined.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={createMembership.isPending}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-4 rounded-2xl bg-sprout-500 text-white active:scale-[0.99] transition-transform disabled:opacity-60"
                  >
                    {createMembership.isPending && <Loader2 size={16} className="animate-spin" />}
                    {user ? 'Join now' : 'Sign in to join'}
                  </button>
                )}
                <p className="text-[11px] text-neutral-400 text-center">Cancel anytime from your profile.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  )
}

function IntervalCard({
  active, onClick, title, price, unit, sub,
}: {
  active: boolean; onClick: () => void; title: string; price: string; unit: string; sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border-2 p-4 text-left transition-colors',
        active ? 'border-sprout-500 bg-sprout-50' : 'border-neutral-200 bg-white',
      )}
    >
      <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-neutral-900">
        <span className="text-2xl font-bold">{price}</span>
        <span className="text-xs text-neutral-400 font-medium"> {unit}</span>
      </p>
      <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>
    </button>
  )
}
