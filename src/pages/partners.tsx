import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Handshake, Globe, ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Skeleton } from '@/components/skeleton'
import { WaveTransition } from '@/components/wave-transition'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
}

/* ------------------------------------------------------------------ */
/*  Data hook                                                          */
/* ------------------------------------------------------------------ */

function usePartnerOrganisations() {
  return useQuery({
    queryKey: ['public-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organisations')
        .select('id, name, description, logo_url, website, type')
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Partner type badge                                                 */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  corporate: 'Corporate',
  ngo: 'NGO',
  government: 'Government',
  community: 'Community',
}

function TypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full',
        'text-[10px] font-semibold uppercase tracking-wider',
        type === 'corporate' && 'bg-sky-50 text-sky-600',
        type === 'ngo' && 'bg-sprout-50 text-sprout-600',
        type === 'government' && 'bg-plum-50 text-plum-600',
        type === 'community' && 'bg-warning-50 text-warning-600',
        !['corporate', 'ngo', 'government', 'community'].includes(type) && 'bg-primary-50 text-primary-600',
      )}
    >
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function PartnersSkeleton() {
  return (
    <div className="space-y-4 pb-10">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-surface-0 shadow-sm p-5 flex items-start gap-4">
          <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Card gradient per partner type                                     */
/* ------------------------------------------------------------------ */

const TYPE_GRADIENTS: Record<string, string> = {
  corporate: 'from-sky-600 to-sky-800',
  ngo: 'from-sprout-600 to-primary-700',
  government: 'from-plum-600 to-plum-800',
  community: 'from-warning-500 to-bark-600',
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PartnersPage() {
  const shouldReduceMotion = useReducedMotion()
  const { data: partners, isLoading } = usePartnerOrganisations()

  return (
    <Page swipeBack noBackground className="!px-0 bg-white" stickyOverlay={<Header title="" back transparent className="collapse-header" />}>
      {/* Hero - sage gradient, no circles (2026-05-16 Tate). */}
      <div className="relative overflow-hidden bg-gradient-to-br from-moss-700 via-primary-800 to-primary-900">

        <div
          className="relative z-10 px-4 sm:px-6 lg:px-8 pt-10 pb-14 text-center"
          style={{ paddingTop: '2.5rem' }}
        >
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 mb-4"
          >
            <Handshake size={28} className="text-white" />
          </motion.div>

          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="font-heading text-2xl sm:text-3xl font-bold text-white block text-center">
              Our Partners
            </span>
          </motion.div>
        </div>

        {/* Wave */}
        <WaveTransition wave={2} />
      </div>

      {/* Content */}
      <div className="px-5 pt-4 pb-12">
        {isLoading ? (
          <PartnersSkeleton />
        ) : !partners?.length ? (
          <Navigate to="/" replace />
        ) : (
          <motion.div
            className="space-y-3"
            initial="hidden"
            animate="visible"
            variants={shouldReduceMotion ? undefined : stagger}
          >
            {partners.map((partner, i) => {
              const gradient = TYPE_GRADIENTS[partner.type ?? ''] ?? 'from-primary-600 to-primary-800'
              const useRichCard = i < 6 // first 6 get full gradient cards

              return (
                <motion.div
                  key={partner.id}
                  variants={shouldReduceMotion ? undefined : fadeUp}
                  className={cn(
                    'rounded-2xl overflow-hidden shadow-sm',
                    useRichCard
                      ? cn('bg-gradient-to-br', gradient)
                      : 'bg-surface-0 shadow-sm',
                  )}
                >
                  <div className="p-5 flex items-start gap-4">
                    {/* Logo */}
                    <div
                      className={cn(
                        'w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden',
                        useRichCard ? 'bg-white/15' : 'bg-neutral-50',
                      )}
                    >
                      {partner.logo_url ? (
                        <img
                          src={partner.logo_url}
                          alt={partner.name}
                          className="w-full h-full object-contain p-1.5"
                        />
                      ) : (
                        <Handshake size={24} className={useRichCard ? 'text-white/70' : 'text-neutral-300'} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3
                          className={cn(
                            'font-heading text-[15px] font-semibold leading-tight',
                            useRichCard ? 'text-white' : 'text-neutral-900',
                          )}
                        >
                          {partner.name}
                        </h3>
                        {!useRichCard && partner.type && <TypeBadge type={partner.type} />}
                        {useRichCard && partner.type && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-white/15 text-white/80">
                            {TYPE_LABELS[partner.type] ?? partner.type}
                          </span>
                        )}
                      </div>

                      {partner.description && (
                        <p
                          className={cn(
                            'text-[13px] leading-relaxed line-clamp-3',
                            useRichCard ? 'text-white/70' : 'text-neutral-500',
                          )}
                        >
                          {partner.description}
                        </p>
                      )}

                      {partner.website && (
                        <a
                          href={partner.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'inline-flex items-center gap-1.5 mt-2',
                            'text-[12px] font-medium transition-colors',
                            useRichCard
                              ? 'text-white/60 hover:text-white/90'
                              : 'text-neutral-600 hover:text-neutral-800',
                          )}
                        >
                          <Globe size={13} />
                          <span className="truncate max-w-[200px]">
                            {partner.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </span>
                          <ExternalLink size={11} className="shrink-0" />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </Page>
  )
}
