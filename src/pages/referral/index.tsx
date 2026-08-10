import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Share2,
    Copy,
    Users,
    Gift,
    CheckCircle,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { StatCard } from '@/components/stat-card'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useReferralCode, useReferralStats } from '@/hooks/use-referral'
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'
import { isNativePlatform, isShareCancellation, shareLinkNative } from '@/lib/native-share'
import { getPublicAppUrl } from '@/lib/app-url'

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function ReferralSkeleton() {
  return (
    <div className="py-6 space-y-6">
      <Skeleton variant="card" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton variant="stat-card" />
        <Skeleton variant="stat-card" />
        <Skeleton variant="stat-card" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ReferralPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { toast } = useToast()
  const { data: code, isLoading: codeLoading, createCode } = useReferralCode()
  const showLoading = useDelayedLoading(codeLoading)
  const { data: stats } = useReferralStats()

  const [copied, setCopied] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // getPublicAppUrl(), not window.location.origin: on native the webview origin
  // is capacitor://localhost / https://localhost, so a raw-origin invite link is
  // dead for the recipient and the referral loop produces zero joins on mobile.
  const referralLink = code
    ? `${getPublicAppUrl()}/signup?ref=${code}`
    : ''

  const handleCopy = async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      toast.success('Link copied!')
      analytics.track(ANALYTICS_EVENTS.REFERRAL_SHARED, { method: 'copy' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleShare = async () => {
    if (!referralLink) return
    const shareData = {
      title: 'Join Co-Exist',
      text: 'Join me on Co-Exist - the conservation movement for young Australians!',
      url: referralLink,
    }
    try {
      if (isNativePlatform()) {
        // Android WebView has no navigator.share - use the native sheet.
        await shareLinkNative(shareData)
        analytics.track(ANALYTICS_EVENTS.REFERRAL_SHARED, { method: 'native_share' })
      } else if (navigator.share) {
        await navigator.share(shareData)
        analytics.track(ANALYTICS_EVENTS.REFERRAL_SHARED, { method: 'native_share' })
      } else {
        await handleCopy()
      }
    } catch (err) {
      // User cancelled the share dialog  not an error
      if (isShareCancellation(err)) return
      toast.error('Could not share link')
    }
  }

  const handleCreateCode = async () => {
    setIsCreating(true)
    try {
      await createCode.mutateAsync()
    } catch {
      toast.error('Could not generate referral code')
    } finally {
      setIsCreating(false)
    }
  }

  if (showLoading || codeLoading) {
    return (
      <Page swipeBack header={<Header title="Invite Friends" back />}>
        <ReferralSkeleton />
      </Page>
    )
  }

  return (
    <Page swipeBack header={<Header title="Invite Friends" back />}>
      <div className="relative min-h-[calc(100dvh-4rem)] overflow-x-hidden">
        {/* Content */}
        <motion.div
          className="relative z-10 pb-8"
          variants={rm ? undefined : stagger}
          initial="hidden"
          animate="visible"
        >
          {/* Hero */}
          <motion.div
            variants={fadeUp}
            className="mt-4 rounded-md bg-white border border-neutral-100 shadow-sm p-5 text-center"
          >
            <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-3">
              <Gift size={28} className="text-primary-600" />
            </div>
            <h2 className="font-heading text-lg font-bold text-neutral-900">
              Grow the Movement
            </h2>
            <p className="mt-1 text-sm text-neutral-500 max-w-xs mx-auto">
              Invite friends to join Co-Exist and help grow the conservation community!
            </p>
          </motion.div>

          {/* Referral Code */}
          <motion.div
            variants={fadeUp}
            className="mt-5"
          >
            <h3 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400 mb-2">
              Your Referral Code
            </h3>
            {code ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-sm bg-white border border-neutral-100 px-4 py-3 text-center font-heading text-lg font-bold text-neutral-900 tracking-wider select-all shadow-sm">
                  {code}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    'flex items-center justify-center min-h-11 min-w-11 rounded-sm active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none shadow-sm',
                    copied
                      ? 'bg-success-100/80 border border-success-200/40 text-success-600'
                      : 'bg-white border border-neutral-100 text-neutral-600 hover:bg-neutral-50',
                  )}
                  aria-label="Copy code"
                >
                  {copied ? <CheckCircle size={20} /> : <Copy size={20} />}
                </button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                loading={isCreating}
                onClick={handleCreateCode}
              >
                Generate Your Code
              </Button>
            )}
          </motion.div>

          {/* Share button */}
          {code && (
            <motion.div variants={fadeUp} className="mt-4">
              <Button
                variant="primary"
                size="md"
                fullWidth
                icon={<Share2 size={16} />}
                onClick={handleShare}
              >
                Share Invite Link
              </Button>
            </motion.div>
          )}

          {/* Stat: friends who joined via your code.
             There is no email-invite UI (useSendInvite has no consumer) and the
             only invites-row source is accept_referral, which always inserts a
             row already marked 'accepted' - so "Invites Sent" would always equal
             "Joined" and "Pending" would be permanently 0. We surface the one
             number that is actually meaningful: friends who joined. */}
          {stats && (
            <motion.div variants={fadeUp} className="mt-6">
              <StatCard
                value={stats.accepted}
                label="Friends Joined"
                icon={<Users size={18} />}
              />
            </motion.div>
          )}

        </motion.div>
      </div>
    </Page>
  )
}
