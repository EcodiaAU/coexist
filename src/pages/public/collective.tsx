import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, Users, TreePine, Heart, Shield, ArrowRight } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { supabase } from '@/lib/supabase'
import { wallClockNow } from '@/lib/date-format'
import { cn } from '@/lib/cn'
import { Skeleton } from '@/components/skeleton'
import { OGMeta, SITE_URL } from '@/components/og-meta'
import { APP_NAME, TAGLINE } from '@/lib/constants'
import { WebFooter } from '@/components/web-footer'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Platform detection                                                 */
/* ------------------------------------------------------------------ */

function getDevicePlatform(): 'ios' | 'android' | 'web' {
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


/* ------------------------------------------------------------------ */
/*  Store badge components (real badge styling)                        */
/* ------------------------------------------------------------------ */

function AppStoreBadge({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2.5 px-5 py-3',
        'rounded-sm bg-black text-white',
        'hover:bg-gray-900 active:scale-[0.97]',
        'transition-colors duration-150',
        'cursor-pointer select-none',
        'shadow-sm',
        className,
      )}
      aria-label="Download on the App Store"
    >
      <svg width="22" height="26" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true">
        <path d="M16.52 12.46c-.03-2.85 2.33-4.22 2.44-4.29-1.33-1.94-3.4-2.21-4.13-2.24-1.76-.18-3.43 1.04-4.33 1.04-.89 0-2.27-1.01-3.73-.99-1.92.03-3.69 1.12-4.68 2.84-1.99 3.46-.51 8.59 1.43 11.4.95 1.37 2.08 2.92 3.57 2.86 1.43-.06 1.97-.93 3.7-.93 1.73 0 2.22.93 3.73.9 1.54-.03 2.52-1.4 3.46-2.78 1.09-1.59 1.54-3.13 1.57-3.21-.03-.01-3.01-1.16-3.04-4.6zm-2.85-8.46c.79-.96 1.32-2.29 1.18-3.62-1.14.05-2.52.76-3.34 1.72-.73.85-1.37 2.2-1.2 3.5 1.27.1 2.57-.65 3.36-1.6z" />
      </svg>
      <div className="text-left">
        <p className="text-[11px] leading-tight opacity-70">Download on the</p>
        <p className="text-[15px] font-semibold leading-tight">App Store</p>
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
        'inline-flex items-center gap-2.5 px-5 py-3',
        'rounded-sm bg-black text-white',
        'hover:bg-gray-900 active:scale-[0.97]',
        'transition-colors duration-150',
        'cursor-pointer select-none',
        'shadow-sm',
        className,
      )}
      aria-label="Get it on Google Play"
    >
      {/* Google Play triangle icon */}
      <svg width="22" height="24" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true">
        <path d="M1.22.52C.93.83.75 1.3.75 1.89v18.22c0 .59.18 1.06.47 1.37l.07.07L11.5 11.34v-.25L1.29.45l-.07.07z" fill="#4285F4" />
        <path d="M14.9 14.73l-3.4-3.39v-.25l3.4-3.39.08.04 4.02 2.29c1.15.65 1.15 1.72 0 2.37l-4.02 2.29-.08.04z" fill="#FBBC04" />
        <path d="M15 14.69L11.5 11.1 1.29 21.48c.38.4.99.45 1.7.05L15 14.69z" fill="#EA4335" />
        <path d="M15 7.74L2.99.9c-.71-.4-1.32-.35-1.7.05L11.5 11.34 15 7.74z" fill="#34A853" />
      </svg>
      <div className="text-left">
        <p className="text-[11px] leading-tight opacity-70">Get it on</p>
        <p className="text-[15px] font-semibold leading-tight">Google Play</p>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Trust signal pill                                                  */
/* ------------------------------------------------------------------ */

function TrustPill({ icon: Icon, text }: { icon: typeof Shield; text: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-moss-50 border border-moss-100/50 px-3 py-1.5">
      <Icon size={12} className="text-moss-500" />
      <span className="text-[11px] font-medium text-moss-700">{text}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PublicCollectivePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const platform = typeof window !== 'undefined' ? getDevicePlatform() : 'web'

  const { data: collective, isLoading, error } = useQuery({
    queryKey: ['public-collective', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collectives')
        .select('*')
        .eq('slug', slug!)
        .eq('is_active', true)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!slug,
  })

  const { data: upcomingEvents } = useQuery({
    queryKey: ['public-collective-events', collective?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date_start, activity_type, address')
        .eq('collective_id', collective!.id)
        .eq('is_public', true)
        .eq('status', 'published')
        .gte('date_start', wallClockNow().toISOString())
        .order('date_start', { ascending: true })
        .limit(5)
      if (error) throw error
      return data
    },
    enabled: !!collective?.id,
  })
  const showLoading = useDelayedLoading(isLoading)

  /* ── Loading ── */
  if (showLoading) {
    return (
      <div className="min-h-dvh bg-white">
        <div className="h-56 animate-pulse bg-moss-100" />
        <div className="mx-auto max-w-2xl p-6 space-y-4">
          <Skeleton variant="title" />
          <Skeleton variant="text" count={3} />
        </div>
      </div>
    )
  }
  /* ── Error ── */
  if (error || !collective) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-moss-50 to-white p-6 text-center">
        <OGMeta title="Collective Not Found" description="This collective doesn't exist or is no longer active." />
        <div className="w-16 h-16 rounded-md bg-primary-100 flex items-center justify-center mb-4">
          <Users size={28} className="text-neutral-400" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-neutral-900">Collective not found</h1>
        <p className="mt-2 text-neutral-500 max-w-xs">This collective doesn't exist or is no longer active.</p>
        <button
          type="button"
          onClick={() => navigate('/download')}
          className="mt-6 px-6 py-3 rounded-sm bg-primary-800 text-white font-heading font-semibold hover:bg-primary-900 active:scale-[0.97] transition-transform cursor-pointer"
        >
          Get the {APP_NAME} App
        </button>
      </div>
    )
  }

  const canonicalPath = `/collective/${collective.slug}`
  const locationStr = [collective.region, collective.state].filter(Boolean).join(', ')
  const metaDescription = collective.description
    ? collective.description.slice(0, 155) + (collective.description.length > 155 ? '...' : '')
    : `Join ${collective.name}${locationStr ? ` in ${locationStr}` : ''} - a Co-Exist conservation collective organising volunteer events across Australia.`

  const collectiveJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: collective.name,
    description: collective.description || metaDescription,
    url: `${SITE_URL}${canonicalPath}`,
    ...(collective.cover_image_url && { image: collective.cover_image_url }),
    ...(locationStr && {
      address: {
        '@type': 'PostalAddress',
        addressLocality: collective.region || undefined,
        addressRegion: collective.state || undefined,
        addressCountry: 'AU',
      },
    }),
    parentOrganization: {
      '@type': 'Organization',
      name: 'Co-Exist Australia',
      url: 'https://www.coexistaus.org',
    },
    ...(collective.member_count && {
      numberOfEmployees: { '@type': 'QuantitativeValue', value: collective.member_count },
    }),
  }

  const handleOpenInApp = () => {
    window.location.href = `coexist://collectives/${collective.id}`
    setTimeout(() => {
      navigate('/download')
    }, 1500)
  }

  const handleDownload = () => {
    if (platform === 'ios') {
      window.open(APP_STORE_URL, '_blank')
    } else if (platform === 'android') {
      window.open(PLAY_STORE_URL, '_blank')
    } else {
      navigate('/download')
    }
  }

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      <OGMeta
        title={collective.name}
        description={metaDescription}
        canonicalPath={canonicalPath}
        image={collective.cover_image_url || undefined}
        type="profile"
        jsonLd={collectiveJsonLd}
      />

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  HERO                                                       */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden">
        {/* Background image or gradient */}
        <div className="absolute inset-0">
          {collective.cover_image_url ? (
            <img
              src={collective.cover_image_url}
              alt=""
              className="h-full w-full object-cover"
              aria-hidden="true"
            />
          ) : (
            <div className="h-full w-full bg-primary-900" />
          )}
          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
        </div>

        {/* Hero content */}
        <motion.div
          className="relative z-10 px-5 pt-12 pb-8 sm:px-8 sm:pt-16 sm:pb-12 max-w-2xl mx-auto"
          variants={rm ? undefined : stagger}
          initial="hidden"
          animate="visible"
        >
          {/* App badge - wide wordmark */}
          <motion.div variants={fadeUp}>
            <div className="inline-flex items-center gap-2.5 rounded-full bg-white/20 px-3 py-1.5 mb-4">
              <img
                src="/logos/white-wordmark.webp"
                alt={APP_NAME}
                className="h-3.5 w-auto"
              />
              <span className="text-[11px] text-white/40">|</span>
              <span className="text-[11px] text-white/60">{TAGLINE}</span>
            </div>
          </motion.div>

          {/* Collective name */}
          <motion.h1
            variants={fadeUp}
            className="font-heading text-3xl sm:text-4xl font-bold text-white tracking-tight drop-shadow-sm"
          >
            {collective.name}
          </motion.h1>

          {/* Location */}
          {locationStr && (
            <motion.p variants={fadeUp} className="mt-2 flex items-center gap-1.5 text-sm text-white/80">
              <MapPin size={14} className="text-white/60" />
              {locationStr}
            </motion.p>
          )}

          {/* Stats row */}
          <motion.div variants={fadeUp} className="flex gap-5 mt-5">
            <div>
              <p className="font-heading text-2xl font-bold text-white">{collective.member_count ?? 0}</p>
              <p className="text-xs text-white/50">Members</p>
            </div>
            {upcomingEvents && (
              <div>
                <p className="font-heading text-2xl font-bold text-white">{upcomingEvents.length}</p>
                <p className="text-xs text-white/50">Upcoming</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  BODY                                                       */}
      {/* ════════════════════════════════════════════════════════════ */}
      <motion.div
        className="flex-1 mx-auto max-w-2xl w-full px-5 py-6 sm:px-8"
        variants={rm ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Trust signals */}
        <motion.div variants={fadeUp} className="flex flex-wrap gap-2 mb-6">
          <TrustPill icon={Shield} text="Registered charity" />
          <TrustPill icon={Heart} text="Free to join" />
          <TrustPill icon={TreePine} text="Real conservation" />
        </motion.div>

        {/* Description */}
        {collective.description && (
          <motion.div variants={fadeUp} className="mb-6">
            <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-2">About</h2>
            <p className="whitespace-pre-line text-neutral-500 leading-relaxed text-[15px]">
              {collective.description}
            </p>
          </motion.div>
        )}

        {/* Upcoming events */}
        {upcomingEvents && upcomingEvents.length > 0 && (
          <motion.div variants={fadeUp} className="mb-8">
            <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-3">Upcoming Events</h2>
            <div className="space-y-2.5">
              {upcomingEvents.map((evt) => {
                const d = new Date(evt.date_start)
                return (
                  <div
                    key={evt.id}
                    className={cn(
                      'flex items-center gap-3.5 rounded-sm p-3.5',
                      'bg-gradient-to-r from-moss-50/60 to-white',
                      'border border-moss-100/50',
                    )}
                  >
                    {/* Date badge */}
                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-sm bg-white border border-moss-100/50 shrink-0">
                      <span className="text-[11px] font-semibold text-moss-500 uppercase leading-none">
                        {/* Floating local time: stored wall-clock is the wall-clock. */}
                        {d.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })}
                      </span>
                      <span className="text-lg font-bold text-neutral-900 leading-tight">
                        {d.getUTCDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900 truncate text-[15px]">{evt.title}</p>
                      <p className="text-xs text-neutral-500 mt-0.5 truncate">
                        {d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' })}
                        {evt.address ? ` · ${evt.address}` : ''}
                      </p>
                    </div>
                    <ArrowRight size={16} className="text-neutral-400 shrink-0" />
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* ── Join CTA section ── */}
        <motion.div
          variants={fadeUp}
          className="rounded-md bg-primary-800 p-6 text-center relative overflow-hidden"
        >
          <div className="relative z-10">
            <div className="w-14 h-14 rounded-md bg-white/15 flex items-center justify-center mx-auto mb-3">
              <TreePine size={26} className="text-white" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white mb-1.5">
              Join {collective.name}
            </h2>
            <p className="text-sm text-white/60 mb-5 max-w-xs mx-auto">
              Download the free {APP_NAME} app to join this collective, attend events, and track your impact.
            </p>

            {/* Platform-aware CTAs */}
            <div className="space-y-3">
              {/* Primary: Open in app (for users who already have it) */}
              <button
                type="button"
                onClick={handleOpenInApp}
                className={cn(
                  'w-full flex items-center justify-center gap-2.5 px-6 py-3.5',
                  'rounded-sm bg-white text-primary-800',
                  'font-heading font-semibold',
                  'hover:bg-white/90 active:scale-[0.97]',
                  'transition-colors duration-150',
                  'cursor-pointer select-none',
                  'shadow-sm',
                )}
              >
                <span>Open in</span>
                <img
                  src="/logos/black-wordmark.png"
                  alt={APP_NAME}
                  className="h-4 w-auto"
                />
              </button>

              {/* Platform-specific store badge */}
              {platform === 'ios' && (
                <AppStoreBadge className="w-full justify-center" onClick={() => window.open(APP_STORE_URL, '_blank')} />
              )}
              {platform === 'android' && (
                <PlayStoreBadge className="w-full justify-center" onClick={() => window.open(PLAY_STORE_URL, '_blank')} />
              )}
              {platform === 'web' && (
                <div className="flex gap-2.5">
                  <AppStoreBadge className="flex-1 justify-center" onClick={() => window.open(APP_STORE_URL, '_blank')} />
                  <PlayStoreBadge className="flex-1 justify-center" onClick={() => window.open(PLAY_STORE_URL, '_blank')} />
                </div>
              )}

              {/* Web fallback */}
              <button
                type="button"
                onClick={() => navigate('/')}
                className={cn(
                  'w-full px-6 py-3',
                  'rounded-sm bg-white/10 text-white/80',
                  'text-sm font-medium',
                  'hover:bg-white/15 active:scale-[0.97]',
                  'transition-colors duration-150',
                  'cursor-pointer select-none',
                )}
              >
                Continue on Web
              </button>
            </div>
          </div>
        </motion.div>

        {/* What is Co-Exist */}
        <motion.div variants={fadeUp} className="mt-8 mb-4 text-center">
          <p className="text-xs text-neutral-500">
            <span className="font-semibold">{APP_NAME}</span> is Australia's young adult conservation movement.
            {' '}Join 5,500+ volunteers planting native trees, cleaning beaches, and restoring habitats.
          </p>
        </motion.div>
      </motion.div>

      {/* Sticky bottom CTA - mobile only, visible on scroll */}
      <div className={cn(
        'sticky bottom-0 z-30 sm:hidden',
        'bg-white border-t border-neutral-100',
        'px-4 py-3',
        'safe-bottom',
      )}>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleOpenInApp}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3',
              'rounded-sm bg-primary-800 text-white',
              'font-heading font-semibold text-sm',
              'active:scale-[0.97] transition-transform',
              'cursor-pointer select-none',
            )}
          >
            Open in App
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3',
              'rounded-sm bg-moss-100 text-moss-800',
              'font-heading font-semibold text-sm',
              'active:scale-[0.97] transition-transform',
              'cursor-pointer select-none',
            )}
          >
            Download
          </button>
        </div>
      </div>

      <WebFooter />
    </div>
  )
}
