import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { Users, BookOpen, CircleDot, Download, CheckCircle2, Target, TrendingUp } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { useDevAnalytics, useDevModules, useDevQuizzes } from '@/hooks/use-admin-development'

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

function SectionHeader({ icon, label, action }: { icon: React.ReactNode; label: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div data-eos-id="src/pages/admin/development/results.tsx#0" className="flex items-center justify-between">
      <div data-eos-id="src/pages/admin/development/results.tsx#1" className="flex items-center gap-2"><span data-eos-id="src/pages/admin/development/results.tsx#2" className="text-neutral-400">{icon}</span><h2 data-eos-id="src/pages/admin/development/results.tsx#3" className="font-heading text-[13px] font-bold text-neutral-500/60 uppercase tracking-widest">{label}</h2></div>
      {action && <Button data-eos-id="src/pages/admin/development/results.tsx#4" data-eos-var="action.label" data-eos-var-label="Label" data-eos-var-scope="prop" variant="ghost" size="sm" icon={<Download data-eos-id="src/pages/admin/development/results.tsx#5" size={12} />} onClick={action.onClick}>{action.label}</Button>}
    </div>
  )
}

export default function AdminDevelopmentResultsPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)
  const { data: analytics, isLoading } = useDevAnalytics()
  const { data: modules = [] } = useDevModules()
  const { data: quizzes = [] } = useDevQuizzes()

  useAdminHeader('Development Results', {
    heroContent: (
      <AdminHeroStatRow data-eos-id="src/pages/admin/development/results.tsx#6">
        <AdminHeroStat data-eos-id="src/pages/admin/development/results.tsx#7" value={analytics?.totalLearners ?? 0} label="Learners" icon={<Users data-eos-id="src/pages/admin/development/results.tsx#8" size={17} />} color="primary" delay={0} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/development/results.tsx#9" value={analytics?.avgCompletion ?? 0} label="Avg Completion" icon={<TrendingUp data-eos-id="src/pages/admin/development/results.tsx#10" size={17} />} color="moss" sub="%" delay={1} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/development/results.tsx#11" value={analytics?.completedModules ?? 0} label="Modules Done" icon={<CheckCircle2 data-eos-id="src/pages/admin/development/results.tsx#12" size={17} />} color="bark" delay={2} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/development/results.tsx#13" value={analytics?.avgQuizScore ?? 0} label="Avg Quiz" icon={<Target data-eos-id="src/pages/admin/development/results.tsx#14" size={17} />} color="sprout" sub="%" delay={3} reducedMotion={rm} />
      </AdminHeroStatRow>
    ),
  })

  const moduleStats = useMemo(() => {
    if (!analytics) return []
    return modules.map((m) => { const progress = analytics.progress.filter((p: Record<string, unknown>) => p.module_id === m.id); const completed = progress.filter((p: Record<string, unknown>) => p.status === 'completed').length; const avgTime = progress.length > 0 ? Math.round(progress.reduce((sum: number, p: Record<string, unknown>) => sum + ((p.time_spent_sec as number) ?? 0), 0) / progress.length / 60) : 0; return { ...m, assigned: progress.length, completed, completionRate: progress.length > 0 ? Math.round((completed / progress.length) * 100) : 0, avgTimeMin: avgTime } }).filter((m) => m.assigned > 0)
  }, [analytics, modules])

  const quizStats = useMemo(() => {
    if (!analytics) return []
    return quizzes.map((q) => { const attempts = analytics.attempts.filter((a: Record<string, unknown>) => a.quiz_id === q.id); const passed = attempts.filter((a: Record<string, unknown>) => a.passed).length; const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((sum: number, a: Record<string, unknown>) => sum + (a.score_pct as number), 0) / attempts.length) : 0; return { ...q, totalAttempts: attempts.length, passRate: attempts.length > 0 ? Math.round((passed / attempts.length) * 100) : 0, avgScore } }).filter((q) => q.totalAttempts > 0)
  }, [analytics, quizzes])

  const learnerStats = useMemo(() => {
    if (!analytics) return []
    const userMap = new Map<string, { completed: number; total: number; scores: number[]; lastActive: string }>()
    for (const p of analytics.progress) { const e = userMap.get(p.user_id as string) ?? { completed: 0, total: 0, scores: [], lastActive: '' }; e.total++; if (p.status === 'completed') e.completed++; if ((p.updated_at as string) > e.lastActive) e.lastActive = p.updated_at as string; userMap.set(p.user_id as string, e) }
    for (const a of analytics.attempts) { const e = userMap.get(a.user_id as string); if (e) e.scores.push(a.score_pct as number) }
    const profileMap = analytics.profileMap as Map<string, { display_name: string; avatar_url: string | null }> | undefined
    return Array.from(userMap.entries()).map(([userId, s]) => {
      const profile = profileMap?.get(userId)
      return { userId, displayName: profile?.display_name ?? userId.slice(0, 8), avatarUrl: profile?.avatar_url ?? null, modulesCompleted: s.completed, modulesTotal: s.total, avgQuizScore: s.scores.length > 0 ? Math.round(s.scores.reduce((a, v) => a + v, 0) / s.scores.length) : null, lastActive: s.lastActive }
    }).sort((a, b) => b.modulesCompleted - a.modulesCompleted)
  }, [analytics])

  return (
    <motion.div data-eos-id="src/pages/admin/development/results.tsx#15" variants={stagger} initial="hidden" animate="visible" className="space-y-8">
      {isLoading ? <div data-eos-id="src/pages/admin/development/results.tsx#16" className="space-y-3"><Skeleton data-eos-id="src/pages/admin/development/results.tsx#17" className="h-16 rounded-md" /><Skeleton data-eos-id="src/pages/admin/development/results.tsx#18" className="h-16 rounded-md" /><Skeleton data-eos-id="src/pages/admin/development/results.tsx#19" className="h-16 rounded-md" /></div> : (
        <>
          <motion.section data-eos-id="src/pages/admin/development/results.tsx#20" variants={fadeUp} className="space-y-3">
            <SectionHeader data-eos-id="src/pages/admin/development/results.tsx#21" icon={<BookOpen data-eos-id="src/pages/admin/development/results.tsx#22" size={14} />} label="Module Performance" action={moduleStats.length > 0 ? { label: 'CSV', onClick: () => downloadCsv('module-results.csv', ['Module','Category','Assigned','Completed','Rate','Avg Time'], moduleStats.map((m) => [m.title, m.category, String(m.assigned), String(m.completed), `${m.completionRate}%`, String(m.avgTimeMin)])) } : undefined} />
            {moduleStats.length === 0 ? <p data-eos-id="src/pages/admin/development/results.tsx#23" className="text-sm text-neutral-500 text-center py-8">No module progress data yet</p> : (
              <div data-eos-id="src/pages/admin/development/results.tsx#24" className="space-y-2">{moduleStats.map((m) => (
                <div data-eos-id="src/pages/admin/development/results.tsx#25" key={m.id} className="flex items-center gap-3 p-3.5 rounded-md bg-white shadow-sm transition-shadow">
                  <div data-eos-id="src/pages/admin/development/results.tsx#26" className="flex items-center justify-center w-10 h-10 rounded-sm bg-bark-700 shadow-sm shrink-0"><BookOpen data-eos-id="src/pages/admin/development/results.tsx#27" size={16} className="text-white" /></div>
                  <div data-eos-id="src/pages/admin/development/results.tsx#28" className="flex-1 min-w-0"><p data-eos-id="src/pages/admin/development/results.tsx#29" data-eos-var="m.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-[13px] font-bold text-neutral-900 truncate">{m.title}</p><p data-eos-id="src/pages/admin/development/results.tsx#30" data-eos-var="m.category" data-eos-var-label="Category" data-eos-var-scope="item" className="text-[11px] text-neutral-500 capitalize">{m.category.replace(/_/g, ' ')}</p></div>
                  <div data-eos-id="src/pages/admin/development/results.tsx#31" className="flex items-center gap-3 sm:gap-4 text-center shrink-0"><div data-eos-id="src/pages/admin/development/results.tsx#32"><p data-eos-id="src/pages/admin/development/results.tsx#33" data-eos-var="m.assigned" data-eos-var-label="Assigned" data-eos-var-scope="item" className="text-sm font-bold text-neutral-900 tabular-nums">{m.assigned}</p><p data-eos-id="src/pages/admin/development/results.tsx#34" className="text-[9px] text-neutral-500 font-medium">Assigned</p></div><div data-eos-id="src/pages/admin/development/results.tsx#35"><p data-eos-id="src/pages/admin/development/results.tsx#36" data-eos-var="m.completionRate" data-eos-var-label="Completion rate" data-eos-var-scope="item" className="text-sm font-bold text-moss-600 tabular-nums">{m.completionRate}%</p><p data-eos-id="src/pages/admin/development/results.tsx#37" className="text-[9px] text-neutral-500 font-medium">Rate</p></div><div data-eos-id="src/pages/admin/development/results.tsx#38" className="hidden sm:block"><p data-eos-id="src/pages/admin/development/results.tsx#39" data-eos-var="m.avgTimeMin" data-eos-var-label="Avg time min" data-eos-var-scope="item" className="text-sm font-bold text-sky-600 tabular-nums">{m.avgTimeMin}m</p><p data-eos-id="src/pages/admin/development/results.tsx#40" className="text-[9px] text-neutral-500 font-medium">Avg Time</p></div></div>
                </div>
              ))}</div>
            )}
          </motion.section>

          <motion.section data-eos-id="src/pages/admin/development/results.tsx#41" variants={fadeUp} className="space-y-3">
            <SectionHeader data-eos-id="src/pages/admin/development/results.tsx#42" icon={<CircleDot data-eos-id="src/pages/admin/development/results.tsx#43" size={14} />} label="Quiz Performance" action={quizStats.length > 0 ? { label: 'CSV', onClick: () => downloadCsv('quiz-results.csv', ['Quiz','Attempts','Pass Rate','Avg Score'], quizStats.map((q) => [q.title, String(q.totalAttempts), `${q.passRate}%`, `${q.avgScore}%`])) } : undefined} />
            {quizStats.length === 0 ? <p data-eos-id="src/pages/admin/development/results.tsx#44" className="text-sm text-neutral-500 text-center py-8">No quiz attempt data yet</p> : (
              <div data-eos-id="src/pages/admin/development/results.tsx#45" className="space-y-2">{quizStats.map((q) => (
                <div data-eos-id="src/pages/admin/development/results.tsx#46" key={q.id} className="flex items-center gap-3 p-3.5 rounded-md bg-white shadow-sm transition-shadow">
                  <div data-eos-id="src/pages/admin/development/results.tsx#47" className="flex items-center justify-center w-10 h-10 rounded-sm bg-moss-700 shadow-sm shrink-0"><CircleDot data-eos-id="src/pages/admin/development/results.tsx#48" size={16} className="text-white" /></div>
                  <div data-eos-id="src/pages/admin/development/results.tsx#49" className="flex-1 min-w-0"><p data-eos-id="src/pages/admin/development/results.tsx#50" data-eos-var="q.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-[13px] font-bold text-neutral-900 truncate">{q.title}</p><p data-eos-id="src/pages/admin/development/results.tsx#51" data-eos-var="q.pass_score" data-eos-var-label="Pass score" data-eos-var-scope="item" className="text-[11px] text-neutral-500">Pass threshold: {q.pass_score}%</p></div>
                  <div data-eos-id="src/pages/admin/development/results.tsx#52" className="flex items-center gap-3 sm:gap-4 text-center shrink-0"><div data-eos-id="src/pages/admin/development/results.tsx#53"><p data-eos-id="src/pages/admin/development/results.tsx#54" data-eos-var="q.totalAttempts" data-eos-var-label="Total attempts" data-eos-var-scope="item" className="text-sm font-bold text-neutral-900 tabular-nums">{q.totalAttempts}</p><p data-eos-id="src/pages/admin/development/results.tsx#55" className="text-[9px] text-neutral-500 font-medium">Attempts</p></div><div data-eos-id="src/pages/admin/development/results.tsx#56"><p data-eos-id="src/pages/admin/development/results.tsx#57" data-eos-var="q.passRate" data-eos-var-label="Pass rate" data-eos-var-scope="item" className="text-sm font-bold text-moss-600 tabular-nums">{q.passRate}%</p><p data-eos-id="src/pages/admin/development/results.tsx#58" className="text-[9px] text-neutral-500 font-medium">Pass</p></div><div data-eos-id="src/pages/admin/development/results.tsx#59"><p data-eos-id="src/pages/admin/development/results.tsx#60" data-eos-var="q.avgScore" data-eos-var-label="Avg score" data-eos-var-scope="item" className="text-sm font-bold text-sky-600 tabular-nums">{q.avgScore}%</p><p data-eos-id="src/pages/admin/development/results.tsx#61" className="text-[9px] text-neutral-500 font-medium">Avg</p></div></div>
                </div>
              ))}</div>
            )}
          </motion.section>

          <motion.section data-eos-id="src/pages/admin/development/results.tsx#62" variants={fadeUp} className="space-y-3">
            <SectionHeader data-eos-id="src/pages/admin/development/results.tsx#63" icon={<Users data-eos-id="src/pages/admin/development/results.tsx#64" size={14} />} label="Learner Progress" action={learnerStats.length > 0 ? { label: 'CSV', onClick: () => downloadCsv('learner-results.csv', ['Name','Completed','Total','Avg Quiz','Last Active'], learnerStats.map((l) => [l.displayName, String(l.modulesCompleted), String(l.modulesTotal), l.avgQuizScore !== null ? `${l.avgQuizScore}%` : 'N/A', l.lastActive ? new Date(l.lastActive).toLocaleDateString() : 'N/A'])) } : undefined} />
            {learnerStats.length === 0 ? <p data-eos-id="src/pages/admin/development/results.tsx#65" className="text-sm text-neutral-500 text-center py-8">No learner data yet</p> : (
              <div data-eos-id="src/pages/admin/development/results.tsx#66" className="space-y-2">{learnerStats.map((l) => (
                <div data-eos-id="src/pages/admin/development/results.tsx#67" key={l.userId} className="flex items-center gap-3 p-3.5 rounded-md bg-white shadow-sm transition-shadow">
                  {l.avatarUrl ? (
                    <img data-eos-id="src/pages/admin/development/results.tsx#68" src={l.avatarUrl} alt="" loading="lazy" className="w-10 h-10 rounded-sm object-cover shrink-0 shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <div data-eos-id="src/pages/admin/development/results.tsx#69" data-eos-var="l.displayName" data-eos-var-label="Display name" data-eos-var-scope="item" className="w-10 h-10 rounded-sm bg-primary-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-sm">{l.displayName.slice(0, 2).toUpperCase()}</div>
                  )}
                  <div data-eos-id="src/pages/admin/development/results.tsx#70" className="flex-1 min-w-0"><p data-eos-id="src/pages/admin/development/results.tsx#71" data-eos-var="l.displayName" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-[13px] font-bold text-neutral-900 truncate">{l.displayName}</p><p data-eos-id="src/pages/admin/development/results.tsx#72" data-eos-var="l.lastActive" data-eos-var-label="Last active" data-eos-var-scope="item" className="text-[11px] text-neutral-500">Last active: {l.lastActive ? new Date(l.lastActive).toLocaleDateString() : 'N/A'}</p></div>
                  <div data-eos-id="src/pages/admin/development/results.tsx#73" className="flex items-center gap-3 sm:gap-4 text-center shrink-0"><div data-eos-id="src/pages/admin/development/results.tsx#74"><p data-eos-id="src/pages/admin/development/results.tsx#75" data-eos-var="l.modulesCompleted,l.modulesTotal" data-eos-var-label="Modules completed, Modules total" data-eos-var-scope="item" className="text-sm font-bold text-neutral-900 tabular-nums">{l.modulesCompleted}/{l.modulesTotal}</p><p data-eos-id="src/pages/admin/development/results.tsx#76" className="text-[9px] text-neutral-500 font-medium">Modules</p></div><div data-eos-id="src/pages/admin/development/results.tsx#77"><p data-eos-id="src/pages/admin/development/results.tsx#78" data-eos-var="l.avgQuizScore" data-eos-var-label="Avg quiz score" data-eos-var-scope="item" className="text-sm font-bold text-sky-600 tabular-nums">{l.avgQuizScore ?? ''}%</p><p data-eos-id="src/pages/admin/development/results.tsx#79" className="text-[9px] text-neutral-500 font-medium">Quiz Avg</p></div></div>
                </div>
              ))}</div>
            )}
          </motion.section>
        </>
      )}
    </motion.div>
  )
}
