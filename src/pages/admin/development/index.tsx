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
    <span data-eos-id="src/pages/admin/development/index.tsx#0" data-eos-v="2"
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
        status === 'published' && 'bg-moss-100 text-moss-700',
        status === 'draft' && 'bg-bark-100 text-bark-700',
        status === 'archived' && 'bg-neutral-100 text-neutral-500',
      )}
    >
      {status === 'published' && <CheckCircle2 data-eos-id="src/pages/admin/development/index.tsx#1" size={10} />}
      {status}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const label = category.replace(/_/g, ' ')
  return (
    <span data-eos-id="src/pages/admin/development/index.tsx#2" className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-600 capitalize tracking-wide">
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
    <div data-eos-id="src/pages/admin/development/index.tsx#3" className="flex items-center justify-between">
      <div data-eos-id="src/pages/admin/development/index.tsx#4" className="flex items-center gap-2.5">
        <div data-eos-id="src/pages/admin/development/index.tsx#5" className={cn('flex items-center justify-center w-9 h-9 rounded-sm', iconBg)}>
          {icon}
        </div>
        <div data-eos-id="src/pages/admin/development/index.tsx#6">
          <h2 data-eos-id="src/pages/admin/development/index.tsx#7" className="text-[15px] font-bold text-neutral-900">{label}</h2>
          <p data-eos-id="src/pages/admin/development/index.tsx#8" className="text-[11px] font-semibold text-neutral-400 tabular-nums">{count} total</p>
        </div>
      </div>
      <Link data-eos-id="src/pages/admin/development/index.tsx#9" to={newTo}>
        <motion.div data-eos-id="src/pages/admin/development/index.tsx#10"
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-sm bg-primary-700 text-white text-[12px] font-bold shadow-sm"
        >
          <Plus data-eos-id="src/pages/admin/development/index.tsx#11" size={13} />
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
    <motion.div data-eos-id="src/pages/admin/development/index.tsx#12"
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'group flex items-center gap-3 rounded-md bg-white shadow-sm transition-shadow',
        compact ? 'p-2.5 ml-6 border border-neutral-100' : 'p-3.5',
      )}
    >
      <div data-eos-id="src/pages/admin/development/index.tsx#13" className={cn(
        'flex items-center justify-center rounded-sm bg-bark-600 shadow-sm shrink-0',
        compact ? 'w-8 h-8' : 'w-10 h-10',
      )}>
        <BookOpen data-eos-id="src/pages/admin/development/index.tsx#14" size={compact ? 14 : 17} className="text-white" />
      </div>
      <Link data-eos-id="src/pages/admin/development/index.tsx#15" to={`/admin/development/modules/${module.id}`} className="flex-1 min-w-0">
        <div data-eos-id="src/pages/admin/development/index.tsx#16" className="flex items-center gap-1.5 flex-wrap">
          <span data-eos-id="src/pages/admin/development/index.tsx#17" data-eos-var="module.title" data-eos-var-label="Title" data-eos-var-scope="prop" className={cn('font-bold text-neutral-900 truncate', compact ? 'text-[12px]' : 'text-[13px]')}>{module.title}</span>
          <StatusBadge data-eos-id="src/pages/admin/development/index.tsx#18" status={module.status} />
        </div>
        {!compact && (
          <div data-eos-id="src/pages/admin/development/index.tsx#19" className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-medium">
            <CategoryBadge data-eos-id="src/pages/admin/development/index.tsx#20" category={module.category} />
            <span data-eos-id="src/pages/admin/development/index.tsx#21" data-eos-var="module.estimated_minutes" data-eos-var-label="Estimated minutes" data-eos-var-scope="prop" className="flex items-center gap-0.5"><Clock data-eos-id="src/pages/admin/development/index.tsx#22" size={10} />{module.estimated_minutes}m</span>
          </div>
        )}
      </Link>
      <div data-eos-id="src/pages/admin/development/index.tsx#23" className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Link data-eos-id="src/pages/admin/development/index.tsx#24"
          to={`/admin/development/modules/${module.id}/edit`}
          className={cn('flex items-center justify-center rounded-sm text-bark-500 hover:text-bark-700 hover:bg-bark-50 transition-colors', compact ? 'w-8 h-8' : 'w-10 h-10')}
        >
          <Pencil data-eos-id="src/pages/admin/development/index.tsx#25" size={compact ? 14 : 16} />
        </Link>
        <button data-eos-id="src/pages/admin/development/index.tsx#26"
          type="button"
          onClick={onDelete}
          className={cn('flex items-center justify-center rounded-sm text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors', compact ? 'w-8 h-8' : 'w-10 h-10')}
        >
          <Trash2 data-eos-id="src/pages/admin/development/index.tsx#27" size={compact ? 14 : 16} />
        </button>
      </div>
    </motion.div>
  )
}

function QuizRow({ quiz, onDelete }: { quiz: DevQuiz; onDelete: () => void }) {
  return (
    <motion.div data-eos-id="src/pages/admin/development/index.tsx#28"
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="group flex items-center gap-3 p-3.5 rounded-md bg-white shadow-sm transition-shadow"
    >
      <div data-eos-id="src/pages/admin/development/index.tsx#29" className="flex items-center justify-center w-10 h-10 rounded-sm bg-moss-600 shadow-sm shrink-0">
        <CircleDot data-eos-id="src/pages/admin/development/index.tsx#30" size={17} className="text-white" />
      </div>
      <div data-eos-id="src/pages/admin/development/index.tsx#31" className="flex-1 min-w-0">
        <div data-eos-id="src/pages/admin/development/index.tsx#32" className="flex items-center gap-1.5 flex-wrap">
          <span data-eos-id="src/pages/admin/development/index.tsx#33" data-eos-var="quiz.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-[13px] font-bold text-neutral-900 truncate">{quiz.title}</span>
          <span data-eos-id="src/pages/admin/development/index.tsx#34" data-eos-var="quiz.pass_score" data-eos-var-label="Pass score" data-eos-var-scope="prop" className="text-[10px] font-bold text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded-full">
            {quiz.pass_score}% pass
          </span>
        </div>
        <div data-eos-id="src/pages/admin/development/index.tsx#35" className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-medium">
          {quiz.time_limit_minutes && (
            <span data-eos-id="src/pages/admin/development/index.tsx#36" data-eos-var="quiz.time_limit_minutes" data-eos-var-label="Time limit minutes" data-eos-var-scope="prop" className="flex items-center gap-0.5"><Clock data-eos-id="src/pages/admin/development/index.tsx#37" size={10} />{quiz.time_limit_minutes}m limit</span>
          )}
        </div>
      </div>
      <div data-eos-id="src/pages/admin/development/index.tsx#38" className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Link data-eos-id="src/pages/admin/development/index.tsx#39"
          to={`/admin/development/quizzes/${quiz.id}/edit`}
          className="flex items-center justify-center w-10 h-10 rounded-sm text-sky-500 hover:text-sky-700 hover:bg-sky-50 transition-colors"
        >
          <Pencil data-eos-id="src/pages/admin/development/index.tsx#40" size={16} />
        </Link>
        <button data-eos-id="src/pages/admin/development/index.tsx#41"
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center w-10 h-10 rounded-sm text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors"
        >
          <Trash2 data-eos-id="src/pages/admin/development/index.tsx#42" size={16} />
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
    <div data-eos-id="src/pages/admin/development/index.tsx#43" className="space-y-1.5">
      {/* Section row */}
      <motion.div data-eos-id="src/pages/admin/development/index.tsx#44"
        whileTap={{ scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="group flex items-center gap-3 p-3.5 rounded-md bg-white shadow-sm transition-shadow"
      >
        <div data-eos-id="src/pages/admin/development/index.tsx#45" className="flex items-center justify-center w-10 h-10 rounded-sm bg-secondary-600 shadow-sm shrink-0">
          <Layers data-eos-id="src/pages/admin/development/index.tsx#46" size={17} className="text-white" />
        </div>
        <button data-eos-id="src/pages/admin/development/index.tsx#47"
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-1 min-w-0 text-left"
        >
          <div data-eos-id="src/pages/admin/development/index.tsx#48" className="flex items-center gap-1.5 flex-wrap">
            <span data-eos-id="src/pages/admin/development/index.tsx#49" data-eos-var="section.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-[13px] font-bold text-neutral-900 truncate">{section.title}</span>
            <StatusBadge data-eos-id="src/pages/admin/development/index.tsx#50" status={section.status} />
          </div>
          <div data-eos-id="src/pages/admin/development/index.tsx#51" className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-medium">
            <CategoryBadge data-eos-id="src/pages/admin/development/index.tsx#52" category={section.category} />
            <span data-eos-id="src/pages/admin/development/index.tsx#53" className="flex items-center gap-0.5">
              <BookOpen data-eos-id="src/pages/admin/development/index.tsx#54" size={10} />
              {modules.length} module{modules.length !== 1 ? 's' : ''}
            </span>
          </div>
        </button>
        <div data-eos-id="src/pages/admin/development/index.tsx#55" className="flex items-center gap-1 shrink-0">
          {modules.length > 0 && (
            <button data-eos-id="src/pages/admin/development/index.tsx#56"
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-center w-10 h-10 rounded-sm text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              <motion.div data-eos-id="src/pages/admin/development/index.tsx#57"
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <ChevronDown data-eos-id="src/pages/admin/development/index.tsx#58" size={16} />
              </motion.div>
            </button>
          )}
          <div data-eos-id="src/pages/admin/development/index.tsx#59" className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Link data-eos-id="src/pages/admin/development/index.tsx#60"
              to={`/admin/development/sections/${section.id}/edit`}
              className="flex items-center justify-center w-10 h-10 rounded-sm text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50 transition-colors"
            >
              <Pencil data-eos-id="src/pages/admin/development/index.tsx#61" size={16} />
            </Link>
            <button data-eos-id="src/pages/admin/development/index.tsx#62"
              type="button"
              onClick={onDeleteSection}
              className="flex items-center justify-center w-10 h-10 rounded-sm text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors"
            >
              <Trash2 data-eos-id="src/pages/admin/development/index.tsx#63" size={16} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Nested modules */}
      <AnimatePresence data-eos-id="src/pages/admin/development/index.tsx#64" initial={false}>
        {(expanded || modules.length <= VISIBLE_MODULES) && modules.length > 0 && (
          <motion.div data-eos-id="src/pages/admin/development/index.tsx#65"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="space-y-1.5 overflow-hidden"
          >
            {visible.map((m) => (
              <ModuleRow data-eos-id="src/pages/admin/development/index.tsx#66" key={m.id} module={m} onDelete={() => onDeleteModule(m.id)} compact />
            ))}
            {hasMore && !expanded && (
              <button data-eos-id="src/pages/admin/development/index.tsx#67"
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
    <Link data-eos-id="src/pages/admin/development/index.tsx#68" to={to} className="flex items-center gap-3 p-4 rounded-md border-2 border-dashed border-neutral-200 bg-white hover:bg-neutral-50 transition-colors">
      <div data-eos-id="src/pages/admin/development/index.tsx#69" className="flex items-center justify-center w-10 h-10 rounded-sm bg-neutral-100 text-neutral-400 shrink-0">
        {icon}
      </div>
      <div data-eos-id="src/pages/admin/development/index.tsx#70" className="flex-1 min-w-0">
        <p data-eos-id="src/pages/admin/development/index.tsx#71" className="text-[13px] font-semibold text-neutral-500">{label}</p>
        <p data-eos-id="src/pages/admin/development/index.tsx#72" className="text-[11px] text-neutral-400 mt-0.5">{cta}</p>
      </div>
      <ChevronRight data-eos-id="src/pages/admin/development/index.tsx#73" size={16} className="text-neutral-300 shrink-0" />
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
      <AdminHeroStatRow data-eos-id="src/pages/admin/development/index.tsx#74">
        <AdminHeroStat data-eos-id="src/pages/admin/development/index.tsx#75" value={stats?.totalModules ?? 0} label="Modules" icon={<BookOpen data-eos-id="src/pages/admin/development/index.tsx#76" size={17} />} color="bark" delay={0} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/development/index.tsx#77" value={stats?.publishedModules ?? 0} label="Published" icon={<CheckCircle2 data-eos-id="src/pages/admin/development/index.tsx#78" size={17} />} color="moss" delay={1} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/development/index.tsx#79" value={stats?.totalSections ?? 0} label="Sections" icon={<Layers data-eos-id="src/pages/admin/development/index.tsx#80" size={17} />} color="primary" delay={2} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/development/index.tsx#81" value={stats?.totalQuizzes ?? 0} label="Quizzes" icon={<CircleDot data-eos-id="src/pages/admin/development/index.tsx#82" size={17} />} color="sprout" delay={3} reducedMotion={rm} />
      </AdminHeroStatRow>
    ),
    actions: (
      <Link data-eos-id="src/pages/admin/development/index.tsx#83" to="/admin/development/results">
        <motion.div data-eos-id="src/pages/admin/development/index.tsx#84"
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-white/20 text-white text-[13px] font-bold hover:bg-white/30 transition-colors backdrop-blur-sm border border-white/10 shadow-sm"
        >
          <div data-eos-id="src/pages/admin/development/index.tsx#85" className="flex items-center justify-center w-7 h-7 rounded-sm bg-white/20">
            <BarChart3 data-eos-id="src/pages/admin/development/index.tsx#86" size={15} />
          </div>
          <div data-eos-id="src/pages/admin/development/index.tsx#87" className="text-left">
            <span data-eos-id="src/pages/admin/development/index.tsx#88" className="block leading-tight">Results</span>
            <span data-eos-id="src/pages/admin/development/index.tsx#89" className="block text-[10px] font-medium text-white/60 leading-tight">Analytics & Reports</span>
          </div>
          <TrendingUp data-eos-id="src/pages/admin/development/index.tsx#90" size={14} className="ml-1 text-white/50" />
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
    <motion.div data-eos-id="src/pages/admin/development/index.tsx#91" variants={stagger} initial="hidden" animate="visible" className="space-y-7">
      {/* ── Search ── */}
      <motion.div data-eos-id="src/pages/admin/development/index.tsx#92" variants={fadeUp}>
        <SearchBar data-eos-id="src/pages/admin/development/index.tsx#93" value={search} onChange={setSearch} placeholder="Search modules, sections, quizzes..." compact />
      </motion.div>

      {/* ── Sections (with nested modules) ── */}
      <motion.section data-eos-id="src/pages/admin/development/index.tsx#94" variants={fadeUp} className="space-y-3">
        <SectionHeader data-eos-id="src/pages/admin/development/index.tsx#95"
          icon={<Layers data-eos-id="src/pages/admin/development/index.tsx#96" size={17} className="text-white" />}
          iconBg="bg-secondary-600 shadow-sm"
          label="Sections"
          count={filteredSections.length}
          newTo="/admin/development/sections/new"
          newLabel="New"
        />
        {isLoading ? (
          <div data-eos-id="src/pages/admin/development/index.tsx#97" className="space-y-2">
            <Skeleton data-eos-id="src/pages/admin/development/index.tsx#98" className="h-[68px] rounded-md" />
            <Skeleton data-eos-id="src/pages/admin/development/index.tsx#99" className="h-[68px] rounded-md" />
          </div>
        ) : filteredSections.length === 0 ? (
          <EmptyRow data-eos-id="src/pages/admin/development/index.tsx#100"
            icon={<Layers data-eos-id="src/pages/admin/development/index.tsx#101" size={20} strokeWidth={1.5} />}
            label="No sections yet"
            to="/admin/development/sections/new"
            cta="Organise modules into learning pathways"
          />
        ) : (
          <div data-eos-id="src/pages/admin/development/index.tsx#102" className="space-y-3">
            {filteredSections.map((s) => (
              <SectionCard data-eos-id="src/pages/admin/development/index.tsx#103"
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
      <motion.section data-eos-id="src/pages/admin/development/index.tsx#104" variants={fadeUp} className="space-y-3 ml-4 border-l-2 border-neutral-100 pl-4">
        <SectionHeader data-eos-id="src/pages/admin/development/index.tsx#105"
          icon={<BookOpen data-eos-id="src/pages/admin/development/index.tsx#106" size={17} className="text-white" />}
          iconBg="bg-bark-600 shadow-sm"
          label="Modules"
          count={(modules ?? []).length}
          newTo="/admin/development/modules/new"
          newLabel="New"
        />
        {!isLoading && unassignedModules.length > 0 && (
          <>
            <p data-eos-id="src/pages/admin/development/index.tsx#107" className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Unassigned</p>
            <div data-eos-id="src/pages/admin/development/index.tsx#108" className="space-y-2">
              {unassignedModules.map((m) => (
                <ModuleRow data-eos-id="src/pages/admin/development/index.tsx#109" key={m.id} module={m} onDelete={() => deleteModule.mutate(m.id)} />
              ))}
            </div>
          </>
        )}
      </motion.section>

      {/* ── Quizzes ── */}
      <motion.section data-eos-id="src/pages/admin/development/index.tsx#110" variants={fadeUp} className="space-y-3">
        <SectionHeader data-eos-id="src/pages/admin/development/index.tsx#111"
          icon={<CircleDot data-eos-id="src/pages/admin/development/index.tsx#112" size={17} className="text-white" />}
          iconBg="bg-moss-600 shadow-sm"
          label="Quizzes"
          count={filteredQuizzes.length}
          newTo="/admin/development/quizzes/new"
          newLabel="New"
        />
        {isLoading ? (
          <div data-eos-id="src/pages/admin/development/index.tsx#113" className="space-y-2">
            <Skeleton data-eos-id="src/pages/admin/development/index.tsx#114" className="h-[68px] rounded-md" />
            <Skeleton data-eos-id="src/pages/admin/development/index.tsx#115" className="h-[68px] rounded-md" />
          </div>
        ) : filteredQuizzes.length === 0 ? (
          <EmptyRow data-eos-id="src/pages/admin/development/index.tsx#116"
            icon={<CircleDot data-eos-id="src/pages/admin/development/index.tsx#117" size={20} strokeWidth={1.5} />}
            label="No quizzes yet"
            to="/admin/development/quizzes/new"
            cta="Design assessments to test knowledge"
          />
        ) : (
          <div data-eos-id="src/pages/admin/development/index.tsx#118" className="space-y-2">
            {filteredQuizzes.map((qz) => (
              <QuizRow data-eos-id="src/pages/admin/development/index.tsx#119" key={qz.id} quiz={qz} onDelete={() => deleteQuiz.mutate(qz.id)} />
            ))}
          </div>
        )}
      </motion.section>
    </motion.div>
  )
}
