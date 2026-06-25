import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { TreePine, Globe, Shield, Users, Calendar, BarChart3, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OGMeta } from '@/components/og-meta'
import { APP_NAME, TAGLINE, WEBSITE_URL, INSTAGRAM_URL } from '@/lib/constants'
import { WebFooter } from '@/components/web-footer'
import { useNationalImpact } from '@/hooks/use-impact'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'
import { getDevicePlatform, APP_STORE_URL, PLAY_STORE_URL } from '@/lib/device-platform'

const WEB_APP_URL = '/'

function formatStat(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k+`
  return `${n}+`
}

/* ------------------------------------------------------------------ */
/*  Store badges                                                       */
/* ------------------------------------------------------------------ */

function AppStoreBadge({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-3 px-5 py-3.5 rounded-md bg-white text-secondary-950',
        'hover:bg-white/90 active:scale-[0.98] transition-all duration-150 cursor-pointer select-none shadow-lg min-h-14',
        className,
      )}
      aria-label="Download on the App Store"
    >
      <svg width="22" height="26" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true">
        <path d="M16.52 12.46c-.03-2.85 2.33-4.22 2.44-4.29-1.33-1.94-3.4-2.21-4.13-2.24-1.76-.18-3.43 1.04-4.33 1.04-.89 0-2.27-1.01-3.73-.99-1.92.03-3.69 1.12-4.68 2.84-1.99 3.46-.51 8.59 1.43 11.4.95 1.37 2.08 2.92 3.57 2.86 1.43-.06 1.97-.93 3.7-.93 1.73 0 2.22.93 3.73.9 1.54-.03 2.52-1.4 3.46-2.78 1.09-1.59 1.54-3.13 1.57-3.21-.03-.01-3.01-1.16-3.04-4.6zm-2.85-8.46c.79-.96 1.32-2.29 1.18-3.62-1.14.05-2.52.76-3.34 1.72-.73.85-1.37 2.2-1.2 3.5 1.27.1 2.57-.65 3.36-1.6z" />
      </svg>
      <div className="text-left">
        <p className="text-[11px] leading-tight opacity-60">Download on the</p>
        <p className="text-[17px] font-semibold leading-tight -mt-0.5">App Store</p>
      </div>
    </button>
  )
}

function PlayStoreBadge({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-3 px-5 py-3.5 rounded-md bg-white text-secondary-950',
        'hover:bg-white/90 active:scale-[0.98] transition-all duration-150 cursor-pointer select-none shadow-lg min-h-14',
        className,
      )}
      aria-label="Get it on Google Play"
    >
      <svg width="22" height="24" viewBox="0 0 20 22" aria-hidden="true">
        <path d="M1.22.52C.93.83.75 1.3.75 1.89v18.22c0 .59.18 1.06.47 1.37l.07.07L11.5 11.34v-.25L1.29.45l-.07.07z" fill="#4285F4" />
        <path d="M14.9 14.73l-3.4-3.39v-.25l3.4-3.39.08.04 4.02 2.29c1.15.65 1.15 1.72 0 2.37l-4.02 2.29-.08.04z" fill="#FBBC04" />
        <path d="M15 14.69L11.5 11.1 1.29 21.48c.38.4.99.45 1.7.05L15 14.69z" fill="#EA4335" />
        <path d="M15 7.74L2.99.9c-.71-.4-1.32-.35-1.7.05L11.5 11.34 15 7.74z" fill="#34A853" />
      </svg>
      <div className="text-left">
        <p className="text-[11px] leading-tight opacity-60">Get it on</p>
        <p className="text-[17px] font-semibold leading-tight -mt-0.5">Google Play</p>
      </div>
    </button>
  )
}

/** Platform-aware store CTAs: App Store on iOS, Play on Android, both on web. */
function StoreCTAs({ platform, onWeb }: { platform: 'ios' | 'android' | 'web'; onWeb?: () => void }) {
  return (
    <div className="space-y-3">
      {platform === 'web' ? (
        <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
          <AppStoreBadge className="sm:flex-1 justify-center" onClick={() => window.open(APP_STORE_URL, '_blank')} />
          <PlayStoreBadge className="sm:flex-1 justify-center" onClick={() => window.open(PLAY_STORE_URL, '_blank')} />
        </div>
      ) : platform === 'ios' ? (
        <AppStoreBadge className="w-full justify-center" onClick={() => window.open(APP_STORE_URL, '_blank')} />
      ) : (
        <PlayStoreBadge className="w-full justify-center" onClick={() => window.open(PLAY_STORE_URL, '_blank')} />
      )}
      {onWeb && (
        <button
          type="button"
          onClick={onWeb}
          className="w-full py-3 rounded-md text-white/70 text-sm font-medium hover:text-white hover:bg-white/5 active:scale-[0.98] transition-all cursor-pointer select-none inline-flex items-center justify-center gap-2"
        >
          <Globe size={15} /> Continue on web
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Feature                                                            */
/* ------------------------------------------------------------------ */

function Feature({ icon: Icon, title, desc }: { icon: typeof TreePine; title: string; desc: string }) {
  return (
    <div className="group relative rounded-lg bg-white border border-neutral-200 p-6 transition-colors duration-200 hover:border-moss-200">
      <div className="w-12 h-12 rounded-md bg-moss-50 flex items-center justify-center mb-4 transition-colors duration-200 group-hover:bg-moss-100">
        <Icon size={22} className="text-moss-700" />
      </div>
      <h3 className="font-heading text-lg font-bold text-neutral-900 mb-1.5">{title}</h3>
      <p className="text-sm text-neutral-500 leading-relaxed">{desc}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DownloadPage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const platform = getDevicePlatform()
  const { data: liveStats } = useNationalImpact()

  const stats = [
    { value: liveStats ? formatStat(liveStats.treesPlanted) : '...', label: 'Trees planted' },
    { value: liveStats ? formatStat(liveStats.eventsAttended) : '...', label: 'Volunteers' },
    { value: liveStats ? formatStat(liveStats.eventsHeld) : '...', label: 'Events held' },
    { value: liveStats ? String(liveStats.collectivesCount) : '...', label: 'Collectives' },
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <OGMeta
        title="Download the App"
        description="Download the free Co-Exist app for iOS and Android. Join 5,500+ volunteers planting native trees, cleaning beaches, and restoring habitats across Australia."
        canonicalPath="/download"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Co-Exist',
            operatingSystem: 'iOS, Android',
            applicationCategory: 'LifestyleApplication',
            description: "Australia's young adult conservation app. Join events, connect with collectives, and track your environmental impact.",
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Co-Exist Australia',
            url: 'https://www.coexistaus.org',
            sameAs: ['https://www.instagram.com/coexistaus'],
            description: "Australia's young adult conservation movement connecting volunteers with local environmental events.",
          },
        ]}
      />

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  HERO + STATS - one immersive dark block                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <img src="/img/home-hero-bg.webp" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-secondary-950/75 via-secondary-950/65 to-secondary-950" />
        </div>

        <motion.div
          className="mx-auto max-w-xl text-center px-6 pt-20 pb-12 sm:pt-28 sm:pb-16"
          variants={rm ? undefined : stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.img
            variants={rm ? undefined : fadeUp}
            src="/logos/white-wordmark.webp"
            alt={APP_NAME}
            className="mx-auto h-16 sm:h-20 w-auto drop-shadow-[0_2px_16px_rgba(0,0,0,0.4)]"
          />

          <motion.p variants={rm ? undefined : fadeUp} className="mt-5 font-heading text-xl sm:text-2xl italic text-white/85">
            {TAGLINE}
          </motion.p>
          <motion.p variants={rm ? undefined : fadeUp} className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-white/55">
            Join thousands of young Australians restoring habitat, one weekend at a time. Free, forever.
          </motion.p>

          <motion.div variants={rm ? undefined : fadeUp} className="mt-9">
            <StoreCTAs platform={platform} onWeb={() => navigate(WEB_APP_URL)} />
          </motion.div>

          <motion.div variants={rm ? undefined : fadeUp} className="mt-6 flex items-center justify-center gap-3.5 text-[11px] font-medium text-white/45">
            <span className="flex items-center gap-1.5"><Shield size={12} /> 100% free</span>
            <span className="text-white/20">|</span>
            <span>iOS &amp; Android</span>
            <span className="text-white/20">|</span>
            <span>Ages 18-30</span>
          </motion.div>
        </motion.div>

        {/* Stat strip - integrated into the dark hero */}
        <motion.div
          className="relative border-t border-white/10"
          initial={rm ? undefined : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="mx-auto max-w-3xl grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10">
            {stats.map((s) => (
              <div key={s.label} className="px-4 py-7 text-center">
                <p className="font-heading text-3xl sm:text-4xl font-bold text-white tabular-nums">{s.value}</p>
                <p className="mt-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  FEATURES                                                    */}
      {/* ════════════════════════════════════════════════════════════ */}
      <motion.section
        className="mx-auto max-w-4xl w-full px-6 py-16 sm:py-20"
        variants={rm ? undefined : stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
      >
        <motion.div variants={rm ? undefined : fadeUp} className="text-center mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-moss-500 mb-2.5">Everything in one place</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-neutral-900">What you can do</h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div variants={rm ? undefined : fadeUp}>
            <Feature icon={Calendar} title="Join events" desc="Find conservation events near you and register in a tap. Tree plantings, beach cleans, habitat days." />
          </motion.div>
          <motion.div variants={rm ? undefined : fadeUp}>
            <Feature icon={Users} title="Find your people" desc="Connect with your local collective, make friends, and show up together for the places you love." />
          </motion.div>
          <motion.div variants={rm ? undefined : fadeUp}>
            <Feature icon={BarChart3} title="Track your impact" desc="Watch your trees planted, litter removed, and hours volunteered add up over time." />
          </motion.div>
        </div>
      </motion.section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  CLOSER                                                      */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden bg-secondary-950">
        <div className="mx-auto max-w-xl text-center px-6 py-16 sm:py-20">
          <motion.div
            initial={rm ? undefined : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
          >
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white">Ready to begin?</h2>
            <p className="mt-3 text-[15px] text-white/55">Download Co-Exist and join your nearest collective today.</p>
            <div className="mt-8">
              <StoreCTAs platform={platform} />
            </div>
            <div className="mt-8 flex items-center justify-center gap-4 text-sm text-white/45">
              <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                Our website <ArrowRight size={14} />
              </a>
              <span className="text-white/20">|</span>
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                @coexistaus
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <WebFooter />
    </div>
  )
}
