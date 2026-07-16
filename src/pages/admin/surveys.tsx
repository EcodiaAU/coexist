import { useState, useMemo, useCallback } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
    ClipboardList,
    Plus,
    Trash2,
    BarChart3,
    Download,
    Copy,
    Pencil,
    User,
    Calendar,
    ChevronDown,
    ChevronUp,
    Save,
    Settings,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { TabBar } from '@/components/tab-bar'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { BottomSheet } from '@/components/bottom-sheet'
import { SurveyQuestionRenderer } from '@/components/survey-questions'
import type { SurveyQuestion } from '@/components/survey-questions'
import { Dropdown } from '@/components/dropdown'
import { useToast } from '@/components/toast'
import { Toggle } from '@/components/toggle'
import { Input } from '@/components/input'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import {
    useAutoSurveyConfig,
    useUpdateAutoSurveyConfig,
    useImpactFormConfig,
    useUpdateImpactFormConfig,
} from '@/hooks/use-auto-survey'
import { ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import type { Json } from '@/types/database.types'

/* ------------------------------------------------------------------ */
/*  Templates (shared with create page via index param)                */
/* ------------------------------------------------------------------ */

const TEMPLATES = [
  {
    name: 'Post-Event Satisfaction',
    description: 'Gather feedback after each event',
    questionCount: 4,
  },
  {
    name: 'New Member Welcome',
    description: 'Welcome survey for new members',
    questionCount: 4,
  },
  {
    name: 'Annual Feedback',
    description: 'Yearly membership feedback survey',
    questionCount: 5,
  },
]

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

function useSurveys() {
  return useQuery({
    queryKey: ['admin-surveys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}

interface SurveyResultRow {
  id: string
  survey_id: string
  event_id: string | null
  user_id: string
  answers: Record<string, unknown>
  submitted_at: string | null
  user_name: string | null
  event_title: string | null
}

function useSurveyResults(surveyId: string | null) {
  return useQuery({
    queryKey: ['admin-survey-results', surveyId],
    queryFn: async () => {
      if (!surveyId) return []
      const { data, error } = await supabase
        .from('survey_responses')
        .select('*, profiles:user_id(display_name), events:event_id(title)')
        .eq('survey_id', surveyId)
        .order('submitted_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id,
        survey_id: r.survey_id,
        event_id: r.event_id,
        user_id: r.user_id,
        answers: (r.answers ?? {}) as Record<string, unknown>,
        submitted_at: r.submitted_at,
        user_name: (r.profiles as unknown as { display_name: string } | null)?.display_name ?? null,
        event_title: (r.events as unknown as { title: string } | null)?.title ?? null,
      })) as SurveyResultRow[]
    },
    enabled: !!surveyId,
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const tabs = [
  { id: 'surveys', label: 'Surveys', icon: <ClipboardList data-eos-id="src/pages/admin/surveys.tsx#0" size={14} /> },
  { id: 'templates', label: 'Templates', icon: <Copy data-eos-id="src/pages/admin/surveys.tsx#1" size={14} /> },
  { id: 'results', label: 'Results', icon: <BarChart3 data-eos-id="src/pages/admin/surveys.tsx#2" size={14} /> },
  { id: 'settings', label: 'Auto-Survey', icon: <Settings data-eos-id="src/pages/admin/surveys.tsx#3" size={14} /> },
]

export default function AdminSurveysPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('surveys')
  const [selectedSurvey, setSelectedSurvey] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteResponseTarget, setDeleteResponseTarget] = useState<string | null>(null)
  const [editingResponse, setEditingResponse] = useState<SurveyResultRow | null>(null)
  const [editAnswers, setEditAnswers] = useState<Record<string, unknown>>({})
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set())

  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: surveys, isLoading } = useSurveys()
  const showLoading = useDelayedLoading(isLoading)
  const { data: results } = useSurveyResults(selectedSurvey)
  const { data: autoConfig } = useAutoSurveyConfig()
  const updateAutoConfig = useUpdateAutoSurveyConfig()
  const { data: impactFormConfig } = useImpactFormConfig()
  const updateImpactFormConfig = useUpdateImpactFormConfig()

  // Get questions for the selected survey
  const selectedSurveyData = useMemo(() => {
    if (!selectedSurvey || !surveys) return null
    return surveys.find((s) => s.id === selectedSurvey) ?? null
  }, [selectedSurvey, surveys])

  const surveyQuestions = useMemo(() => {
    if (!selectedSurveyData) return [] as SurveyQuestion[]
    try {
      const raw = selectedSurveyData as unknown as Record<string, unknown>
      const q = typeof raw.questions === 'string'
        ? JSON.parse(raw.questions as string)
        : raw.questions
      return Array.isArray(q) ? (q as SurveyQuestion[]) : []
    } catch {
      return [] as SurveyQuestion[]
    }
  }, [selectedSurveyData])

  // Survey dropdown options for the Results tab
  const surveyOptions = useMemo(() =>
    (surveys ?? []).map((s) => ({ value: s.id, label: s.title })),
    [surveys],
  )

  const toggleResponseExpanded = useCallback((id: string) => {
    setExpandedResponses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const openEditSheet = useCallback((response: SurveyResultRow) => {
    setEditingResponse(response)
    setEditAnswers({ ...response.answers })
  }, [])

  const setEditAnswer = useCallback((id: string, value: unknown) => {
    setEditAnswers((prev) => ({ ...prev, [id]: value }))
  }, [])

  const heroStats = useMemo(() => (
    <AdminHeroStatRow data-eos-id="src/pages/admin/surveys.tsx#4">
      <AdminHeroStat data-eos-id="src/pages/admin/surveys.tsx#5" value={surveys?.length ?? 0} label="Surveys" icon={<ClipboardList data-eos-id="src/pages/admin/surveys.tsx#6" size={18} />} color="moss" delay={0} reducedMotion={false} />
      <AdminHeroStat data-eos-id="src/pages/admin/surveys.tsx#7" value={TEMPLATES.length} label="Templates" icon={<Copy data-eos-id="src/pages/admin/surveys.tsx#8" size={18} />} color="plum" delay={1} reducedMotion={false} />
    </AdminHeroStatRow>
  ), [surveys?.length])

  useAdminHeader('Surveys', { heroContent: heroStats })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await logAudit({ action: 'survey_deleted', target_type: 'survey', target_id: id })
      const { error } = await supabase.from('surveys').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-surveys'] })
      setDeleteTarget(null)
      toast.success('Survey deleted')
    },
    onError: () => toast.error('Failed to delete survey'),
  })

  const deleteResponseMutation = useMutation({
    mutationFn: async (id: string) => {
      await logAudit({ action: 'survey_response_deleted', target_type: 'survey_response', target_id: id })
      const { error } = await supabase.from('survey_responses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-survey-results', selectedSurvey] })
      setDeleteResponseTarget(null)
      toast.success('Response deleted')
    },
    onError: () => toast.error('Failed to delete response'),
  })

  const updateResponseMutation = useMutation({
    mutationFn: async ({ id, answers }: { id: string; answers: Record<string, unknown> }) => {
      await logAudit({ action: 'survey_response_updated', target_type: 'survey_response', target_id: id })
      const { error } = await supabase
        .from('survey_responses')
        .update({ answers: answers as unknown as Json })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-survey-results', selectedSurvey] })
      setEditingResponse(null)
      toast.success('Response updated')
    },
    onError: () => toast.error('Failed to update response'),
  })

  const exportResultsCSV = () => {
    if (!results?.length) return
    const qHeaders = surveyQuestions.map((q) => q.text)
    const headers = ['Response ID', 'User', 'Event', 'Submitted At', ...qHeaders]
    const rows = results.map((r) => [
      r.id,
      r.user_name ?? r.user_id,
      r.event_title ?? r.event_id ?? '',
      r.submitted_at ?? '',
      ...surveyQuestions.map((q) => {
        const val = r.answers[q.id]
        return val == null ? '' : String(val)
      }),
    ])
    const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = [headers.map(escapeCsv), ...rows.map((row) => row.map(escapeCsv))].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `survey-results-${selectedSurveyData?.title?.replace(/\s+/g, '-').toLowerCase() ?? 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shouldReduceMotion = useReducedMotion()

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <div data-eos-id="src/pages/admin/surveys.tsx#9">
        <motion.div data-eos-id="src/pages/admin/surveys.tsx#10" variants={stagger} initial="hidden" animate="visible">
          <motion.div data-eos-id="src/pages/admin/surveys.tsx#11" variants={fadeUp}>
            <TabBar data-eos-id="src/pages/admin/surveys.tsx#12" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4" />
          </motion.div>

      {/* Surveys list */}
      {activeTab === 'surveys' && (
        <motion.div data-eos-id="src/pages/admin/surveys.tsx#13" variants={fadeUp}>
          <div data-eos-id="src/pages/admin/surveys.tsx#14" className="flex justify-end mb-4">
            <Button data-eos-id="src/pages/admin/surveys.tsx#15"
              variant="primary"
              size="sm"
              icon={<Plus data-eos-id="src/pages/admin/surveys.tsx#16" size={16} />}
              onClick={() => navigate('/admin/surveys/create')}
              className="w-full sm:w-auto"
            >
              Create Survey
            </Button>
          </div>

          {showLoading ? (
            <Skeleton data-eos-id="src/pages/admin/surveys.tsx#17" variant="list-item" count={4} />
          ) : !surveys?.length ? (
            <EmptyState data-eos-id="src/pages/admin/surveys.tsx#18"
              illustration="empty"
              title="No surveys yet"
              description="Create a survey or start from a template"
              action={{ label: 'Create Survey', onClick: () => navigate('/admin/surveys/create') }}
            />
          ) : (
            <StaggeredList data-eos-id="src/pages/admin/surveys.tsx#19" className="space-y-2">
              {surveys.map((survey) => {
                const surveyRecord = survey as unknown as Record<string, unknown>
                const status = (surveyRecord.status as string) ?? (survey.is_active ? 'active' : 'inactive')
                const isActive = surveyRecord.status === 'active' || survey.is_active
                const questionCount = (() => {
                  try {
                    const q = typeof surveyRecord.questions === 'string'
                      ? JSON.parse(surveyRecord.questions as string)
                      : surveyRecord.questions
                    return Array.isArray(q) ? q.length : 0
                  } catch { return 0 }
                })()

                return (
                  <StaggeredItem data-eos-id="src/pages/admin/surveys.tsx#20"
                    key={survey.id}
                    className="rounded-sm bg-white shadow-sm overflow-hidden"
                  >
                    {/* Tappable main area - navigates to edit */}
                    <button data-eos-id="src/pages/admin/surveys.tsx#21"
                      type="button"
                      onClick={() => navigate(`/admin/surveys/${survey.id}/edit`)}
                      className="w-full text-left p-4 pb-3 cursor-pointer active:bg-neutral-50 transition-colors"
                    >
                      <div data-eos-id="src/pages/admin/surveys.tsx#22" className="flex items-start gap-3">
                        <div data-eos-id="src/pages/admin/surveys.tsx#23" className="flex items-center justify-center w-10 h-10 rounded-sm bg-primary-100 shrink-0">
                          <ClipboardList data-eos-id="src/pages/admin/surveys.tsx#24" size={18} className="text-primary-500" />
                        </div>
                        <div data-eos-id="src/pages/admin/surveys.tsx#25" className="flex-1 min-w-0">
                          <p data-eos-id="src/pages/admin/surveys.tsx#26" data-eos-var="survey.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 leading-snug line-clamp-2 break-words">
                            {survey.title}
                          </p>
                          <div data-eos-id="src/pages/admin/surveys.tsx#27" className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <span data-eos-id="src/pages/admin/surveys.tsx#28"
                              className={cn(
                                'text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                                isActive
                                  ? 'bg-success-100 text-success-700'
                                  : 'bg-neutral-100 text-neutral-400',
                              )}
                            >
                              {status}
                            </span>
                            {survey.is_impact_form && (
                              <span data-eos-id="src/pages/admin/surveys.tsx#29" data-eos-var="ACTIVITY_TYPE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-moss-100 text-moss-700 truncate max-w-[180px]">
                                Impact · {ACTIVITY_TYPE_LABELS[survey.activity_type ?? ''] ?? survey.activity_type ?? 'Any'}
                              </span>
                            )}
                            {!survey.is_impact_form && survey.activity_type && (
                              <span data-eos-id="src/pages/admin/surveys.tsx#30" data-eos-var="ACTIVITY_TYPE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-info-100 text-info-700 truncate max-w-[180px]">
                                Feedback · {ACTIVITY_TYPE_LABELS[survey.activity_type] ?? survey.activity_type}
                              </span>
                            )}
                          </div>
                          <div data-eos-id="src/pages/admin/surveys.tsx#31" className="flex items-center gap-2 mt-1 text-xs text-neutral-400">
                            <span data-eos-id="src/pages/admin/surveys.tsx#32" data-eos-var="survey.created_at" data-eos-var-label="Created at" data-eos-var-scope="item">
                              {new Date(survey.created_at!).toLocaleDateString('en-AU', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            {questionCount > 0 && (
                              <>
                                <span data-eos-id="src/pages/admin/surveys.tsx#33" className="text-neutral-200">·</span>
                                <span data-eos-id="src/pages/admin/surveys.tsx#34">{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Action bar - always visible, horizontal scroll on small screens */}
                    <div data-eos-id="src/pages/admin/surveys.tsx#35" className="flex items-center gap-1 px-3 pb-3 -mt-0.5">
                      <button data-eos-id="src/pages/admin/surveys.tsx#36"
                        type="button"
                        onClick={() => {
                          setSelectedSurvey(survey.id)
                          setActiveTab('results')
                        }}
                        className="flex items-center gap-1.5 min-h-11 px-3 rounded-sm text-xs font-medium text-neutral-500 hover:bg-neutral-50 active:bg-neutral-100 transition-colors cursor-pointer select-none active:scale-[0.97] whitespace-nowrap"
                      >
                        <BarChart3 data-eos-id="src/pages/admin/surveys.tsx#37" size={14} />
                        Results
                      </button>
                      <button data-eos-id="src/pages/admin/surveys.tsx#38"
                        type="button"
                        onClick={() => navigate(`/admin/surveys/${survey.id}/edit`)}
                        className="flex items-center gap-1.5 min-h-11 px-3 rounded-sm text-xs font-medium text-neutral-500 hover:bg-neutral-50 active:bg-neutral-100 transition-colors cursor-pointer select-none active:scale-[0.97] whitespace-nowrap"
                      >
                        <Pencil data-eos-id="src/pages/admin/surveys.tsx#39" size={14} />
                        Edit
                      </button>
                      <div data-eos-id="src/pages/admin/surveys.tsx#40" className="flex-1" />
                      <button data-eos-id="src/pages/admin/surveys.tsx#41"
                        type="button"
                        onClick={() => setDeleteTarget(survey.id)}
                        className="flex items-center justify-center min-h-11 min-w-11 rounded-sm text-neutral-300 hover:bg-error-50 hover:text-error-600 active:bg-error-100 transition-colors cursor-pointer select-none active:scale-[0.98]"
                        aria-label="Delete survey"
                      >
                        <Trash2 data-eos-id="src/pages/admin/surveys.tsx#42" size={15} />
                      </button>
                    </div>
                  </StaggeredItem>
                )
              })}
            </StaggeredList>
          )}
        </motion.div>
      )}

      {/* Templates */}
      {activeTab === 'templates' && (
        <StaggeredList data-eos-id="src/pages/admin/surveys.tsx#43" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATES.map((template, index) => (
            <StaggeredItem data-eos-id="src/pages/admin/surveys.tsx#44"
              key={template.name}
              className="rounded-sm bg-white shadow-sm overflow-hidden"
            >
              <button data-eos-id="src/pages/admin/surveys.tsx#45"
                type="button"
                onClick={() => navigate(`/admin/surveys/create?template=${index}`)}
                className="w-full text-left p-4 cursor-pointer active:bg-neutral-50 transition-colors"
              >
                <div data-eos-id="src/pages/admin/surveys.tsx#46" className="flex items-start gap-3">
                  <div data-eos-id="src/pages/admin/surveys.tsx#47" className="flex items-center justify-center w-10 h-10 rounded-sm bg-plum-50 shrink-0">
                    <Copy data-eos-id="src/pages/admin/surveys.tsx#48" size={16} className="text-plum-500" />
                  </div>
                  <div data-eos-id="src/pages/admin/surveys.tsx#49" className="flex-1 min-w-0">
                    <h3 data-eos-id="src/pages/admin/surveys.tsx#50" data-eos-var="template.name" data-eos-var-label="Name" data-eos-var-scope="item" data-eos-var-src="literal" className="font-heading text-sm font-semibold text-neutral-900">
                      {template.name}
                    </h3>
                    <p data-eos-id="src/pages/admin/surveys.tsx#51" data-eos-var="template.description" data-eos-var-label="Description" data-eos-var-scope="item" data-eos-var-src="literal" className="text-xs text-neutral-400 mt-0.5">{template.description}</p>
                    <p data-eos-id="src/pages/admin/surveys.tsx#52" data-eos-var="template.questionCount" data-eos-var-label="Question count" data-eos-var-scope="item" data-eos-var-src="literal" className="text-xs text-neutral-400 mt-1.5">
                      {template.questionCount} questions
                    </p>
                  </div>
                </div>
              </button>
              <div data-eos-id="src/pages/admin/surveys.tsx#53" className="px-4 pb-3">
                <Button data-eos-id="src/pages/admin/surveys.tsx#54"
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => navigate(`/admin/surveys/create?template=${index}`)}
                  icon={<Copy data-eos-id="src/pages/admin/surveys.tsx#55" size={14} />}
                >
                  Use Template
                </Button>
              </div>
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      {/* Results */}
      {activeTab === 'results' && (
        <motion.div data-eos-id="src/pages/admin/surveys.tsx#56" variants={fadeUp} className="space-y-4">
          {/* Survey selector */}
          <Dropdown data-eos-id="src/pages/admin/surveys.tsx#57"
            options={surveyOptions}
            value={selectedSurvey ?? undefined}
            onChange={(v) => setSelectedSurvey(v)}
            placeholder="Select a survey to view results"
          />

          {!selectedSurvey ? (
            <EmptyState data-eos-id="src/pages/admin/surveys.tsx#58"
              illustration="search"
              title="Select a survey"
              description="Choose a survey above to view its responses"
            />
          ) : (
            <div data-eos-id="src/pages/admin/surveys.tsx#59" className="space-y-3">
              {/* Header row */}
              <div data-eos-id="src/pages/admin/surveys.tsx#60" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <p data-eos-id="src/pages/admin/surveys.tsx#61" className="text-sm font-medium text-neutral-600">
                  {results?.length ?? 0} response{(results?.length ?? 0) !== 1 ? 's' : ''}
                </p>
                <Button data-eos-id="src/pages/admin/surveys.tsx#62"
                  variant="secondary"
                  size="sm"
                  icon={<Download data-eos-id="src/pages/admin/surveys.tsx#63" size={14} />}
                  onClick={exportResultsCSV}
                  disabled={!results?.length}
                  className="w-full sm:w-auto"
                >
                  Export CSV
                </Button>
              </div>

              {!results?.length ? (
                <EmptyState data-eos-id="src/pages/admin/surveys.tsx#64"
                  illustration="empty"
                  title="No responses yet"
                  description="Responses will appear here once attendees or leaders submit the survey"
                />
              ) : (
                <StaggeredList data-eos-id="src/pages/admin/surveys.tsx#65" className="space-y-2">
                  {results.map((response) => {
                    const isExpanded = expandedResponses.has(response.id)
                    return (
                      <StaggeredItem data-eos-id="src/pages/admin/surveys.tsx#66"
                        key={response.id}
                        className="rounded-sm bg-white shadow-sm overflow-hidden"
                      >
                        {/* Response header - tappable to expand */}
                        <button data-eos-id="src/pages/admin/surveys.tsx#67"
                          type="button"
                          onClick={() => toggleResponseExpanded(response.id)}
                          className="w-full text-left p-4 cursor-pointer active:bg-neutral-50 transition-colors"
                        >
                          <div data-eos-id="src/pages/admin/surveys.tsx#68" className="flex items-center gap-3">
                            <div data-eos-id="src/pages/admin/surveys.tsx#69" className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 shrink-0">
                              <User data-eos-id="src/pages/admin/surveys.tsx#70" size={16} className="text-primary-500" />
                            </div>
                            <div data-eos-id="src/pages/admin/surveys.tsx#71" className="flex-1 min-w-0">
                              <p data-eos-id="src/pages/admin/surveys.tsx#72" data-eos-var="response.user_name" data-eos-var-label="User name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">
                                {response.user_name ?? 'Unknown User'}
                              </p>
                              <div data-eos-id="src/pages/admin/surveys.tsx#73" className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
                                {response.event_title && (
                                  <>
                                    <span data-eos-id="src/pages/admin/surveys.tsx#74" data-eos-var="response.event_title" data-eos-var-label="Event title" data-eos-var-scope="item" className="truncate max-w-[180px]">{response.event_title}</span>
                                    <span data-eos-id="src/pages/admin/surveys.tsx#75" className="text-neutral-200">·</span>
                                  </>
                                )}
                                {response.submitted_at && (
                                  <span data-eos-id="src/pages/admin/surveys.tsx#76" data-eos-var="response.submitted_at" data-eos-var-label="Submitted at" data-eos-var-scope="item" className="flex items-center gap-1 shrink-0">
                                    <Calendar data-eos-id="src/pages/admin/surveys.tsx#77" size={11} />
                                    {new Date(response.submitted_at).toLocaleDateString('en-AU', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isExpanded
                              ? <ChevronUp data-eos-id="src/pages/admin/surveys.tsx#78" size={16} className="text-neutral-300 shrink-0" />
                              : <ChevronDown data-eos-id="src/pages/admin/surveys.tsx#79" size={16} className="text-neutral-300 shrink-0" />
                            }
                          </div>
                        </button>

                        {/* Expanded answers */}
                        {isExpanded && (
                          <div data-eos-id="src/pages/admin/surveys.tsx#80" className="px-4 pb-4 space-y-3 border-t border-neutral-100">
                            {surveyQuestions.length > 0 ? (
                              surveyQuestions.map((q) => {
                                const answer = response.answers[q.id]
                                const display = answer == null
                                  ? '-'
                                  : Array.isArray(answer)
                                    ? answer.join(', ')
                                    : String(answer)
                                return (
                                  <div data-eos-id="src/pages/admin/surveys.tsx#81" key={q.id} className="pt-3">
                                    <p data-eos-id="src/pages/admin/surveys.tsx#82" data-eos-var="q.text" data-eos-var-label="Text" data-eos-var-scope="item" className="text-xs font-medium text-neutral-500">{q.text}</p>
                                    <p data-eos-id="src/pages/admin/surveys.tsx#83" className="text-sm text-neutral-900 mt-0.5">{display}</p>
                                  </div>
                                )
                              })
                            ) : (
                              // Fallback: render raw answers if questions aren't available
                              Object.entries(response.answers).map(([key, val]) => (
                                <div data-eos-id="src/pages/admin/surveys.tsx#84" key={key} className="pt-3">
                                  <p data-eos-id="src/pages/admin/surveys.tsx#85" className="text-xs font-medium text-neutral-500">{key}</p>
                                  <p data-eos-id="src/pages/admin/surveys.tsx#86" className="text-sm text-neutral-900 mt-0.5">
                                    {val == null ? '-' : String(val)}
                                  </p>
                                </div>
                              ))
                            )}

                            {/* Edit / Delete actions */}
                            <div data-eos-id="src/pages/admin/surveys.tsx#87" className="flex items-center gap-1 pt-2">
                              <button data-eos-id="src/pages/admin/surveys.tsx#88"
                                type="button"
                                onClick={() => openEditSheet(response)}
                                className="flex items-center gap-1.5 min-h-11 px-3 rounded-sm text-xs font-medium text-neutral-500 hover:bg-neutral-50 active:bg-neutral-100 transition-colors cursor-pointer select-none active:scale-[0.97]"
                              >
                                <Pencil data-eos-id="src/pages/admin/surveys.tsx#89" size={14} />
                                Edit
                              </button>
                              <div data-eos-id="src/pages/admin/surveys.tsx#90" className="flex-1" />
                              <button data-eos-id="src/pages/admin/surveys.tsx#91"
                                type="button"
                                onClick={() => setDeleteResponseTarget(response.id)}
                                className="flex items-center justify-center min-h-11 min-w-11 rounded-sm text-neutral-300 hover:bg-error-50 hover:text-error-600 active:bg-error-100 transition-colors cursor-pointer select-none active:scale-[0.98]"
                                aria-label="Delete response"
                              >
                                <Trash2 data-eos-id="src/pages/admin/surveys.tsx#92" size={15} />
                              </button>
                            </div>
                          </div>
                        )}
                      </StaggeredItem>
                    )
                  })}
                </StaggeredList>
              )}
            </div>
          )}

          {/* Edit response bottom sheet */}
          <BottomSheet data-eos-id="src/pages/admin/surveys.tsx#93"
            open={!!editingResponse}
            onClose={() => setEditingResponse(null)}
          >
            <div data-eos-id="src/pages/admin/surveys.tsx#94" className="p-5 space-y-4">
              <div data-eos-id="src/pages/admin/surveys.tsx#95">
                <h3 data-eos-id="src/pages/admin/surveys.tsx#96" className="font-heading text-base font-bold text-neutral-900">
                  Edit Response
                </h3>
                <p data-eos-id="src/pages/admin/surveys.tsx#97" data-eos-var="editingResponse.user_name,editingResponse.event_title" data-eos-var-label="User name, Event title" data-eos-var-scope="prop" className="text-xs text-neutral-400 mt-0.5">
                  {editingResponse?.user_name ?? 'Unknown User'}
                  {editingResponse?.event_title ? ` · ${editingResponse.event_title}` : ''}
                </p>
              </div>

              {surveyQuestions.length > 0 && (
                <div data-eos-id="src/pages/admin/surveys.tsx#98" className="rounded-sm bg-neutral-50 p-4">
                  <SurveyQuestionRenderer data-eos-id="src/pages/admin/surveys.tsx#99"
                    questions={surveyQuestions}
                    answers={editAnswers}
                    setAnswer={setEditAnswer}
                    numbered={false}
                  />
                </div>
              )}

              <div data-eos-id="src/pages/admin/surveys.tsx#100" className="flex gap-2 pt-2">
                <Button data-eos-id="src/pages/admin/surveys.tsx#101"
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={() => setEditingResponse(null)}
                >
                  Cancel
                </Button>
                <Button data-eos-id="src/pages/admin/surveys.tsx#102"
                  variant="primary"
                  size="md"
                  fullWidth
                  icon={<Save data-eos-id="src/pages/admin/surveys.tsx#103" size={16} />}
                  loading={updateResponseMutation.isPending}
                  onClick={() => {
                    if (!editingResponse) return
                    updateResponseMutation.mutate({
                      id: editingResponse.id,
                      answers: editAnswers,
                    })
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </BottomSheet>

          {/* Delete response confirmation */}
          <ConfirmationSheet data-eos-id="src/pages/admin/surveys.tsx#104"
            open={!!deleteResponseTarget}
            onClose={() => setDeleteResponseTarget(null)}
            onConfirm={() => deleteResponseTarget && deleteResponseMutation.mutate(deleteResponseTarget)}
            title="Delete Response"
            description="This will permanently delete this survey response. This cannot be undone."
            confirmLabel="Delete"
            variant="danger"
          />
        </motion.div>
      )}

      {/* Auto-Survey Settings */}
      {activeTab === 'settings' && autoConfig && (
        <motion.div data-eos-id="src/pages/admin/surveys.tsx#105" variants={fadeUp} className="space-y-4">
          <div data-eos-id="src/pages/admin/surveys.tsx#106" className="p-5 rounded-sm bg-white shadow-sm space-y-5">
            <div data-eos-id="src/pages/admin/surveys.tsx#107">
              <h3 data-eos-id="src/pages/admin/surveys.tsx#108" className="font-heading text-sm font-semibold text-neutral-900 mb-1">
                Automated Post-Event Surveys
              </h3>
              <p data-eos-id="src/pages/admin/surveys.tsx#109" className="text-xs text-neutral-400">
                Automatically prompt attendees to complete a feedback survey after events conclude.
              </p>
            </div>

            <div data-eos-id="src/pages/admin/surveys.tsx#110" className="flex items-center justify-between py-2">
              <div data-eos-id="src/pages/admin/surveys.tsx#111">
                <p data-eos-id="src/pages/admin/surveys.tsx#112" className="text-sm font-medium text-neutral-900">Enable auto-surveys</p>
                <p data-eos-id="src/pages/admin/surveys.tsx#113" className="text-xs text-neutral-400 mt-0.5">
                  Send survey notifications to checked-in attendees when impact is logged
                </p>
              </div>
              <Toggle data-eos-id="src/pages/admin/surveys.tsx#114"
                checked={autoConfig.enabled}
                onChange={(enabled) =>
                  updateAutoConfig.mutate({ ...autoConfig, enabled })
                }
              />
            </div>

            <div data-eos-id="src/pages/admin/surveys.tsx#115" className="flex items-center justify-between py-2">
              <div data-eos-id="src/pages/admin/surveys.tsx#116">
                <p data-eos-id="src/pages/admin/surveys.tsx#117" className="text-sm font-medium text-neutral-900">Use default questions</p>
                <p data-eos-id="src/pages/admin/surveys.tsx#118" className="text-xs text-neutral-400 mt-0.5">
                  Use activity-type-specific template questions for each event
                </p>
              </div>
              <Toggle data-eos-id="src/pages/admin/surveys.tsx#119"
                checked={autoConfig.default_questions_enabled}
                onChange={(default_questions_enabled) =>
                  updateAutoConfig.mutate({ ...autoConfig, default_questions_enabled })
                }
              />
            </div>

            <div data-eos-id="src/pages/admin/surveys.tsx#120" className="space-y-1.5">
              <label data-eos-id="src/pages/admin/surveys.tsx#121" className="text-sm font-medium text-neutral-900">
                Notification delay (hours)
              </label>
              <p data-eos-id="src/pages/admin/surveys.tsx#122" className="text-xs text-neutral-400">
                How many hours after event completion to send the survey notification. The survey itself stays available for 7 days.
              </p>
              <Input data-eos-id="src/pages/admin/surveys.tsx#123"
                type="number"
                min="1"
                max="168"
                value={String(autoConfig.delay_hours)}
                onChange={(e) =>
                  updateAutoConfig.mutate({
                    ...autoConfig,
                    delay_hours: Math.max(1, Math.min(168, Number(e.target.value) || 24)),
                  })
                }
                className="max-w-[120px]"
              />
            </div>
          </div>

          <div data-eos-id="src/pages/admin/surveys.tsx#124" className="p-4 rounded-sm bg-neutral-50 border border-neutral-100">
            <p data-eos-id="src/pages/admin/surveys.tsx#125" className="text-xs text-neutral-500">
              When an event leader logs impact data, checked-in attendees will receive an in-app notification
              linking to the post-event survey. A banner also appears on their home screen for up to 7 days.
            </p>
          </div>

          {/* Leader Impact Forms settings */}
          {impactFormConfig && (
            <div data-eos-id="src/pages/admin/surveys.tsx#126" className="p-5 rounded-sm bg-white shadow-sm space-y-5">
              <div data-eos-id="src/pages/admin/surveys.tsx#127">
                <h3 data-eos-id="src/pages/admin/surveys.tsx#128" className="font-heading text-sm font-semibold text-neutral-900 mb-1">
                  Leader Impact Forms
                </h3>
                <p data-eos-id="src/pages/admin/surveys.tsx#129" className="text-xs text-neutral-400">
                  Automatically assign impact logging tasks to collective leaders after events complete.
                  Leaders receive a shared task - any leader, co-leader, or assist-leader can fill it out.
                </p>
              </div>

              <div data-eos-id="src/pages/admin/surveys.tsx#130" className="flex items-center justify-between py-2">
                <div data-eos-id="src/pages/admin/surveys.tsx#131">
                  <p data-eos-id="src/pages/admin/surveys.tsx#132" className="text-sm font-medium text-neutral-900">Enable impact form tasks</p>
                  <p data-eos-id="src/pages/admin/surveys.tsx#133" className="text-xs text-neutral-400 mt-0.5">
                    Create a shared task for collective leaders when events are completed
                  </p>
                </div>
                <Toggle data-eos-id="src/pages/admin/surveys.tsx#134"
                  checked={impactFormConfig.enabled}
                  onChange={(enabled) =>
                    updateImpactFormConfig.mutate({ ...impactFormConfig, enabled })
                  }
                />
              </div>

              <div data-eos-id="src/pages/admin/surveys.tsx#135" className="flex items-center justify-between py-2">
                <div data-eos-id="src/pages/admin/surveys.tsx#136">
                  <p data-eos-id="src/pages/admin/surveys.tsx#137" className="text-sm font-medium text-neutral-900">Auto-create tasks</p>
                  <p data-eos-id="src/pages/admin/surveys.tsx#138" className="text-xs text-neutral-400 mt-0.5">
                    Automatically generate impact form tasks when events are marked completed
                  </p>
                </div>
                <Toggle data-eos-id="src/pages/admin/surveys.tsx#139"
                  checked={impactFormConfig.auto_task_enabled}
                  onChange={(auto_task_enabled) =>
                    updateImpactFormConfig.mutate({ ...impactFormConfig, auto_task_enabled })
                  }
                />
              </div>

              <div data-eos-id="src/pages/admin/surveys.tsx#140" className="space-y-1.5">
                <label data-eos-id="src/pages/admin/surveys.tsx#141" className="text-sm font-medium text-neutral-900">
                  Task deadline (hours)
                </label>
                <p data-eos-id="src/pages/admin/surveys.tsx#142" className="text-xs text-neutral-400">
                  How many hours after event completion leaders have to submit the impact form
                </p>
                <Input data-eos-id="src/pages/admin/surveys.tsx#143"
                  type="number"
                  min="1"
                  max="336"
                  value={String(impactFormConfig.deadline_hours)}
                  onChange={(e) =>
                    updateImpactFormConfig.mutate({
                      ...impactFormConfig,
                      deadline_hours: Math.max(1, Math.min(336, Number(e.target.value) || 48)),
                    })
                  }
                  className="max-w-[120px]"
                />
              </div>
            </div>
          )}

          <div data-eos-id="src/pages/admin/surveys.tsx#144" className="p-4 rounded-sm bg-moss-50 border border-moss-100">
            <p data-eos-id="src/pages/admin/surveys.tsx#145" className="text-xs text-moss-700">
              <strong data-eos-id="src/pages/admin/surveys.tsx#146">Impact forms vs attendee surveys:</strong> Impact forms are sent to collective <em data-eos-id="src/pages/admin/surveys.tsx#147">leaders</em> as shared tasks.
              Attendee surveys are sent to <em data-eos-id="src/pages/admin/surveys.tsx#148">all checked-in attendees</em>. You can have both active for the same activity type -
              leaders log impact data, attendees give feedback.
            </p>
          </div>
        </motion.div>
      )}

      <ConfirmationSheet data-eos-id="src/pages/admin/surveys.tsx#149"
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="Delete Survey"
        description="This will delete the survey and all its responses."
        confirmLabel="Delete"
        variant="danger"
      />
        </motion.div>
    </div>
  )
}
