import { useState } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useParallaxLayers } from '@/hooks/use-parallax-scroll'
import {
    Heart, Users, Repeat,
    Loader2,
    Shield, ChevronRight,
    Leaf, Sprout, TreePine, Waves, MessageCircle,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Toggle } from '@/components/toggle'
import { useCreateDonation } from '@/hooks/use-donations'
import { useAuth } from '@/hooks/use-auth'
import { WaveTransition } from '@/components/wave-transition'
import { cn } from '@/lib/cn'
import { SegmentedControl } from '@/components/segmented-control'
import { PRESET_AMOUNTS, IMPACT_EQUIVALENCIES, type DonationFrequency } from '@/types/donations'

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* Short, contextual line shown under each preset so the choice means something. */
const PRESET_HINTS: Record<number, string> = {
  5: '2 native plants',
  10: 'a cleanup kit',
  25: '~10 trees',
  50: '5m² restored',
}

/* What a gift funds, shown as a small editorial strip below the form. */
const GIFT_LINES: { icon: typeof Leaf; amount: string; text: string }[] = [
  { icon: Sprout, amount: '$10', text: 'funds a beach cleanup kit for a collective' },
  { icon: TreePine, amount: '$25', text: 'plants around ten native trees' },
  { icon: Waves, amount: '$50', text: 'restores five square metres of habitat' },
]

/* ------------------------------------------------------------------ */
/*  Parallax Hero                                                      */
/* ------------------------------------------------------------------ */

function DonateHero({ rm }: { rm: boolean }) {
  const { bgRef, fgRef, textRef } = useParallaxLayers({ textRange: 180, withScale: false })

  return (
    <div data-eos-id="src/pages/donate/index.tsx#0" data-eos-v="2" className="relative">
      <div data-eos-id="src/pages/donate/index.tsx#1" className="relative w-full h-[110vw] min-h-[480px] sm:h-auto overflow-hidden">
        <div data-eos-id="src/pages/donate/index.tsx#2" ref={rm ? undefined : bgRef} className="h-full will-change-transform">
          <img data-eos-src="static" data-eos-id="src/pages/donate/index.tsx#3"
            src="/img/donate-hero-bg.webp"
            alt="Conservation landscape"
            className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
          />
        </div>

        <div data-eos-id="src/pages/donate/index.tsx#4" ref={rm ? undefined : fgRef} className="absolute inset-0 z-[3] will-change-transform">
          <img data-eos-src="static" data-eos-id="src/pages/donate/index.tsx#5"
            src="/img/donate-hero-fg.webp"
            alt=""
            className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
          />
        </div>

        <div data-eos-id="src/pages/donate/index.tsx#6"
          ref={rm ? undefined : textRef}
          className="absolute inset-x-0 top-[20%] sm:top-[16%] z-[2] flex flex-col items-center px-6 will-change-transform"
        >
          <span data-eos-id="src/pages/donate/index.tsx#7" role="heading" aria-level={1} className="font-heading text-[2.5rem] sm:text-[3.5rem] lg:text-[5rem] font-bold uppercase text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.4)] leading-[0.85] block">
            Donate
          </span>
        </div>
      </div>

      <WaveTransition data-eos-id="src/pages/donate/index.tsx#8" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Donation form                                                      */
/* ------------------------------------------------------------------ */

function DonationForm({ rm }: { rm: boolean }) {
  const { user } = useAuth()
  const createDonation = useCreateDonation()
  const [selectedAmount, setSelectedAmount] = useState<number | null>(25)
  const [customAmount, setCustomAmount] = useState('')
  const [frequency, setFrequency] = useState<DonationFrequency>('one_time')
  const [message, setMessage] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const amount = selectedAmount ?? (Number(customAmount) || 0)
  const isValid = amount >= 1 && amount <= 50000

  const impactText = (() => {
    const thresholds = Object.keys(IMPACT_EQUIVALENCIES).map(Number).sort((a, b) => b - a)
    const match = thresholds.find((t) => amount >= t)
    return match ? IMPACT_EQUIVALENCIES[match] : null
  })()

  const handlePresetSelect = (preset: number) => {
    setSelectedAmount(preset)
    setCustomAmount('')
  }

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSelectedAmount(null)
    setCustomAmount(e.target.value)
  }

  const handleDonate = async () => {
    if (!isValid) return
    try {
      const result = await createDonation.mutateAsync({
        amount,
        frequency,
        message: message.trim() || undefined,
        isPublic,
      })
      if (result.url) window.location.href = result.url
    } catch {
      // handled by TanStack Query
    }
  }

  return (
    <div data-eos-id="src/pages/donate/index.tsx#9" className="relative overflow-hidden rounded-md bg-white border border-neutral-100 shadow-[0_8px_40px_-12px_rgba(61,77,51,0.18)] p-6">
      {/* Leaf watermark */}
      <Leaf data-eos-id="src/pages/donate/index.tsx#10" className="pointer-events-none absolute -top-5 -right-5 text-primary-600/[0.06]" size={120} strokeWidth={1.5} />

      {/* Header */}
      <div data-eos-id="src/pages/donate/index.tsx#11" className="relative flex items-center gap-3 mb-6">
        <div data-eos-id="src/pages/donate/index.tsx#12" className="w-11 h-11 rounded-md bg-primary-50 flex items-center justify-center shrink-0">
          <Heart data-eos-id="src/pages/donate/index.tsx#13" size={19} className="text-primary-600" />
        </div>
        <div data-eos-id="src/pages/donate/index.tsx#14">
          <h2 data-eos-id="src/pages/donate/index.tsx#15" className="font-heading text-xl sm:text-2xl font-bold text-neutral-900">Make a donation</h2>
          <div data-eos-id="src/pages/donate/index.tsx#16" className="flex items-center gap-1.5 mt-0.5">
            <Shield data-eos-id="src/pages/donate/index.tsx#17" size={11} className="text-neutral-400" />
            <p data-eos-id="src/pages/donate/index.tsx#18" className="text-[11px] text-neutral-500 font-medium">Secure payment via Stripe</p>
          </div>
        </div>
      </div>

      {/* Frequency toggle */}
      <div data-eos-id="src/pages/donate/index.tsx#19" className="relative mb-6">
        <SegmentedControl data-eos-id="src/pages/donate/index.tsx#20"
          segments={[
            { id: 'one_time' as const, label: 'One-time', icon: <Heart data-eos-id="src/pages/donate/index.tsx#21" size={15} /> },
            { id: 'monthly' as const, label: 'Monthly', icon: <Repeat data-eos-id="src/pages/donate/index.tsx#22" size={15} /> },
          ]}
          value={frequency}
          onChange={setFrequency}
          variant="pill"
          aria-label="Donation frequency"
        />
      </div>

      {/* Preset amounts */}
      <p data-eos-id="src/pages/donate/index.tsx#23" className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Choose an amount</p>
      <div data-eos-id="src/pages/donate/index.tsx#24" className="grid grid-cols-4 gap-2.5 mb-4">
        {PRESET_AMOUNTS.map((preset) => {
          const active = selectedAmount === preset
          return (
            <motion.button data-eos-id="src/pages/donate/index.tsx#25"
              key={preset}
              type="button"
              onClick={() => handlePresetSelect(preset)}
              whileTap={rm ? undefined : { scale: 0.95 }}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 py-3.5 px-1 rounded-md border transition-all duration-200 cursor-pointer',
                active
                  ? 'border-primary-600 bg-primary-600 text-white shadow-[0_6px_18px_-6px_rgba(134,158,98,0.7)]'
                  : 'border-neutral-200 bg-white hover:border-primary-300 hover:bg-primary-50/40',
              )}
            >
              <span data-eos-id="src/pages/donate/index.tsx#26" className={cn('font-heading font-black text-[1.35rem] leading-none', active ? 'text-white' : 'text-neutral-900')}>${preset}</span>
              <span data-eos-id="src/pages/donate/index.tsx#27" data-eos-var="PRESET_HINTS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className={cn('text-[9.5px] font-medium leading-tight text-center', active ? 'text-white/80' : 'text-neutral-400')}>
                {PRESET_HINTS[preset]}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* Custom amount */}
      <div data-eos-id="src/pages/donate/index.tsx#28" className="mb-5">
        <Input data-eos-id="src/pages/donate/index.tsx#29"
          type="number"
          placeholder="Enter a custom amount"
          value={customAmount}
          onChange={handleCustomChange}
          icon={<span data-eos-id="src/pages/donate/index.tsx#30" className="text-neutral-500 font-bold text-base">$</span>}
          inputClassName="bg-neutral-100/70 border border-neutral-200 focus:bg-white focus:border-primary-400"
          min="1"
          max="50000"
          step="1"
          compact
        />
      </div>

      {/* Impact callout */}
      <div data-eos-id="src/pages/donate/index.tsx#31"
        className="relative mb-5 px-4 py-3.5 rounded-md bg-gradient-to-br from-primary-50 to-white border border-primary-100 overflow-hidden"
        style={{ minHeight: '84px' }}
      >
        <Sprout data-eos-id="src/pages/donate/index.tsx#32" className="pointer-events-none absolute -bottom-3 -right-2 text-primary-600/[0.07]" size={72} strokeWidth={1.5} />
        <motion.p data-eos-id="src/pages/donate/index.tsx#33"
          key={`${impactText ?? ''}-${amount}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: isValid && impactText ? 1 : 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative text-[15px] text-neutral-900 leading-relaxed font-semibold"
        >
          <span data-eos-id="src/pages/donate/index.tsx#34" className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-primary-100 mr-1.5 -mt-0.5 align-middle">
            <Leaf data-eos-id="src/pages/donate/index.tsx#35" size={11} className="text-primary-700" />
          </span>
          {isValid && impactText
            ? <>Your ${amount} {impactText}</>
            : <span data-eos-id="src/pages/donate/index.tsx#36" className="text-neutral-400 font-medium">Choose an amount to see your impact</span>}
        </motion.p>
        <motion.p data-eos-id="src/pages/donate/index.tsx#37"
          initial={false}
          animate={{ opacity: isValid && impactText && frequency === 'monthly' ? 1 : 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative text-xs text-neutral-500 mt-1.5 pl-[22px]"
        >
          That&apos;s <span data-eos-id="src/pages/donate/index.tsx#38" className="font-semibold text-primary-700">${amount * 12}/year</span> of sustained impact
        </motion.p>
      </div>

      {/* Divider */}
      <div data-eos-id="src/pages/donate/index.tsx#39" className="h-px bg-gradient-to-r from-transparent via-neutral-100 to-transparent mb-5" />

      {/* Optional message */}
      <div data-eos-id="src/pages/donate/index.tsx#40" className="mb-4">
        <p data-eos-id="src/pages/donate/index.tsx#41" className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
          <MessageCircle data-eos-id="src/pages/donate/index.tsx#42" size={12} />
          Leave a message
        </p>
        <Input data-eos-id="src/pages/donate/index.tsx#43"
          type="textarea"
          placeholder="Share why you're supporting Co-Exist (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          inputClassName="bg-neutral-100/70 border border-neutral-200 focus:bg-white focus:border-primary-400"
          rows={2}
          maxLength={200}
          compact
        />
        {message.length > 0 && (
          <p data-eos-id="src/pages/donate/index.tsx#44" className="text-[10px] text-neutral-400 text-right mt-1">{message.length}/200</p>
        )}
      </div>

      {/* Public toggle */}
      <div data-eos-id="src/pages/donate/index.tsx#45" className="mb-6 px-4 py-3 rounded-md bg-neutral-100/70 border border-neutral-200">
        <Toggle data-eos-id="src/pages/donate/index.tsx#46"
          checked={isPublic}
          onChange={setIsPublic}
          label="Show on donor wall"
          description="Your name and amount will be visible to others"
          size="sm"
        />
      </div>

      {/* Donate button */}
      <Button data-eos-id="src/pages/donate/index.tsx#47" data-eos-var="createDonation.isPending" data-eos-var-label="Is pending" data-eos-var-scope="prop"
        variant="primary"
        size="lg"
        fullWidth
        icon={createDonation.isPending ? <Loader2 data-eos-id="src/pages/donate/index.tsx#48" size={18} className="animate-spin" /> : <Heart data-eos-id="src/pages/donate/index.tsx#49" size={18} />}
        onClick={handleDonate}
        disabled={!isValid || !user || createDonation.isPending}
        className="shadow-[0_8px_24px_-8px_rgba(61,77,51,0.5)] !rounded-md"
      >
        {createDonation.isPending ? 'Setting up...' : `Donate $${amount}${frequency === 'monthly' ? '/mo' : ''}`}
      </Button>

      {createDonation.isError && (
        <p data-eos-id="src/pages/donate/index.tsx#50" className="text-xs text-error-500 text-center mt-2">Something went wrong. Please try again.</p>
      )}

      {!user && (
        <p data-eos-id="src/pages/donate/index.tsx#51" className="text-xs text-neutral-400 text-center mt-3">
          <Link data-eos-id="src/pages/donate/index.tsx#52" to="/auth/login" className="underline text-primary-600 font-medium">Sign in</Link> to donate and track your impact
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main donate page                                                   */
/* ------------------------------------------------------------------ */

export default function DonatePage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  return (
    <Page data-eos-id="src/pages/donate/index.tsx#53"
      swipeBack
      noBackground
      className="!px-0 !bg-transparent"
      stickyOverlay={<Header data-eos-id="src/pages/donate/index.tsx#54" title="" back transparent className="collapse-header" />}
    >
      <div data-eos-id="src/pages/donate/index.tsx#55" className="relative min-h-dvh bg-white">
        <DonateHero data-eos-id="src/pages/donate/index.tsx#56" rm={rm} />

        <div data-eos-id="src/pages/donate/index.tsx#57" className="relative z-10 px-5 lg:px-6 pt-6">
          <div data-eos-id="src/pages/donate/index.tsx#58" className="max-w-lg lg:max-w-5xl mx-auto">
            <motion.div data-eos-id="src/pages/donate/index.tsx#59"
              variants={rm ? undefined : stagger}
              initial="hidden"
              animate="visible"
              className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-7 lg:items-start"
            >
              {/* Donation form (left column on laptop) */}
              <motion.div data-eos-id="src/pages/donate/index.tsx#60" variants={fadeUp}>
                <DonationForm data-eos-id="src/pages/donate/index.tsx#61" rm={rm} />
              </motion.div>

              {/* Supporting cards (right column on laptop, stacked on mobile) */}
              <div data-eos-id="src/pages/donate/index.tsx#62" className="space-y-5">
              {/* Where your gift goes */}
              <motion.div data-eos-id="src/pages/donate/index.tsx#63" variants={fadeUp}>
                <div data-eos-id="src/pages/donate/index.tsx#64" className="rounded-md bg-primary-800 text-white p-6 overflow-hidden relative">
                  <TreePine data-eos-id="src/pages/donate/index.tsx#65" className="pointer-events-none absolute -bottom-6 -right-4 text-white/[0.06]" size={130} strokeWidth={1.4} />
                  <p data-eos-id="src/pages/donate/index.tsx#66" className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary-200 mb-4">Where your gift goes</p>
                  <div data-eos-id="src/pages/donate/index.tsx#67" className="space-y-3.5">
                    {GIFT_LINES.map(({ icon: Icon, amount, text }) => (
                      <div data-eos-id="src/pages/donate/index.tsx#68" key={amount} className="flex items-start gap-3">
                        <div data-eos-id="src/pages/donate/index.tsx#69" className="w-9 h-9 rounded-sm bg-white/10 flex items-center justify-center shrink-0">
                          <Icon data-eos-id="src/pages/donate/index.tsx#70" size={16} className="text-primary-200" />
                        </div>
                        <p data-eos-id="src/pages/donate/index.tsx#71" className="text-[15px] leading-snug text-white/85 pt-1.5">
                          <span data-eos-id="src/pages/donate/index.tsx#72" className="font-bold text-white">{amount}</span> {text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Donor wall link */}
              <motion.div data-eos-id="src/pages/donate/index.tsx#73" variants={fadeUp}>
                <Link data-eos-id="src/pages/donate/index.tsx#74"
                  to="/donate/donors"
                  className="relative flex items-center gap-3 p-4 rounded-md bg-white border border-neutral-100 shadow-sm transition-all active:scale-[0.98] duration-200 overflow-hidden"
                >
                  <Users data-eos-id="src/pages/donate/index.tsx#75" className="pointer-events-none absolute -bottom-3 -right-3 text-primary-600/[0.05]" size={64} strokeWidth={1.5} />
                  <div data-eos-id="src/pages/donate/index.tsx#76" className="w-10 h-10 rounded-sm bg-primary-50 flex items-center justify-center shrink-0">
                    <Users data-eos-id="src/pages/donate/index.tsx#77" size={18} className="text-primary-600" />
                  </div>
                  <div data-eos-id="src/pages/donate/index.tsx#78" className="flex-1 min-w-0">
                    <p data-eos-id="src/pages/donate/index.tsx#79" className="font-heading text-sm font-bold text-neutral-900">View donor wall</p>
                    <p data-eos-id="src/pages/donate/index.tsx#80" className="text-xs text-neutral-500 mt-0.5">See who&apos;s making a difference</p>
                  </div>
                  <ChevronRight data-eos-id="src/pages/donate/index.tsx#81" size={18} className="text-neutral-400 shrink-0" />
                </Link>
              </motion.div>

              {/* Tax note */}
              <motion.div data-eos-id="src/pages/donate/index.tsx#82" variants={fadeUp}>
                <div data-eos-id="src/pages/donate/index.tsx#83" className="flex items-start gap-3 px-4 py-3.5 rounded-md bg-white border border-neutral-100 shadow-sm">
                  <Shield data-eos-id="src/pages/donate/index.tsx#84" size={16} className="text-primary-500 shrink-0 mt-0.5" />
                  <div data-eos-id="src/pages/donate/index.tsx#85">
                    <p data-eos-id="src/pages/donate/index.tsx#86" className="text-xs text-neutral-700 font-semibold">Tax-deductible giving</p>
                    <p data-eos-id="src/pages/donate/index.tsx#87" className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                      Co-Exist Australia is DGR-registered. Donations over $2 are tax-deductible. You&apos;ll receive a receipt via email.
                    </p>
                  </div>
                </div>
              </motion.div>
              </div>
            </motion.div>

            <div data-eos-id="src/pages/donate/index.tsx#88" className="h-20" />
          </div>
        </div>
      </div>
    </Page>
  )
}
