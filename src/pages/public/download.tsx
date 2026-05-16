import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { TreePine, Globe, Shield, Heart, Leaf, Users, MapPin, Calendar } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { cn } from '@/lib/cn'
import { OGMeta } from '@/components/og-meta'
import { APP_NAME, TAGLINE, WEBSITE_URL, INSTAGRAM_URL } from '@/lib/constants'
import { WebFooter } from '@/components/web-footer'
import { usePublicStats } from '@/hooks/use-public-stats'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Platform detection                                                 */
/* ------------------------------------------------------------------ */

function getDevicePlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web'
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform() as 'ios' | 'android'
  }
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'web'
}

const APP_STORE_URL = 'https://apps.apple.com/au/app/co-exist/id6760897574'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.coexistaus.app&hl=en'
const WEB_APP_URL = '/'

/* ------------------------------------------------------------------ */
/*  Stats helper                                                       */
/* ------------------------------------------------------------------ */

function formatStat(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 1 : 1).replace(/\.0$/, '')}k+`
  return `${n}+`
}


/* ------------------------------------------------------------------ */
/*  Store badges (authentic styling)                                   */
/* ------------------------------------------------------------------ */

function AppStoreBadge({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-3 px-5 py-3.5',
        'rounded-xl bg-black text-white',
        'hover:bg-gray-900 active:scale-[0.97]',
        'transition-colors duration-150',
        'cursor-pointer select-none',
        'shadow-sm',
        'min-h-14',
        className,
      )}
      aria-label="Download on the App Store"
    >
      <svg width="24" height="28" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true">
        <path d="M16.52 12.46c-.03-2.85 2.33-4.22 2.44-4.29-1.33-1.94-3.4-2.21-4.13-2.24-1.76-.18-3.43 1.04-4.33 1.04-.89 0-2.27-1.01-3.73-.99-1.92.03-3.69 1.12-4.68 2.84-1.99 3.46-.51 8.59 1.43 11.4.95 1.37 2.08 2.92 3.57 2.86 1.43-.06 1.97-.93 3.7-.93 1.73 0 2.22.93 3.73.9 1.54-.03 2.52-1.4 3.46-2.78 1.09-1.59 1.54-3.13 1.57-3.21-.03-.01-3.01-1.16-3.04-4.6zm-2.85-8.46c.79-.96 1.32-2.29 1.18-3.62-1.14.05-2.52.76-3.34 1.72-.73.85-1.37 2.2-1.2 3.5 1.27.1 2.57-.65 3.36-1.6z" />
      </svg>
      <div className="text-left">
        <p className="text-[11px] leading-tight opacity-70">Download on the</p>
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
        'inline-flex items-center gap-3 px-5 py-3.5',
        'rounded-xl bg-black text-white',
        'hover:bg-gray-900 active:scale-[0.97]',
        'transition-colors duration-150',
        'cursor-pointer select-none',
        'shadow-sm',
        'min-h-14',
        className,
      )}
      aria-label="Get it on Google Play"
    >
      <svg width="24" height="26" viewBox="0 0 20 22" aria-hidden="true">
        <path d="M1.22.52C.93.83.75 1.3.75 1.89v18.22c0 .59.18 1.06.47 1.37l.07.07L11.5 11.34v-.25L1.29.45l-.07.07z" fill="#4285F4" />
        <path d="M14.9 14.73l-3.4-3.39v-.25l3.4-3.39.08.04 4.02 2.29c1.15.65 1.15 1.72 0 2.37l-4.02 2.29-.08.04z" fill="#FBBC04" />
        <path d="M15 14.69L11.5 11.1 1.29 21.48c.38.4.99.45 1.7.05L15 14.69z" fill="#EA4335" />
        <path d="M15 7.74L2.99.9c-.71-.4-1.32-.35-1.7.05L11.5 11.34 15 7.74z" fill="#34A853" />
      </svg>
      <div className="text-left">
        <p className="text-[11px] leading-tight opacity-70">Get it on</p>
        <p className="text-[17px] font-semibold leading-tight -mt-0.5">Google Play</p>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Feature card                                                       */
/* ------------------------------------------------------------------ */

function FeatureCard({ icon: Icon, title, desc, accent }: {
  icon: typeof TreePine
  title: string
  desc: string
  accent: string
}) {
  return (
    <div className="rounded-2xl bg-white border border-neutral-100 p-5 shadow-sm">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center mb-3', accent)}>
        <Icon size={20} className="text-white" />
      </div>
      <h3 className="font-heading text-[15px] font-semibold text-neutral-900 mb-1">{title}</h3>
      <p className="text-xs text-neutral-500 leading-relaxed">{desc}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  App icon with fallback                                             */
/* ------------------------------------------------------------------ */

function AppIcon() {
  const [imgFailed, setImgFailed] = useState(false)

  if (imgFailed) {
    return (
      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-moss-400 to-moss-600 flex items-center justify-center">
        <TreePine size={28} className="text-white" />
      </div>
    )
  }

  return (
    <img
      src="/logos/icon.webp"
      alt={APP_NAME}
      className="w-14 h-14 rounded-xl"
      onError={() => setImgFailed(true)}
    />
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
  const { data: liveStats } = usePublicStats()

  const stats = [
    { value: liveStats ? formatStat(liveStats.volunteers) : '...', label: 'Volunteers', icon: Users },
    { value: liveStats ? String(liveStats.collectives) : '...', label: 'Collectives', icon: MapPin },
    { value: liveStats ? formatStat(liveStats.nativePlants) : '...', label: 'Native Plants', icon: Leaf },
    { value: liveStats ? formatStat(liveStats.events) : '...', label: 'Events', icon: Calendar },
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
            description: "Australia's youth conservation app. Join events, connect with collectives, and track your environmental impact.",
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Co-Exist Australia',
            url: 'https://www.coexistaus.org',
            sameAs: ['https://www.instagram.com/coexistaus'],
            description: "Australia's youth conservation movement connecting volunteers with local environmental events.",
          },
        ]}
      />

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  HERO                                                       */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0" aria-hidden="true">
          <img src="/img/hero-download.jpg" alt="" loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/70" />
        </div>

        {/* Hero content */}
        <motion.div
          className="relative z-10 mx-auto max-w-lg text-center px-5 pt-16 pb-10 sm:pt-24 sm:pb-14"
          variants={rm ? undefined : stagger}
          initial="hidden"
          animate="visible"
        >
          {/* App icon */}
          <motion.div variants={fadeUp} className="mx-auto mb-5">
            <div className="w-20 h-20 rounded-[22px] bg-white shadow-2xl shadow-black/20 flex items-center justify-center mx-auto">
              <AppIcon />
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold text-white tracking-tight text-center">
              {APP_NAME}
            </h1>
          </motion.div>

          {/* ── Platform-aware download buttons ── */}
          <motion.div variants={fadeUp} className="mt-8 space-y-3">
            {/* iOS device → show App Store badge prominently */}
            {platform === 'ios' && (
              <>
                <AppStoreBadge
                  className="w-full justify-center"
                  onClick={() => window.open(APP_STORE_URL, '_blank')}
                />
                <button
                  type="button"
                  onClick={() => navigate(WEB_APP_URL)}
                  className="w-full py-3 rounded-xl bg-white/10 text-white/70 text-sm font-medium hover:bg-white/15 active:scale-[0.97] transition-transform cursor-pointer select-none"
                >
                  Or continue on web
                </button>
              </>
            )}

            {/* Android device → show Play Store badge prominently */}
            {platform === 'android' && (
              <>
                <PlayStoreBadge
                  className="w-full justify-center"
                  onClick={() => window.open(PLAY_STORE_URL, '_blank')}
                />
                <button
                  type="button"
                  onClick={() => navigate(WEB_APP_URL)}
                  className="w-full py-3 rounded-xl bg-white/10 text-white/70 text-sm font-medium hover:bg-white/15 active:scale-[0.97] transition-transform cursor-pointer select-none"
                >
                  Or continue on web
                </button>
              </>
            )}

            {/* Desktop/unknown → show both badges side by side */}
            {platform === 'web' && (
              <>
                <div className="flex gap-2.5">
                  <AppStoreBadge
                    className="flex-1 justify-center"
                    onClick={() => window.open(APP_STORE_URL, '_blank')}
                  />
                  <PlayStoreBadge
                    className="flex-1 justify-center"
                    onClick={() => window.open(PLAY_STORE_URL, '_blank')}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => navigate(WEB_APP_URL)}
                  className="w-full py-3 rounded-xl bg-white/10 text-white/70 text-sm font-medium hover:bg-white/15 active:scale-[0.97] transition-transform cursor-pointer select-none"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Globe size={16} />
                    Continue on Web
                  </span>
                </button>
              </>
            )}
          </motion.div>

          {/* Free badge */}
          <motion.div variants={fadeUp} className="mt-5 flex items-center justify-center gap-4 text-[11px] text-white/40">
            <span className="flex items-center gap-1">
              <Shield size={11} />
              100% Free
            </span>
            <span>·</span>
            <span>iOS & Android</span>
            <span>·</span>
            <span>Ages 18-30</span>
          </motion.div>
        </motion.div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  STATS                                                      */}
      {/* ════════════════════════════════════════════════════════════ */}
      <motion.div
        className="bg-gradient-to-r from-moss-50 via-white to-moss-50/50 border-y border-moss-100/30"
        variants={rm ? undefined : stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
      >
        <div className="mx-auto max-w-lg px-5 py-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeUp}
              className="text-center"
            >
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center mx-auto mb-2">
                <stat.icon size={18} className="text-moss-600" />
              </div>
              <p className="font-heading text-xl font-bold text-neutral-900">{stat.value}</p>
              <p className="text-[11px] text-neutral-500 font-medium">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  FEATURES                                                   */}
      {/* ════════════════════════════════════════════════════════════ */}
      <motion.div
        className="mx-auto max-w-lg px-5 py-10"
        variants={rm ? undefined : stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
      >
        <motion.div variants={fadeUp} className="text-center mb-6">
          <h2 className="font-heading text-xl font-bold text-neutral-900">What you can do</h2>
          <p className="text-sm text-neutral-500 mt-1">Everything to be part of the movement</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <motion.div variants={fadeUp}>
            <FeatureCard
              icon={Calendar}
              title="Join Events"
              desc="Find and register for local conservation events near you"
              accent="bg-gradient-to-br from-moss-500 to-moss-600"
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <FeatureCard
              icon={Users}
              title="Collectives"
              desc="Connect with your local volunteer group and make friends"
              accent="bg-gradient-to-br from-primary-600 to-primary-700"
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <FeatureCard
              icon={TreePine}
              title="Track Impact"
              desc="See your trees planted, litter removed, and hours volunteered"
              accent="bg-gradient-to-br from-moss-600 to-moss-700"
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <FeatureCard
              icon={Heart}
              title="Earn Badges"
              desc="Level up from New to Lifetime as you grow your impact"
              accent="bg-gradient-to-br from-primary-700 to-moss-700"
            />
          </motion.div>
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  BOTTOM CTA                                                 */}
      {/* ════════════════════════════════════════════════════════════ */}
      <motion.div
        className="mx-auto max-w-lg w-full px-5 pb-10"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        <div className="rounded-2xl bg-gradient-to-br from-primary-800 via-primary-900 to-moss-900 p-6 text-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="font-heading text-xl font-bold text-white mb-1.5">Ready to make a difference?</h2>
            <p className="text-sm text-white/50 mb-5">Download the app and join your nearest collective</p>

            <div className="flex gap-2.5 justify-center">
              <AppStoreBadge onClick={() => window.open(APP_STORE_URL, '_blank')} />
              <PlayStoreBadge onClick={() => window.open(PLAY_STORE_URL, '_blank')} />
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="mt-6 flex items-center justify-center gap-4 text-sm text-neutral-500">
          <a
            href={WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-600 transition-colors"
          >
            Website
          </a>
          <span aria-hidden="true" className="text-primary-200">·</span>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-600 transition-colors"
          >
            @coexistaus
          </a>
        </div>
      </motion.div>

      <WebFooter />
    </div>
  )
}
