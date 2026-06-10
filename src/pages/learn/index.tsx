import { useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  BookOpen,
  Layers,
  Clock,
  ChevronRight,
  Compass,
  GraduationCap,
  Play,
  Star,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { WaveTransition } from '@/components/wave-transition'
import { ProgressRing } from '@/components/development/progress-ring'
import { cn } from '@/lib/cn'
import { useMyTargetedContent } from '@/hooks/use-development-assignments'
import { useMyModuleProgress, useMySectionProgress } from '@/hooks/use-development-progress'
import type { DevModule, DevSection } from '@/hooks/use-admin-development'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Content card                                                       */
/* ------------------------------------------------------------------ */

function ContentCard({
  item,
  isModule,
  progressPct,
  status,
  delay,
  rm,
}: {
  item: DevModule | DevSection
  isModule: boolean
  progressPct: number
  status: 'not_started' | 'in_progress' | 'completed'
  delay: number
  rm: boolean
}) {
  const linkTo = isModule ? `/learn/module/${item.id}` : `/learn/section/${item.id}`

  return (
    <motion.div
      initial={rm ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: rm ? 0 : delay }}
    >
      <Link to={linkTo}>
        <motion.div
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className={cn(
            'flex items-center gap-3.5 p-3.5 rounded-2xl border shadow-sm transition-shadow',
            status === 'completed'
              ? 'bg-white border-neutral-100'
              : 'bg-white border-neutral-100',
          )}
        >
          {/* Thumbnail or icon */}
          {item.thumbnail_url ? (
            <img src={item.thumbnail_url} alt="" loading="lazy" decoding="async" className="w-14 h-14 rounded-xl object-cover shrink-0" />
          ) : (
            <div className={cn(
              'flex items-center justify-center w-14 h-14 rounded-xl shrink-0',
              'bg-neutral-50',
            )}>
              {isModule ? (
                <BookOpen size={22} className="text-neutral-500" />
              ) : (
                <Layers size={22} className="text-neutral-500" />
              )}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-[13px] font-bold truncate',
              status === 'completed' ? 'text-neutral-900' : 'text-neutral-900',
            )}>
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={cn(
                'text-[11px] font-medium capitalize',
                status === 'completed' ? 'text-neutral-500' : 'text-neutral-500',
              )}>
                {item.category.replace(/_/g, ' ')}
              </span>
              {'estimated_minutes' in item && (
                <span className="flex items-center gap-0.5 text-[11px] text-neutral-500">
                  <Clock size={10} />
                  {(item as DevModule).estimated_minutes}m
                </span>
              )}
            </div>
          </div>

          {/* Progress + action */}
          <div className="flex items-center gap-2 shrink-0">
            {status === 'completed' ? (
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-50">
                <Star size={16} className="text-primary-600" />
              </div>
            ) : (
              <ProgressRing percent={progressPct} size={36} />
            )}
            <ChevronRight size={16} className="text-neutral-400" />
          </div>
        </motion.div>
      </Link>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

function SectionLabel({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-neutral-400">{icon}</span>
      <h2 className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.15em]">
        {label}
      </h2>
      <span className="text-[11px] font-bold text-neutral-500 tabular-nums bg-neutral-100 px-1.5 py-0.5 rounded-full">
        {count}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LearnIndexPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  const { data: content, isLoading: contentLoading, isError: contentError, refetch: refetchContent } = useMyTargetedContent()
  const { data: moduleProgress = [] } = useMyModuleProgress()
  const { data: sectionProgress = [] } = useMySectionProgress()

  const progressMap = useMemo(() => {
    const map = new Map<string, { pct: number; status: 'not_started' | 'in_progress' | 'completed' }>()
    for (const mp of moduleProgress) map.set(mp.module_id, { pct: mp.progress_pct, status: mp.status })
    for (const sp of sectionProgress) map.set(sp.section_id, { pct: sp.progress_pct, status: sp.status })
    return map
  }, [moduleProgress, sectionProgress])

  const getProgress = useCallback((id: string) =>
    progressMap.get(id) ?? { pct: 0, status: 'not_started' as const }, [progressMap])

  type ContentItem = { item: DevModule | DevSection; isModule: boolean }

  const allContent: ContentItem[] = useMemo(() => {
    if (!content) return []
    return [
      ...content.modules.map((m) => ({ item: m, isModule: true })),
      ...content.sections.map((s) => ({ item: s, isModule: false })),
    ]
  }, [content])

  const grouped = useMemo(() => {
    const inProgress = allContent.filter((c) => getProgress(c.item.id).status === 'in_progress')
    const notStarted = allContent.filter((c) => getProgress(c.item.id).status === 'not_started')
    const completed = allContent.filter((c) => getProgress(c.item.id).status === 'completed')
    return { inProgress, notStarted, completed }
  }, [allContent, getProgress])

  const totalCount = allContent.length
  const completedCount = grouped.completed.length
  const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <Page noBackground className="!px-0 bg-white">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-white">
        <div
          className="relative z-10 px-4 sm:px-6 lg:px-8 pt-14 pb-16 text-center"
          style={{ paddingTop: '3.5rem' }}
        >
          <motion.div
            initial={rm ? {} : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 200, damping: 18 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50 mb-5"
          >
            <GraduationCap size={32} className="text-primary-600" />
          </motion.div>

          <motion.div
            initial={rm ? {} : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <span className="font-heading text-3xl sm:text-4xl font-bold text-neutral-900 block text-center">
              My Learning
            </span>
          </motion.div>

          {/* Overall progress */}
          {totalCount > 0 && (
            <motion.div
              initial={rm ? {} : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="mt-6 inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-neutral-50 border border-neutral-100"
            >
              <ProgressRing percent={overallPct} size={44} strokeWidth={4} />
              <div className="text-left">
                <p className="text-sm font-bold text-neutral-900">
                  {completedCount} of {totalCount} complete
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">{overallPct}% overall progress</p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Wave divider */}
        <WaveTransition wave={1} />
      </div>

      {/* ── Content ── */}
      <div className="px-4 sm:px-6 lg:px-8 pb-20">
        {contentLoading ? (
          <div className="space-y-3 pt-4">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : contentError ? (
          <EmptyState
            illustration="error"
            title="Something went wrong"
            description="We couldn't load your learning modules."
            action={{ label: 'Try again', onClick: () => refetchContent() }}
          />
        ) : allContent.length === 0 ? (
          <motion.div
            initial={rm ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 rounded-2xl"
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-50 mb-4">
              <Compass size={32} strokeWidth={1.5} className="text-neutral-500" />
            </div>
            <p className="text-[15px] font-bold text-neutral-900">No modules available yet</p>
            <p className="text-[13px] text-neutral-500 mt-1 text-center max-w-xs leading-relaxed">
              Development modules will appear here when they're published for your role
            </p>
          </motion.div>
        ) : (
          <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-8 pt-4">
            {/* In Progress */}
            {grouped.inProgress.length > 0 && (
              <motion.section variants={fadeUp}>
                <SectionLabel icon={<Play size={13} />} label="Continue Learning" count={grouped.inProgress.length} />
                <div className="space-y-2.5">
                  {grouped.inProgress.map((c, i) => {
                    const p = getProgress(c.item.id)
                    return (
                      <ContentCard key={c.item.id} item={c.item} isModule={c.isModule} progressPct={p.pct} status={p.status} delay={i * 0.04} rm={rm} />
                    )
                  })}
                </div>
              </motion.section>
            )}

            {/* Available */}
            {grouped.notStarted.length > 0 && (
              <motion.section variants={fadeUp}>
                <SectionLabel icon={<BookOpen size={13} />} label="Available" count={grouped.notStarted.length} />
                <div className="space-y-2.5">
                  {grouped.notStarted.map((c, i) => {
                    const p = getProgress(c.item.id)
                    return (
                      <ContentCard key={c.item.id} item={c.item} isModule={c.isModule} progressPct={p.pct} status={p.status} delay={i * 0.04} rm={rm} />
                    )
                  })}
                </div>
              </motion.section>
            )}

            {/* Completed */}
            {grouped.completed.length > 0 && (
              <motion.section variants={fadeUp}>
                <SectionLabel icon={<Star size={13} />} label="Completed" count={grouped.completed.length} />
                <div className="space-y-2.5">
                  {grouped.completed.map((c, i) => {
                    const p = getProgress(c.item.id)
                    return (
                      <ContentCard key={c.item.id} item={c.item} isModule={c.isModule} progressPct={p.pct} status={p.status} delay={i * 0.04} rm={rm} />
                    )
                  })}
                </div>
              </motion.section>
            )}
          </motion.div>
        )}
      </div>
    </Page>
  )
}
