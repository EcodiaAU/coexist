import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Plus,
  BookOpen,
  Layers,
  CircleDot,
  BarChart3,
  Clock,
  Trash2,
  Pencil,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  TrendingUp,
} from 'lucide-react'
import { SearchBar } from '@/components/search-bar'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Skeleton } from '@/components/skeleton'
import { cn } from '@/lib/cn'
import {
  useDevModules,
  useDevSections,
  useDevQuizzes,
  useDeleteModule,
  useDeleteSection,
  useDeleteQuiz,
  useDevStats,
  useAllSectionModules,
  type DevModule,
  type DevSection,
  type DevQuiz,
} from '@/hooks/use-admin-development'

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
        status === 'published' && 'bg-moss-100 text-moss-700',
        status === 'draft' && 'bg-bark-100 text-bark-700',
        status === 'archived' && 'bg-neutral-100 text-neutral-500',
      )}
    >
      {status === 'published' && <CheckCircle2 size={10} />}
      {status}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const label = category.replace(/_/g, ' ')
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-600 capitalize tracking-wide">
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon,
  label,
  count,
  newTo,
  newLabel,
  iconBg,
}: {
  icon: React.ReactNode
  label: string
  count: number
  newTo: string
  newLabel: string
  iconBg: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className={cn('flex items-center justify-center w-9 h-9 rounded-xl', iconBg)}>
          {icon}
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-neutral-900">{label}</h2>
          <p className="text-[11px] font-semibold text-neutral-400 tabular-nums">{count} total</p>
        </div>
      </div>
      <Link to={newTo}>
        <motion.div
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 text-white text-[12px] font-bold shadow-sm shadow-primary-900/15"
        >
          <Plus size={13} />
          {newLabel}
        </motion.div>
      </Link>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Row components                                                     */
/* ------------------------------------------------------------------ */

function ModuleRow({ module, onDelete, compact }: { module: DevModule; onDelete: () => void; compact?: boolean }) {
  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'group flex items-center gap-3 rounded-2xl bg-white shadow-sm transition-shadow',
        compact ? 'p-2.5 ml-6 border border-neutral-100' : 'p-3.5',
      )}
    >
      <div className={cn(
        'flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm shrink-0',
        compact ? 'w-8 h-8' : 'w-10 h-10',
      )}>
        <BookOpen size={compact ? 14 : 17} className="text-white" />
      </div>
      <Link to={`/admin/development/modules/${module.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('font-bold text-neutral-900 truncate', compact ? 'text-[12px]' : 'text-[13px]')}>{module.title}</span>
          <StatusBadge status={module.status} />
        </div>
        {!compact && (
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-medium">
            <CategoryBadge category={module.category} />
            <span className="flex items-center gap-0.5"><Clock size={10} />{module.estimated_minutes}m</span>
          </div>
        )}
      </Link>
      <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Link
          to={`/admin/development/modules/${module.id}/edit`}
          className={cn('flex items-center justify-center rounded-xl text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors', compact ? 'w-8 h-8' : 'w-10 h-10')}
        >
          <Pencil size={compact ? 14 : 16} />
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className={cn('flex items-center justify-center rounded-xl text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors', compact ? 'w-8 h-8' : 'w-10 h-10')}
        >
          <Trash2 size={compact ? 14 : 16} />
        </button>
      </div>
    </motion.div>
  )
}

function QuizRow({ quiz, onDelete }: { quiz: DevQuiz; onDelete: () => void }) {
  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="group flex items-center gap-3 p-3.5 rounded-2xl bg-white shadow-sm transition-shadow"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-moss-400 to-moss-600 shadow-sm shrink-0">
        <CircleDot size={17} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-bold text-neutral-900 truncate">{quiz.title}</span>
          <span className="text-[10px] font-bold text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded-full">
            {quiz.pass_score}% pass
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-medium">
          {quiz.time_limit_minutes && (
            <span className="flex items-center gap-0.5"><Clock size={10} />{quiz.time_limit_minutes}m limit</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Link
          to={`/admin/development/quizzes/${quiz.id}/edit`}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-sky-500 hover:text-sky-700 hover:bg-sky-50 transition-colors"
        >
          <Pencil size={16} />
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section card with nested modules                                   */
/* ------------------------------------------------------------------ */

const VISIBLE_MODULES = 3

function SectionCard({
  section,
  modules,
  onDeleteSection,
  onDeleteModule,
}: {
  section: DevSection
  modules: DevModule[]
  onDeleteSection: () => void
  onDeleteModule: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = modules.length > VISIBLE_MODULES
  const visible = expanded ? modules : modules.slice(0, VISIBLE_MODULES)

  return (
    <div className="space-y-1.5">
      {/* Section row */}
      <motion.div
        whileTap={{ scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="group flex items-center gap-3 p-3.5 rounded-2xl bg-white shadow-sm transition-shadow"
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-secondary-400 to-secondary-600 shadow-sm shrink-0">
          <Layers size={17} className="text-white" />
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-bold text-neutral-900 truncate">{section.title}</span>
            <StatusBadge status={section.status} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-medium">
            <CategoryBadge category={section.category} />
            <span className="flex items-center gap-0.5">
              <BookOpen size={10} />
              {modules.length} module{modules.length !== 1 ? 's' : ''}
            </span>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {modules.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-center w-10 h-10 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <ChevronDown size={16} />
              </motion.div>
            </button>
          )}
          <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Link
              to={`/admin/development/sections/${section.id}/edit`}
              className="flex items-center justify-center w-10 h-10 rounded-xl text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50 transition-colors"
            >
              <Pencil size={16} />
            </Link>
            <button
              type="button"
              onClick={onDeleteSection}
              className="flex items-center justify-center w-10 h-10 rounded-xl text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Nested modules */}
      <AnimatePresence initial={false}>
        {(expanded || modules.length <= VISIBLE_MODULES) && modules.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="space-y-1.5 overflow-hidden"
          >
            {visible.map((m) => (
              <ModuleRow key={m.id} module={m} onDelete={() => onDeleteModule(m.id)} compact />
            ))}
            {hasMore && !expanded && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="ml-6 text-[11px] font-semibold text-neutral-400 hover:text-neutral-600 transition-colors py-1"
              >
                + {modules.length - VISIBLE_MODULES} more module{modules.length - VISIBLE_MODULES !== 1 ? 's' : ''}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Empty row                                                          */
/* ------------------------------------------------------------------ */

function EmptyRow({ icon, label, to, cta }: { icon: React.ReactNode; label: string; to: string; cta: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-neutral-200 bg-white hover:bg-neutral-50 transition-colors">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-neutral-100 text-neutral-400 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-neutral-500">{label}</p>
        <p className="text-[11px] text-neutral-400 mt-0.5">{cta}</p>
      </div>
      <ChevronRight size={16} className="text-neutral-300 shrink-0" />
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminDevelopmentPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)

  const { data: modules, isLoading: modulesLoading } = useDevModules()
  const { data: sections, isLoading: sectionsLoading } = useDevSections()
  const { data: quizzes, isLoading: quizzesLoading } = useDevQuizzes()
  const { data: sectionModules, isLoading: smLoading } = useAllSectionModules()
  const { data: stats } = useDevStats()
  const deleteModule = useDeleteModule()
  const deleteSection = useDeleteSection()
  const deleteQuiz = useDeleteQuiz()

  const [search, setSearch] = useState('')
  const q = search.toLowerCase()

  const isLoading = modulesLoading || sectionsLoading || quizzesLoading || smLoading

  /* ── Hero stats ── */
  useAdminHeader('Development', {
    heroContent: (
      <AdminHeroStatRow>
        <AdminHeroStat value={stats?.totalModules ?? 0} label="Modules" icon={<BookOpen size={17} />} color="bark" delay={0} reducedMotion={rm} />
        <AdminHeroStat value={stats?.publishedModules ?? 0} label="Published" icon={<CheckCircle2 size={17} />} color="moss" delay={1} reducedMotion={rm} />
        <AdminHeroStat value={stats?.totalSections ?? 0} label="Sections" icon={<Layers size={17} />} color="primary" delay={2} reducedMotion={rm} />
        <AdminHeroStat value={stats?.totalQuizzes ?? 0} label="Quizzes" icon={<CircleDot size={17} />} color="sprout" delay={3} reducedMotion={rm} />
      </AdminHeroStatRow>
    ),
    actions: (
      <Link to="/admin/development/results">
        <motion.div
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/20 text-white text-[13px] font-bold hover:bg-white/30 transition-colors backdrop-blur-sm border border-white/10 shadow-sm shadow-black/5"
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/20">
            <BarChart3 size={15} />
          </div>
          <div className="text-left">
            <span className="block leading-tight">Results</span>
            <span className="block text-[10px] font-medium text-white/60 leading-tight">Analytics & Reports</span>
          </div>
          <TrendingUp size={14} className="ml-1 text-white/50" />
        </motion.div>
      </Link>
    ),
  })

  /* ── Build section → modules map ── */
  const { sectionModuleMap, assignedModuleIds } = useMemo(() => {
    const map = new Map<string, DevModule[]>()
    const assigned = new Set<string>()
    for (const sm of sectionModules ?? []) {
      if (!sm.module) continue
      assigned.add(sm.module_id)
      const list = map.get(sm.section_id) ?? []
      list.push(sm.module as DevModule)
      map.set(sm.section_id, list)
    }
    return { sectionModuleMap: map, assignedModuleIds: assigned }
  }, [sectionModules])

  /* ── Filtered lists ── */
  const filteredSections = useMemo(() => {
    const allSections = sections ?? []
    if (!q) return allSections
    return allSections.filter((s) => {
      // Match on section title or any of its modules' titles
      if (s.title.toLowerCase().includes(q)) return true
      const mods = sectionModuleMap.get(s.id) ?? []
      return mods.some((m) => m.title.toLowerCase().includes(q))
    })
  }, [sections, q, sectionModuleMap])

  const unassignedModules = useMemo(() => {
    const all = modules ?? []
    const unassigned = all.filter((m) => !assignedModuleIds.has(m.id))
    if (!q) return unassigned
    return unassigned.filter((m) => m.title.toLowerCase().includes(q))
  }, [modules, q, assignedModuleIds])

  const filteredQuizzes = useMemo(() => (quizzes ?? []).filter((qz) => !q || qz.title.toLowerCase().includes(q)), [quizzes, q])

  /* ── Filtered modules within a section (for search) ── */
  const getFilteredModules = (sectionId: string) => {
    const mods = sectionModuleMap.get(sectionId) ?? []
    if (!q) return mods
    return mods.filter((m) => m.title.toLowerCase().includes(q))
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-7">
      {/* ── Search ── */}
      <motion.div variants={fadeUp}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search modules, sections, quizzes..." compact />
      </motion.div>

      {/* ── Sections (with nested modules) ── */}
      <motion.section variants={fadeUp} className="space-y-3">
        <SectionHeader
          icon={<Layers size={17} className="text-white" />}
          iconBg="bg-gradient-to-br from-secondary-400 to-secondary-600 shadow-sm"
          label="Sections"
          count={filteredSections.length}
          newTo="/admin/development/sections/new"
          newLabel="New"
        />
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[68px] rounded-2xl" />
            <Skeleton className="h-[68px] rounded-2xl" />
          </div>
        ) : filteredSections.length === 0 ? (
          <EmptyRow
            icon={<Layers size={20} strokeWidth={1.5} />}
            label="No sections yet"
            to="/admin/development/sections/new"
            cta="Organise modules into learning pathways"
          />
        ) : (
          <div className="space-y-3">
            {filteredSections.map((s) => (
              <SectionCard
                key={s.id}
                section={s}
                modules={getFilteredModules(s.id)}
                onDeleteSection={() => deleteSection.mutate(s.id)}
                onDeleteModule={(id) => deleteModule.mutate(id)}
              />
            ))}
          </div>
        )}
      </motion.section>

      {/* ── Modules (nested under sections) ── */}
      <motion.section variants={fadeUp} className="space-y-3 ml-4 border-l-2 border-neutral-100 pl-4">
        <SectionHeader
          icon={<BookOpen size={17} className="text-white" />}
          iconBg="bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm"
          label="Modules"
          count={(modules ?? []).length}
          newTo="/admin/development/modules/new"
          newLabel="New"
        />
        {!isLoading && unassignedModules.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Unassigned</p>
            <div className="space-y-2">
              {unassignedModules.map((m) => (
                <ModuleRow key={m.id} module={m} onDelete={() => deleteModule.mutate(m.id)} />
              ))}
            </div>
          </>
        )}
      </motion.section>

      {/* ── Quizzes ── */}
      <motion.section variants={fadeUp} className="space-y-3">
        <SectionHeader
          icon={<CircleDot size={17} className="text-white" />}
          iconBg="bg-gradient-to-br from-moss-400 to-moss-600 shadow-sm"
          label="Quizzes"
          count={filteredQuizzes.length}
          newTo="/admin/development/quizzes/new"
          newLabel="New"
        />
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[68px] rounded-2xl" />
            <Skeleton className="h-[68px] rounded-2xl" />
          </div>
        ) : filteredQuizzes.length === 0 ? (
          <EmptyRow
            icon={<CircleDot size={20} strokeWidth={1.5} />}
            label="No quizzes yet"
            to="/admin/development/quizzes/new"
            cta="Design assessments to test knowledge"
          />
        ) : (
          <div className="space-y-2">
            {filteredQuizzes.map((qz) => (
              <QuizRow key={qz.id} quiz={qz} onDelete={() => deleteQuiz.mutate(qz.id)} />
            ))}
          </div>
        )}
      </motion.section>
    </motion.div>
  )
}
