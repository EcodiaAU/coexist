import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, Clock, BookOpen, Sparkles } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { WaveTransition } from '@/components/wave-transition'
import { ProgressRing } from '@/components/development/progress-ring'
import { useToast } from '@/components/toast'
import { ContentBlockRenderer } from '@/components/development/content-block-renderer'
import { cn } from '@/lib/cn'
import { useDevModule, useDevModuleContent } from '@/hooks/use-admin-development'
import { useModuleProgress, useUpsertModuleProgress } from '@/hooks/use-development-progress'

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LearnModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { toast } = useToast()

  const { data: module, isLoading: moduleLoading } = useDevModule(moduleId)
  const { data: blocks = [], isLoading: blocksLoading } = useDevModuleContent(moduleId)
  const { data: progress } = useModuleProgress(moduleId)
  const upsertProgress = useUpsertModuleProgress()

  const [viewedBlocks, setViewedBlocks] = useState<Set<string>>(new Set())
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const timerRef = useRef<number>(0)

  // Time tracking
  useEffect(() => {
    timerRef.current = progress?.time_spent_sec ?? 0
    const interval = setInterval(() => {
      if (!document.hidden) timerRef.current += 1
    }, 1000)
    return () => clearInterval(interval)
  }, [progress?.time_spent_sec])

  // IntersectionObserver for block viewing
  useEffect(() => {
    if (blocks.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const blockId = entry.target.getAttribute('data-block-id')
            if (blockId) {
              setViewedBlocks((prev) => {
                const next = new Set(prev)
                next.add(blockId)
                return next
              })
            }
          }
        })
      },
      { threshold: 0.5 },
    )
    blockRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [blocks])

  // Debounced progress save
  useEffect(() => {
    if (!moduleId || blocks.length === 0) return
    const saveInterval = setInterval(() => {
      const pct = Math.round((viewedBlocks.size / blocks.length) * 100)
      // Find highest sort_order block that's been viewed (for resume position)
      const lastViewed = blocks.filter((b) => viewedBlocks.has(b.id))
      const lastBlock = lastViewed.length > 0 ? lastViewed[lastViewed.length - 1] : null
      upsertProgress.mutate({
        module_id: moduleId,
        status: pct >= 100 ? 'completed' : 'in_progress',
        last_content_id: lastBlock?.id ?? null,
        last_sort_order: lastBlock?.sort_order ?? null,
        progress_pct: pct,
        time_spent_sec: timerRef.current,
      })
    }, 5000)
    return () => clearInterval(saveInterval)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- upsertProgress is a stable mutation object
  }, [moduleId, blocks, viewedBlocks])

  // Resume scroll  prefer sort_order (survives content re-save), fallback to content_id
  useEffect(() => {
    if (blocks.length === 0 || !progress) return
    let resumeBlock: typeof blocks[number] | undefined
    if (progress.last_sort_order !== null && progress.last_sort_order !== undefined) {
      // Find block at or nearest to the saved sort_order
      resumeBlock = blocks.find((b) => b.sort_order === progress.last_sort_order)
        ?? blocks.reduce((nearest, b) =>
          Math.abs(b.sort_order - progress.last_sort_order!) < Math.abs(nearest.sort_order - progress.last_sort_order!)
            ? b : nearest, blocks[0])
    } else if (progress.last_content_id) {
      resumeBlock = blocks.find((b) => b.id === progress.last_content_id)
    }
    if (resumeBlock) {
      const el = blockRefs.current.get(resumeBlock.id)
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          toast.info('Resuming where you left off')
        }, 300)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable, only run on resume position change
  }, [progress?.last_sort_order, progress?.last_content_id, blocks.length])

  const handleComplete = useCallback(() => {
    if (!moduleId) return
    upsertProgress.mutate({
      module_id: moduleId,
      status: 'completed',
      progress_pct: 100,
      time_spent_sec: timerRef.current,
    })
    navigate(`/learn/complete?type=module&id=${moduleId}`)
  }, [moduleId, upsertProgress, navigate])

  const progressPct = blocks.length > 0 ? Math.round((viewedBlocks.size / blocks.length) * 100) : 0
  const isLoading = moduleLoading || blocksLoading

  if (isLoading) {
    return (
      <Page noBackground className="!px-0 bg-white" stickyOverlay={<Header title="" back transparent onBack={() => navigate('/learn')} />}>
        <div className="max-w-3xl mx-auto space-y-6 pb-20 pt-20 px-5">
          <Skeleton className="h-10 w-64 rounded-sm" />
          <Skeleton className="h-3 rounded-full" />
          <Skeleton className="h-64 rounded-md" />
          <Skeleton className="h-48 rounded-md" />
        </div>
      </Page>
    )
  }

  if (!module) {
    return (
      <Page noBackground className="!px-0 bg-white" stickyOverlay={<Header title="" back transparent onBack={() => navigate('/learn')} />}>
        <div className="flex flex-col items-center justify-center py-32 px-5">
          <div className="flex items-center justify-center w-16 h-16 rounded-md bg-neutral-100 mb-4">
            <BookOpen size={28} strokeWidth={1.5} className="text-neutral-400" />
          </div>
          <p className="text-[15px] font-bold text-neutral-900">Module not found</p>
          <Button variant="ghost" size="sm" onClick={() => navigate('/learn')} className="mt-3">
            Back to My Learning
          </Button>
        </div>
      </Page>
    )
  }

  return (
    <Page noBackground className="!px-0 bg-white" stickyOverlay={<Header title="" back transparent onBack={() => navigate('/learn')} />}>
      <div className="min-h-full">
        {/* ── Hero header ── */}
        <div className="relative overflow-hidden bg-white">
          <div
            className="relative z-10 px-5 sm:px-6 pt-14 pb-10"
            style={{ paddingTop: '3.5rem' }}
          >
            {/* Module title + meta */}
            <motion.div
              initial={rm ? {} : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Module</span>
                {module.estimated_minutes && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-neutral-400">
                    <Clock size={9} />
                    {module.estimated_minutes} min
                  </span>
                )}
              </div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight leading-tight">
                {module.title}
              </h1>
              <p className="text-[12px] text-neutral-400 mt-1.5 capitalize">
                {module.category.replace(/_/g, ' ')}
              </p>
            </motion.div>

            {/* Progress bar in hero */}
            <motion.div
              initial={rm ? {} : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-5 flex items-center gap-3"
            >
              <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                />
              </div>
              <span className="text-[12px] font-bold text-neutral-500 tabular-nums shrink-0">
                {viewedBlocks.size}/{blocks.length}
              </span>
            </motion.div>
          </div>

          {/* Wave divider */}
          <WaveTransition wave={1} />
        </div>

        {/* ── Content area ── */}
        <div className="max-w-3xl mx-auto px-5 sm:px-6 pb-32">
          {/* Module description card */}
          {module.description && (
            <motion.div
              initial={rm ? {} : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-md bg-white border border-neutral-100 shadow-sm p-5 mb-8 -mt-2"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-sm bg-primary-50">
                  <BookOpen size={13} className="text-primary-600" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">About this module</span>
              </div>
              <p className="text-[13px] text-neutral-600 leading-relaxed">{module.description}</p>
            </motion.div>
          )}

          {/* Content blocks */}
          <div className="space-y-6">
            {blocks.map((block, i) => (
              <motion.div
                key={block.id}
                ref={(el) => { if (el) blockRefs.current.set(block.id, el) }}
                data-block-id={block.id}
                initial={rm ? {} : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: rm ? 0 : Math.min(i * 0.05, 0.4) }}
                className="rounded-md bg-white border border-neutral-100 shadow-sm p-5 sm:p-6"
              >
                <ContentBlockRenderer block={block} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Sticky complete bar ── */}
        {blocks.length > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.25 }}
            className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-neutral-100 shadow-sm"
          >
            <div className="max-w-3xl mx-auto flex items-center gap-3 px-5 sm:px-6 py-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <ProgressRing percent={progressPct} size={36} strokeWidth={3.5} />
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-neutral-900 truncate">{module.title}</p>
                  <p className="text-[10px] text-neutral-500 font-medium">
                    {viewedBlocks.size} of {blocks.length} blocks viewed
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={progressPct >= 100 ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
                onClick={handleComplete}
                className={cn(progressPct < 100 && 'opacity-75')}
              >
                {progressPct >= 100 ? 'Complete' : `${progressPct}%`}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </Page>
  )
}
