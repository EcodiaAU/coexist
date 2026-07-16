import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { Pencil, Clock, Users, BookOpen, CheckCircle2, Layers, Eye } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { ContentBlockRenderer } from '@/components/development/content-block-renderer'
import { cn } from '@/lib/cn'
import { useDevModule, useDevModuleContent, useDevAnalytics } from '@/hooks/use-admin-development'

export default function AdminModuleDetailPage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)

  const { data: module, isLoading: moduleLoading } = useDevModule(moduleId)
  const { data: blocks = [], isLoading: blocksLoading } = useDevModuleContent(moduleId)
  const { data: analytics } = useDevAnalytics()

  const moduleProgress = analytics?.progress.filter((p: Record<string, unknown>) => p.module_id === moduleId) ?? []
  const completedCount = moduleProgress.filter((p: Record<string, unknown>) => p.status === 'completed').length
  const assignedCount = moduleProgress.length
  const isLoading = moduleLoading || blocksLoading

  useAdminHeader('Module Detail', {
    heroContent: module ? (
      <AdminHeroStatRow data-eos-id="src/pages/admin/development/module-detail.tsx#0">
        <AdminHeroStat data-eos-id="src/pages/admin/development/module-detail.tsx#1" value={blocks.length} label="Blocks" icon={<Layers data-eos-id="src/pages/admin/development/module-detail.tsx#2" size={17} />} color="bark" delay={0} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/development/module-detail.tsx#3" value={assignedCount} label="Learners" icon={<Users data-eos-id="src/pages/admin/development/module-detail.tsx#4" size={17} />} color="primary" delay={1} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/development/module-detail.tsx#5" value={completedCount} label="Completed" icon={<CheckCircle2 data-eos-id="src/pages/admin/development/module-detail.tsx#6" size={17} />} color="moss" delay={2} reducedMotion={rm} />
      </AdminHeroStatRow>
    ) : undefined,
    actions: module ? (
      <Link data-eos-id="src/pages/admin/development/module-detail.tsx#7" to={`/admin/development/modules/${moduleId}/edit`}>
        <motion.div data-eos-id="src/pages/admin/development/module-detail.tsx#8" whileTap={{ scale: 0.95 }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white/15 text-white text-[12px] font-bold hover:bg-white/20 transition-colors">
          <Pencil data-eos-id="src/pages/admin/development/module-detail.tsx#9" size={13} /> Edit
        </motion.div>
      </Link>
    ) : undefined,
  })

  if (isLoading) return <div data-eos-id="src/pages/admin/development/module-detail.tsx#10" className="max-w-3xl mx-auto space-y-6"><Skeleton data-eos-id="src/pages/admin/development/module-detail.tsx#11" className="h-8 w-48 rounded-sm" /><Skeleton data-eos-id="src/pages/admin/development/module-detail.tsx#12" className="h-32 rounded-md" /><Skeleton data-eos-id="src/pages/admin/development/module-detail.tsx#13" className="h-64 rounded-md" /></div>

  if (!module) {
    return (
      <div data-eos-id="src/pages/admin/development/module-detail.tsx#14" className="flex flex-col items-center justify-center py-20">
        <div data-eos-id="src/pages/admin/development/module-detail.tsx#15" className="flex items-center justify-center w-14 h-14 rounded-md bg-bark-700 shadow-sm mb-4"><BookOpen data-eos-id="src/pages/admin/development/module-detail.tsx#16" size={24} strokeWidth={1.5} className="text-white" /></div>
        <p data-eos-id="src/pages/admin/development/module-detail.tsx#17" className="text-[15px] font-bold text-neutral-700">Module not found</p>
        <Button data-eos-id="src/pages/admin/development/module-detail.tsx#18" variant="ghost" size="sm" onClick={() => navigate('/admin/development')} className="mt-3">Back to Development</Button>
      </div>
    )
  }

  return (
    <motion.div data-eos-id="src/pages/admin/development/module-detail.tsx#19" variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <motion.div data-eos-id="src/pages/admin/development/module-detail.tsx#20" variants={fadeUp} className="rounded-md bg-white shadow-sm p-5 sm:p-6">
        <div data-eos-id="src/pages/admin/development/module-detail.tsx#21" className="flex items-start gap-4">
          {module.thumbnail_url ? (
            <img data-eos-id="src/pages/admin/development/module-detail.tsx#22" src={module.thumbnail_url} alt="" loading="lazy" className="w-20 h-20 rounded-sm object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          ) : (
            <div data-eos-id="src/pages/admin/development/module-detail.tsx#23" className="flex items-center justify-center w-20 h-20 rounded-sm bg-bark-700 shadow-sm shrink-0">
              <BookOpen data-eos-id="src/pages/admin/development/module-detail.tsx#24" size={28} className="text-white" />
            </div>
          )}
          <div data-eos-id="src/pages/admin/development/module-detail.tsx#25" className="flex-1 min-w-0">
            <h1 data-eos-id="src/pages/admin/development/module-detail.tsx#26" data-eos-var="module.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="font-heading text-lg font-bold text-neutral-900">{module.title}</h1>
            {module.description && <p data-eos-id="src/pages/admin/development/module-detail.tsx#27" data-eos-var="module.description" data-eos-var-label="Description" data-eos-var-scope="prop" className="text-[13px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{module.description}</p>}
            <div data-eos-id="src/pages/admin/development/module-detail.tsx#28" className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span data-eos-id="src/pages/admin/development/module-detail.tsx#29" data-eos-var="module.status" data-eos-var-label="Status" data-eos-var-scope="prop" className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', module.status === 'published' ? 'bg-moss-100 text-moss-700' : 'bg-bark-100 text-bark-700')}>
                {module.status === 'published' && <CheckCircle2 data-eos-id="src/pages/admin/development/module-detail.tsx#30" size={10} />}{module.status}
              </span>
              <span data-eos-id="src/pages/admin/development/module-detail.tsx#31" data-eos-var="module.category" data-eos-var-label="Category" data-eos-var-scope="prop" className="text-[11px] text-neutral-500 capitalize font-medium">{module.category.replace(/_/g, ' ')}</span>
              <span data-eos-id="src/pages/admin/development/module-detail.tsx#32" data-eos-var="module.estimated_minutes" data-eos-var-label="Estimated minutes" data-eos-var-scope="prop" className="flex items-center gap-0.5 text-[11px] text-neutral-400"><Clock data-eos-id="src/pages/admin/development/module-detail.tsx#33" size={10} />{module.estimated_minutes}m</span>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/development/module-detail.tsx#34" variants={fadeUp}>
        <div data-eos-id="src/pages/admin/development/module-detail.tsx#35" className="flex items-center gap-2 mb-3">
          <Eye data-eos-id="src/pages/admin/development/module-detail.tsx#36" size={14} className="text-neutral-400" />
          <h2 data-eos-id="src/pages/admin/development/module-detail.tsx#37" className="font-heading text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Content Preview</h2>
          <span data-eos-id="src/pages/admin/development/module-detail.tsx#38" className="text-[11px] font-bold text-neutral-400 tabular-nums bg-neutral-100 px-1.5 py-0.5 rounded-full">{blocks.length}</span>
        </div>
        {blocks.length === 0 ? (
          <div data-eos-id="src/pages/admin/development/module-detail.tsx#39" className="flex flex-col items-center py-12 rounded-md bg-neutral-50">
            <div data-eos-id="src/pages/admin/development/module-detail.tsx#40" className="flex items-center justify-center w-12 h-12 rounded-md bg-bark-700 shadow-sm mb-3"><BookOpen data-eos-id="src/pages/admin/development/module-detail.tsx#41" size={24} strokeWidth={1.5} className="text-white" /></div>
            <p data-eos-id="src/pages/admin/development/module-detail.tsx#42" className="text-[13px] font-semibold text-neutral-500">No content blocks</p>
            <Link data-eos-id="src/pages/admin/development/module-detail.tsx#43" to={`/admin/development/modules/${moduleId}/edit`} className="mt-3"><Button data-eos-id="src/pages/admin/development/module-detail.tsx#44" variant="secondary" size="sm" icon={<Pencil data-eos-id="src/pages/admin/development/module-detail.tsx#45" size={12} />}>Add Content</Button></Link>
          </div>
        ) : (
          <div data-eos-id="src/pages/admin/development/module-detail.tsx#46" className="space-y-4">
            {blocks.map((block) => (
              <div data-eos-id="src/pages/admin/development/module-detail.tsx#47" key={block.id} className="rounded-md bg-white shadow-sm p-4">
                <ContentBlockRenderer data-eos-id="src/pages/admin/development/module-detail.tsx#48" block={block} />
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
