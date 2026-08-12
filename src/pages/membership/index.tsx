import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Sparkles, Check, Loader2, Globe, TicketPercent } from 'lucide-react'
import { Page, Header, EmptyState, Skeleton } from '@/components'
import { useToast } from '@/components/toast'
import { useAuth } from '@/hooks/use-auth'
import {
  useMembershipPlans,
  useMyMembership,
  useCreateMembership,
  type MembershipInterval,
} from '@/hooks/use-membership'
import { cn } from '@/lib/cn'

const PERKS = [
  { icon: <TicketPercent size={15} />, text: 'Cheaper campout tickets' },
  { icon: <Sparkles size={15} />, text: 'Member perks as they roll out' },
]

/**
 * Membership join page. WEB-FIRST by design: purchase happens on the website via
 * Stripe. Inside the native app we never show a buy button (Apple 3.1.1), only a
 * pointer to manage it on the web, so no digital subscription is sold in-app.
 */
export default function MembershipPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const isNative = Capacitor.isNativePlatform()

  const { data: plans, isLoading: loadingPlans } = useMembershipPlans()
  const { data: myMembership } = useMyMembership()
  const createMembership = useCreateMembership()

  const [interval, setInterval] = useState<MembershipInterval>('monthly')

  const plan = plans?.[0] ?? null
  const isMember =
    myMembership?.status === 'active' ||
    myMembership?.status === 'trialing' ||
    myMembership?.status === 'past_due'

  const handleJoin = async () => {
    if (!plan) return
    if (!user) {
      navigate('/')
      return
    }
    try {
      const { url } = await createMembership.mutateAsync({ planId: plan.id, interval })
      window.location.href = url
    } catch {
      toast.error('We could not start your membership just now. Please try again.')
    }
  }

  return (
    <Page swipeBack header={<Header title="Membership" back />}>
      <div className="p-4 space-y-6 pb-12">
        {loadingPlans ? (
          <div className="space-y-3">
            <Skeleton className="h-40 rounded-md" />
            <Skeleton className="h-24 rounded-md" />
          </div>
        ) : !plan ? (
          <EmptyState
            illustration="empty"
            title="Membership is coming soon"
            description="Co-Exist membership is not open yet. Check back shortly."
          />
        ) : (
          <>
            <div className="rounded-2xl bg-olive-700 text-white p-5">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <h2 className="text-lg font-bold">{plan.name}</h2>
              </div>
              <p className="text-sm text-white/80 mt-1">
                {plan.description ?? 'Support Co-Exist and unlock member perks.'}
              </p>
              <ul className="mt-4 space-y-2">
                {PERKS.map((perk) => (
                  <li key={perk.text} className="flex items-center gap-2 text-sm text-white/90">
                    <span className="text-sprout-300">{perk.icon}</span>
                    {perk.text}
                  </li>
                ))}
              </ul>
            </div>

            {isMember ? (
              <button
                type="button"
                onClick={() => navigate('/profile/membership')}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-3 rounded-lg bg-sprout-500 text-white active:scale-[0.98] transition-transform"
              >
                <Check size={16} />
                You are a member - manage it
              </button>
            ) : (
              <>
                {/* Interval toggle: "$5 a week" is the framing of the monthly price. */}
                <div className="grid grid-cols-2 gap-2">
                  <IntervalCard
                    active={interval === 'monthly'}
                    onClick={() => setInterval('monthly')}
                    title="Monthly"
                    price={`$${plan.price_monthly.toFixed(0)}/month`}
                    sub="about $5 a week"
                  />
                  <IntervalCard
                    active={interval === 'yearly'}
                    onClick={() => setInterval('yearly')}
                    title="Yearly"
                    price={`$${plan.price_yearly.toFixed(0)}/year`}
                    sub="best value"
                  />
                </div>

                {isNative ? (
                  <div className="rounded-lg bg-neutral-100 p-4 text-center">
                    <Globe size={18} className="mx-auto text-neutral-500" />
                    <p className="text-sm text-neutral-700 mt-2 font-medium">
                      Join on the web
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Membership is managed at coexistaus.org. Your perks, like cheaper
                      campout tickets, apply automatically here once you have joined.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={createMembership.isPending}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-3 rounded-lg bg-sprout-500 text-white active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    {createMembership.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {user ? 'Join now' : 'Sign in to join'}
                  </button>
                )}
                <p className="text-[11px] text-neutral-400 text-center">
                  Cancel anytime from your profile.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </Page>
  )
}

function IntervalCard({
  active,
  onClick,
  title,
  price,
  sub,
}: {
  active: boolean
  onClick: () => void
  title: string
  price: string
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border-2 p-3 text-left transition-colors',
        active ? 'border-sprout-500 bg-sprout-50' : 'border-neutral-200 bg-white',
      )}
    >
      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{title}</p>
      <p className="text-base font-bold text-neutral-900 mt-1">{price}</p>
      <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>
    </button>
  )
}
