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
      <AdminHeroStatRow>
        <AdminHeroStat value={blocks.length} label="Blocks" icon={<Layers size={17} />} color="bark" delay={0} reducedMotion={rm} />
        <AdminHeroStat value={assignedCount} label="Learners" icon={<Users size={17} />} color="primary" delay={1} reducedMotion={rm} />
        <AdminHeroStat value={completedCount} label="Completed" icon={<CheckCircle2 size={17} />} color="moss" delay={2} reducedMotion={rm} />
      </AdminHeroStatRow>
    ) : undefined,
    actions: module ? (
      <Link to={`/admin/development/modules/${moduleId}/edit`}>
        <motion.div whileTap={{ scale: 0.95 }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 text-white text-[12px] font-bold hover:bg-white/20 transition-colors">
          <Pencil size={13} /> Edit
        </motion.div>
      </Link>
    ) : undefined,
  })

  if (isLoading) return <div className="max-w-3xl mx-auto space-y-6"><Skeleton className="h-8 w-48 rounded-xl" /><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>

  if (!module) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 shadow-sm mb-4"><BookOpen size={24} strokeWidth={1.5} className="text-white" /></div>
        <p className="text-[15px] font-bold text-neutral-700">Module not found</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/development')} className="mt-3">Back to Development</Button>
      </div>
    )
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <motion.div variants={fadeUp} className="rounded-2xl bg-white shadow-sm p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {module.thumbnail_url ? (
            <img src={module.thumbnail_url} alt="" loading="lazy" className="w-20 h-20 rounded-xl object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          ) : (
            <div className="flex items-center justify-center w-20 h-20 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 shadow-sm shrink-0">
              <BookOpen size={28} className="text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-lg font-bold text-neutral-900">{module.title}</h1>
            {module.description && <p className="text-[13px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{module.description}</p>}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', module.status === 'published' ? 'bg-moss-100 text-moss-700' : 'bg-bark-100 text-bark-700')}>
                {module.status === 'published' && <CheckCircle2 size={10} />}{module.status}
              </span>
              <span className="text-[11px] text-neutral-500 capitalize font-medium">{module.category.replace(/_/g, ' ')}</span>
              <span className="flex items-center gap-0.5 text-[11px] text-neutral-400"><Clock size={10} />{module.estimated_minutes}m</span>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <Eye size={14} className="text-neutral-400" />
          <h2 className="font-heading text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Content Preview</h2>
          <span className="text-[11px] font-bold text-neutral-400 tabular-nums bg-neutral-100 px-1.5 py-0.5 rounded-full">{blocks.length}</span>
        </div>
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center py-12 rounded-2xl bg-neutral-50">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 shadow-sm mb-3"><BookOpen size={24} strokeWidth={1.5} className="text-white" /></div>
            <p className="text-[13px] font-semibold text-neutral-500">No content blocks</p>
            <Link to={`/admin/development/modules/${moduleId}/edit`} className="mt-3"><Button variant="secondary" size="sm" icon={<Pencil size={12} />}>Add Content</Button></Link>
          </div>
        ) : (
          <div className="space-y-4">
            {blocks.map((block) => (
              <div key={block.id} className="rounded-2xl bg-white shadow-sm p-4">
                <ContentBlockRenderer block={block} />
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
