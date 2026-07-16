import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  Heart, Share2, Calendar, Users, Trophy,
  Leaf, Sparkles,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { WhatsNext } from '@/components/whats-next'
import { WaveTransition } from '@/components/wave-transition'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { getImpactMessage } from '@/types/donations'

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } },
}
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* ------------------------------------------------------------------ */
/*  Confetti burst                                                     */
/* ------------------------------------------------------------------ */

const PARTICLE_COUNT = 40
const CONFETTI_COLORS = [
  '#5a835a', '#6b9b6b', '#b07d46', '#c89454', '#e97c28',
  '#4ade80', '#a3d977', '#d4a853', '#8fbc6a', '#e8b960',
  '#7cb07c', '#c5a25e',
]
const SHAPES = ['circle', 'square', 'strip'] as const

function Confetti({ rm }: { rm: boolean }) {
  const [particles] = useState(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: Math.random() * 100,
      delay: Math.random() * 0.6,
      width: 5 + Math.random() * 9,
      height: 5 + Math.random() * 9,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 80,
      duration: 2.8 + Math.random() * 1.5,
      shape: SHAPES[i % SHAPES.length],
    })),
  )

  if (rm) return null

  return (
    <div data-eos-id="src/pages/donate/thank-you.tsx#0" className="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map((p, i) => (
        <motion.div data-eos-id="src/pages/donate/thank-you.tsx#1"
          key={i}
          initial={{ y: -20, x: `${p.x}vw`, opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            y: '110vh',
            x: `calc(${p.x}vw + ${p.drift}px)`,
            rotate: p.rotation + 720,
            opacity: [1, 1, 1, 0],
            scale: [1, 1, 0.6],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="absolute"
          style={{
            width: p.shape === 'strip' ? p.width * 0.4 : p.width,
            height: p.shape === 'strip' ? p.height * 2 : p.height,
            borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'strip' ? '1px' : '2px',
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Decorative depth elements (celebration variant)                    */
/* ------------------------------------------------------------------ */

function CelebrationDepthElements({ rm: _rm }: { rm: boolean }) {
  return null
}

/* ------------------------------------------------------------------ */
/*  Pulsing heart icon                                                 */
/* ------------------------------------------------------------------ */

function CelebrationHeart({ rm }: { rm: boolean }) {
  return (
    <div data-eos-id="src/pages/donate/thank-you.tsx#2" className="relative">
      {/* Heart container */}
      <motion.div data-eos-id="src/pages/donate/thank-you.tsx#3"
        initial={rm ? false : { scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.3 }}
        className="relative w-20 h-20 rounded-full flex items-center justify-center"
      >
        <div data-eos-id="src/pages/donate/thank-you.tsx#4" className="absolute inset-0 rounded-full bg-primary-500" />
        <motion.div data-eos-id="src/pages/donate/thank-you.tsx#5"
          animate={rm ? undefined : { scale: [1, 1.12, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="relative z-10"
        >
          <Heart data-eos-id="src/pages/donate/thank-you.tsx#6" size={32} className="text-white drop-shadow-sm" fill="currentColor" />
        </motion.div>
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Thank you page                                                     */
/* ------------------------------------------------------------------ */

export default function DonateThankYouPage() {
  const [searchParams] = useSearchParams()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const [showConfetti, setShowConfetti] = useState(true)
  const { toast } = useToast()

  const rawAmount = Number(searchParams.get('amount') ?? 25)
  const amount = Number.isFinite(rawAmount) && rawAmount >= 1 && rawAmount <= 50000
    ? rawAmount
    : 25
  const isRecurring = searchParams.get('recurring') === 'true'
  const impactMessage = getImpactMessage(amount)
  const points = Math.floor(amount)

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  const handleShare = async () => {
    const recurringLabel = isRecurring ? ' monthly' : ''
    const text = `I just donated $${amount}${recurringLabel} to Co-Exist Australia! Every dollar goes to conservation. Join me: coexistaus.org/donate`
    if (navigator.share) {
      try {
        await navigator.share({ text, url: 'https://coexistaus.org/donate' })
      } catch (err) {
        // AbortError = user dismissed the share sheet - silent. Anything else
        // is a real failure and we should fall back to clipboard.
        if (err instanceof Error && err.name === 'AbortError') return
        try {
          await navigator.clipboard.writeText(text)
          toast.success('Copied to clipboard')
        } catch {
          toast.error('Could not share')
        }
      }
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  return (
    <Page data-eos-id="src/pages/donate/thank-you.tsx#7"
      swipeBack
      noBackground
      fullBleed
      className="!bg-transparent"
      stickyOverlay={<Header data-eos-id="src/pages/donate/thank-you.tsx#8" title="" back transparent className="!fixed pointer-events-none [&_button]:pointer-events-auto" />}
    >
      <div data-eos-id="src/pages/donate/thank-you.tsx#9" className="relative min-h-dvh">
        {/* ── Background ── */}
        <div data-eos-id="src/pages/donate/thank-you.tsx#10" className="absolute inset-0 pointer-events-none overflow-hidden">
          <div data-eos-id="src/pages/donate/thank-you.tsx#11" className="absolute inset-0 bg-white" />
        </div>

        <CelebrationDepthElements data-eos-id="src/pages/donate/thank-you.tsx#12" rm={rm} />
        {showConfetti && <Confetti data-eos-id="src/pages/donate/thank-you.tsx#13" rm={rm} />}

        {/* ── Hero celebration area ── */}
        <div data-eos-id="src/pages/donate/thank-you.tsx#14" className="relative overflow-hidden">
          {/* Warm gradient hero band */}
          <div data-eos-id="src/pages/donate/thank-you.tsx#15" className="relative pt-16 pb-14 sm:pt-20 sm:pb-16">
            <div data-eos-id="src/pages/donate/thank-you.tsx#16" className="absolute inset-0 bg-white" />

            <motion.div data-eos-id="src/pages/donate/thank-you.tsx#17"
              variants={rm ? undefined : stagger}
              initial="hidden"
              animate="visible"
              className="relative z-10 flex flex-col items-center px-6"
            >
              {/* Heart icon with glow */}
              <motion.div data-eos-id="src/pages/donate/thank-you.tsx#18" variants={fadeUp}>
                <CelebrationHeart data-eos-id="src/pages/donate/thank-you.tsx#19" rm={rm} />
              </motion.div>

              {/* Heading */}
              <motion.div data-eos-id="src/pages/donate/thank-you.tsx#20" variants={fadeUp} className="mt-6 text-center">
                <span data-eos-id="src/pages/donate/thank-you.tsx#21" className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500 block mb-1.5">
                  Donation Successful
                </span>
                <h1 data-eos-id="src/pages/donate/thank-you.tsx#22" className="font-heading text-[2rem] sm:text-[2.5rem] font-bold text-neutral-900 leading-tight">
                  Thank you!
                </h1>
              </motion.div>

              {/* Amount display */}
              <motion.div data-eos-id="src/pages/donate/thank-you.tsx#23" variants={fadeUp} className="mt-4 text-center">
                <p data-eos-id="src/pages/donate/thank-you.tsx#24" className="font-heading text-4xl sm:text-5xl font-extrabold tabular-nums text-neutral-900 tracking-tight">
                  ${amount}
                  {isRecurring && (
                    <span data-eos-id="src/pages/donate/thank-you.tsx#25" className="text-xl sm:text-2xl font-bold text-neutral-500 ml-1">/mo</span>
                  )}
                </p>
                {isRecurring && (
                  <p data-eos-id="src/pages/donate/thank-you.tsx#26" className="mt-1.5 text-xs text-neutral-500 font-medium">
                    Monthly donation &middot; cancel anytime from your profile
                  </p>
                )}
              </motion.div>

              {/* Points pill */}
              <motion.div data-eos-id="src/pages/donate/thank-you.tsx#27" variants={fadeUp} className="mt-4">
                <motion.div data-eos-id="src/pages/donate/thank-you.tsx#28"
                  initial={rm ? false : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.8 }}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-full',
                    'bg-primary-500',
                    'shadow-sm',
                  )}
                >
                  <Sparkles data-eos-id="src/pages/donate/thank-you.tsx#29" size={14} className="text-white/90" />
                  <span data-eos-id="src/pages/donate/thank-you.tsx#30" className="text-sm font-bold text-white tabular-nums">
                    +{points} points
                  </span>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>

          {/* Organic edge */}
          <WaveTransition data-eos-id="src/pages/donate/thank-you.tsx#31" size="sm" />
        </div>

        {/* ── Content ── */}
        <div data-eos-id="src/pages/donate/thank-you.tsx#32" className="relative z-10 px-5 lg:px-6 -mt-2">
          <div data-eos-id="src/pages/donate/thank-you.tsx#33" className="max-w-lg mx-auto">
            <motion.div data-eos-id="src/pages/donate/thank-you.tsx#34"
              variants={rm ? undefined : stagger}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              {/* ── Impact card ── */}
              <motion.div data-eos-id="src/pages/donate/thank-you.tsx#35" variants={fadeUp}>
                <div data-eos-id="src/pages/donate/thank-you.tsx#36" className="bg-white border border-neutral-100 shadow-sm rounded-md overflow-hidden">
                  <div data-eos-id="src/pages/donate/thank-you.tsx#37" className="p-5">
                    <div data-eos-id="src/pages/donate/thank-you.tsx#38" className="flex items-start gap-3 mb-3">
                      <div data-eos-id="src/pages/donate/thank-you.tsx#39" className="w-10 h-10 rounded-sm bg-primary-500 flex items-center justify-center shrink-0">
                        <Leaf data-eos-id="src/pages/donate/thank-you.tsx#40" size={18} className="text-white" />
                      </div>
                      <div data-eos-id="src/pages/donate/thank-you.tsx#41">
                        <p data-eos-id="src/pages/donate/thank-you.tsx#42" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                          Your Impact
                        </p>
                        <p data-eos-id="src/pages/donate/thank-you.tsx#43" className="text-sm text-neutral-900 font-medium leading-relaxed mt-1">
                          {impactMessage}
                        </p>
                      </div>
                    </div>

                    {isRecurring && (
                      <>
                        <div data-eos-id="src/pages/donate/thank-you.tsx#44" className="h-px bg-gradient-to-r from-transparent via-neutral-100 to-transparent my-3" />
                        <div data-eos-id="src/pages/donate/thank-you.tsx#45" className="px-4 py-3 rounded-md bg-neutral-50 border border-neutral-100">
                          <p data-eos-id="src/pages/donate/thank-you.tsx#46" className="text-xs text-primary-600 font-medium">
                            <span data-eos-id="src/pages/donate/thank-you.tsx#47" className="font-bold text-primary-700 tabular-nums">${amount * 12}/year</span> of sustained conservation impact
                          </p>
                          <p data-eos-id="src/pages/donate/thank-you.tsx#48" className="text-[11px] text-neutral-500 mt-0.5">
                            Your monthly support provides ongoing, predictable funding for habitat restoration
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* ── Share button ── */}
              <motion.div data-eos-id="src/pages/donate/thank-you.tsx#49" variants={fadeUp}>
                <button data-eos-id="src/pages/donate/thank-you.tsx#50"
                  type="button"
                  onClick={handleShare}
                  className={cn(
                    'flex items-center gap-3 w-full p-4',
                    'bg-white border border-neutral-100 shadow-sm rounded-md',
                    'transition-all active:scale-[0.98] duration-200',
                    'min-h-[44px]',
                  )}
                >
                  <div data-eos-id="src/pages/donate/thank-you.tsx#51" className="w-10 h-10 rounded-sm bg-primary-500 flex items-center justify-center shrink-0">
                    <Share2 data-eos-id="src/pages/donate/thank-you.tsx#52" size={18} className="text-white" />
                  </div>
                  <div data-eos-id="src/pages/donate/thank-you.tsx#53" className="flex-1 min-w-0 text-left">
                    <p data-eos-id="src/pages/donate/thank-you.tsx#54" className="font-heading text-sm font-bold text-neutral-900">
                      Share your impact
                    </p>
                    <p data-eos-id="src/pages/donate/thank-you.tsx#55" className="text-xs text-neutral-500 mt-0.5">
                      Inspire others to support conservation
                    </p>
                  </div>
                </button>
              </motion.div>

              {/* ── Divider ── */}
              <div data-eos-id="src/pages/donate/thank-you.tsx#56" className="h-px bg-gradient-to-r from-transparent via-neutral-100 to-transparent" />

              {/* ── What's next ── */}
              <motion.div data-eos-id="src/pages/donate/thank-you.tsx#57" variants={fadeUp}>
                <WhatsNext data-eos-id="src/pages/donate/thank-you.tsx#58"
                  suggestions={[
                    {
                      label: 'Find an Event',
                      description: 'Put your donation into action',
                      icon: <Calendar data-eos-id="src/pages/donate/thank-you.tsx#59" size={18} />,
                      to: '/events',
                    },
                    {
                      label: 'View Donor Wall',
                      description: 'See the community of supporters',
                      icon: <Users data-eos-id="src/pages/donate/thank-you.tsx#60" size={18} />,
                      to: '/donate/donors',
                    },
                    {
                      label: 'View Your Impact',
                      description: 'See how your contributions add up',
                      icon: <Trophy data-eos-id="src/pages/donate/thank-you.tsx#61" size={18} />,
                      to: '/profile',
                    },
                  ]}
                />
              </motion.div>

              {/* ── Tax note ── */}
              <motion.div data-eos-id="src/pages/donate/thank-you.tsx#62" variants={fadeUp}>
                <p data-eos-id="src/pages/donate/thank-you.tsx#63" className="text-[11px] text-neutral-400 text-center leading-relaxed pb-2">
                  A receipt has been sent to your email.
                  <br data-eos-id="src/pages/donate/thank-you.tsx#64" />
                  Donations over $2 are tax-deductible.
                </p>
              </motion.div>

              <div data-eos-id="src/pages/donate/thank-you.tsx#65" className="h-20" />
            </motion.div>
          </div>
        </div>
      </div>
    </Page>
  )
}
