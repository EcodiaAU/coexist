import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    ClipboardCheck,
    ClipboardList,
    Mail,
    Megaphone,
    Plus,
    Send, Zap,
    BarChart3,
    Copy,
    Users,
    ArrowRight,
    BookOpen,
    GraduationCap,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Skeleton } from '@/components/skeleton'
import { cn } from '@/lib/cn'
import { useAdminTaskTemplates } from '@/hooks/use-admin-tasks'
import { useCreateSummary } from '@/hooks/use-admin-create'

/* ------------------------------------------------------------------ */
/*  Quick action card                                                  */
/* ------------------------------------------------------------------ */

function QuickAction({
  icon,
  label,
  description,
  to,
  bg,
  cardBg,
  reducedMotion,
  delay = 0,
}: {
  icon: React.ReactNode
  label: string
  description: string
  to: string
  bg: string
  cardBg: string
  reducedMotion: boolean
  delay?: number
}) {
  return (
    <Link to={to} className="block">
      <motion.div
        initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: reducedMotion ? 0 : 0.15 + delay * 0.06 }}
        className={cn(
          'group relative flex flex-col items-center gap-2 p-4 rounded-sm text-center',
          cardBg,
          'shadow-sm border border-neutral-100',
          'hover:shadow-md active:scale-[0.97] transition-transform duration-150',
        )}
      >
        <div className={cn(
          'flex items-center justify-center w-11 h-11 rounded-sm shrink-0 transition-transform group-hover:scale-105',
          bg,
        )}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900 leading-tight">{label}</p>
          <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{description}</p>
        </div>
      </motion.div>
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/*  Section card                                                       */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon,
  title,
  description,
  to,
  stats,
  actions,
  accentColor,
  cardBg,
  actionBg,
  reducedMotion,
  delay = 0,
}: {
  icon: React.ReactNode
  title: string
  description: string
  to: string
  stats?: { label: string; value: number | string }[]
  actions?: { label: string; icon: React.ReactNode; to: string }[]
  accentColor: string
  cardBg: string
  actionBg: string
  reducedMotion: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: reducedMotion ? 0 : 0.2 + delay * 0.1 }}
      className={cn('rounded-md shadow-sm border border-neutral-100 overflow-hidden flex flex-col', cardBg)}
    >
      {/* Header */}
      <Link
        to={to}
        className="flex items-center gap-3.5 p-5 transition-[colors,transform] duration-150 active:scale-[0.99] group"
      >
        <div className={cn(
          'flex items-center justify-center w-11 h-11 rounded-sm shrink-0',
          accentColor,
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-base font-bold text-neutral-900 group-hover:text-neutral-600 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
        </div>
        <ArrowRight size={18} className="text-neutral-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </Link>

      {/* Stats row */}
      {stats && stats.length > 0 && (
        <div className="flex divide-x divide-neutral-100 border-t border-neutral-100">
          {stats.map((stat) => (
            <div key={stat.label} className="flex-1 py-3 px-4 text-center">
              <p className="text-lg font-bold text-neutral-900 tabular-nums">{stat.value}</p>
              <p className="text-[11px] text-neutral-500 font-medium mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      {actions && actions.length > 0 && (
        <div className="border-t border-neutral-100 p-3 flex flex-wrap gap-2 mt-auto">
          {actions.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 min-h-11 rounded-sm text-sm font-semibold',
                actionBg,
                'transition-[colors,transform] duration-150 active:scale-[0.97]',
              )}
            >
              {action.icon}
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

function SectionHeading({
  children,
  icon,
  reducedMotion,
  delay = 0,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  reducedMotion: boolean
  delay?: number
}) {
  return (
    <motion.h2
      initial={reducedMotion ? {} : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay }}
      className="flex items-center gap-2 font-heading text-[13px] font-bold text-neutral-400 uppercase tracking-widest mb-3"
    >
      {icon}
      {children}
    </motion.h2>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminCreatePage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  useAdminHeader('Create')

  const { data: summary, isLoading: summaryLoading } = useCreateSummary()
  const { data: templates } = useAdminTaskTemplates()
  const activeTemplates = useMemo(() => templates?.filter((t) => t.is_active)?.length ?? 0, [templates])
  const totalTemplates = templates?.length ?? 0

  return (
    <div className="space-y-8">
      {/* ── Quick Actions ── */}
      <div>
        <SectionHeading icon={<Zap size={14} className="text-neutral-400" />} reducedMotion={rm}>
          Quick Actions
        </SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <QuickAction
            icon={<Megaphone size={18} className="text-secondary-600" />}
            label="New Update"
            description="Post to all members"
            to="/admin/updates"
            bg="bg-secondary-50"
            cardBg="bg-white"
            reducedMotion={rm}
            delay={0}
          />
          <QuickAction
            icon={<Plus size={18} className="text-primary-600" />}
            label="New Task"
            description="Assign a task to leaders"
            to="/admin/tasks"
            bg="bg-primary-50"
            cardBg="bg-white"
            reducedMotion={rm}
            delay={1}
          />
          <QuickAction
            icon={<ClipboardList size={18} className="text-moss-600" />}
            label="New Survey"
            description="Build from scratch"
            to="/admin/surveys/create"
            bg="bg-moss-50"
            cardBg="bg-white"
            reducedMotion={rm}
            delay={2}
          />
          <QuickAction
            icon={<Send size={18} className="text-sky-600" />}
            label="New Campaign"
            description="Draft an email"
            to="/admin/email"
            bg="bg-sky-50"
            cardBg="bg-white"
            reducedMotion={rm}
            delay={3}
          />
          <QuickAction
            icon={<BookOpen size={18} className="text-bark-600" />}
            label="New Module"
            description="Build a learning module"
            to="/admin/development/modules/new"
            bg="bg-bark-50"
            cardBg="bg-white"
            reducedMotion={rm}
            delay={4}
          />
          <QuickAction
            icon={<Copy size={18} className="text-bark-600" />}
            label="From Template"
            description="Survey from template"
            to="/admin/surveys/create?template=0"
            bg="bg-bark-50"
            cardBg="bg-white"
            reducedMotion={rm}
            delay={5}
          />
        </div>
      </div>

      {/* ── Section Cards - 3-up on desktop, stacked on mobile ── */}
      <div>
        <SectionHeading reducedMotion={rm} delay={0.1}>
          Manage
        </SectionHeading>

        {summaryLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            <Skeleton className="h-52 rounded-md" />
            <Skeleton className="h-52 rounded-md" />
            <Skeleton className="h-52 rounded-md" />
            <Skeleton className="h-52 rounded-md" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            <SectionCard
              icon={<ClipboardCheck size={20} className="text-primary-600" />}
              title="Tasks"
              description="Assign tasks to collective leaders with deadlines and KPI tracking"
              to="/admin/tasks"
              accentColor="bg-primary-50"
              cardBg="bg-white"
              actionBg="bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              stats={[
                { label: 'Templates', value: totalTemplates },
                { label: 'Active', value: activeTemplates },
              ]}
              actions={[
                { label: 'View All', icon: <ClipboardCheck size={12} />, to: '/admin/tasks' },
                { label: 'KPIs', icon: <BarChart3 size={12} />, to: '/admin/tasks' },
              ]}
              reducedMotion={rm}
              delay={0}
            />
            <SectionCard
              icon={<ClipboardList size={20} className="text-moss-600" />}
              title="Surveys"
              description="Collect feedback from members and post-event satisfaction"
              to="/admin/surveys"
              accentColor="bg-moss-50"
              cardBg="bg-white"
              actionBg="bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              stats={[
                { label: 'Surveys', value: summary?.totalSurveys ?? 0 },
                { label: 'Templates', value: 3 },
              ]}
              actions={[
                { label: 'Create', icon: <Plus size={12} />, to: '/admin/surveys/create' },
                { label: 'Results', icon: <BarChart3 size={12} />, to: '/admin/surveys' },
              ]}
              reducedMotion={rm}
              delay={1}
            />
            <SectionCard
              icon={<Mail size={20} className="text-sky-600" />}
              title="Email"
              description="Campaigns, subscribers, and delivery health"
              to="/admin/email"
              accentColor="bg-sky-50"
              cardBg="bg-white"
              actionBg="bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              stats={[
                { label: 'Subscribers', value: summary?.subscribers ?? 0 },
                { label: 'Sent', value: summary?.campaignsSent ?? 0 },
                { label: 'Drafts', value: summary?.draftCampaigns ?? 0 },
              ]}
              actions={[
                { label: 'New Campaign', icon: <Send size={12} />, to: '/admin/email' },
                { label: 'Subscribers', icon: <Users size={12} />, to: '/admin/email' },
              ]}
              reducedMotion={rm}
              delay={2}
            />
            <SectionCard
              icon={<GraduationCap size={20} className="text-bark-600" />}
              title="Development"
              description="Learning modules, leadership development, and onboarding pathways"
              to="/admin/development"
              accentColor="bg-bark-50"
              cardBg="bg-white"
              actionBg="bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              stats={[
                { label: 'Modules', value: summary?.totalModules ?? 0 },
                { label: 'Published', value: summary?.publishedModules ?? 0 },
                { label: 'Sections', value: summary?.totalSections ?? 0 },
              ]}
              actions={[
                { label: 'New Module', icon: <BookOpen size={12} />, to: '/admin/development/modules/new' },
                { label: 'Results', icon: <BarChart3 size={12} />, to: '/admin/development/results' },
              ]}
              reducedMotion={rm}
              delay={3}
            />
          </div>
        )}
      </div>
    </div>
  )
}
