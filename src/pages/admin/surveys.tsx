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
  { id: 'surveys', label: 'Surveys', icon: <ClipboardList size={14} /> },
  { id: 'templates', label: 'Templates', icon: <Copy size={14} /> },
  { id: 'results', label: 'Results', icon: <BarChart3 size={14} /> },
  { id: 'settings', label: 'Auto-Survey', icon: <Settings size={14} /> },
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
    <AdminHeroStatRow>
      <AdminHeroStat value={surveys?.length ?? 0} label="Surveys" icon={<ClipboardList size={18} />} color="moss" delay={0} reducedMotion={false} />
      <AdminHeroStat value={TEMPLATES.length} label="Templates" icon={<Copy size={18} />} color="plum" delay={1} reducedMotion={false} />
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
    <div>
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <motion.div variants={fadeUp}>
            <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4" />
          </motion.div>

      {/* Surveys list */}
      {activeTab === 'surveys' && (
        <motion.div variants={fadeUp}>
          <div className="flex justify-end mb-4">
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => navigate('/admin/surveys/create')}
              className="w-full sm:w-auto"
            >
              Create Survey
            </Button>
          </div>

          {showLoading ? (
            <Skeleton variant="list-item" count={4} />
          ) : !surveys?.length ? (
            <EmptyState
              illustration="empty"
              title="No surveys yet"
              description="Create a survey or start from a template"
              action={{ label: 'Create Survey', onClick: () => navigate('/admin/surveys/create') }}
            />
          ) : (
            <StaggeredList className="space-y-2">
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
                  <StaggeredItem
                    key={survey.id}
                    className="rounded-xl bg-white shadow-sm overflow-hidden"
                  >
                    {/* Tappable main area - navigates to edit */}
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/surveys/${survey.id}/edit`)}
                      className="w-full text-left p-4 pb-3 cursor-pointer active:bg-neutral-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-100 shrink-0">
                          <ClipboardList size={18} className="text-primary-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 leading-snug line-clamp-2 break-words">
                            {survey.title}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <span
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
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-moss-100 text-moss-700 truncate max-w-[180px]">
                                Impact · {ACTIVITY_TYPE_LABELS[survey.activity_type ?? ''] ?? survey.activity_type ?? 'Any'}
                              </span>
                            )}
                            {!survey.is_impact_form && survey.activity_type && (
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-info-100 text-info-700 truncate max-w-[180px]">
                                Feedback · {ACTIVITY_TYPE_LABELS[survey.activity_type] ?? survey.activity_type}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400">
                            <span>
                              {new Date(survey.created_at!).toLocaleDateString('en-AU', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            {questionCount > 0 && (
                              <>
                                <span className="text-neutral-200">·</span>
                                <span>{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Action bar - always visible, horizontal scroll on small screens */}
                    <div className="flex items-center gap-1 px-3 pb-3 -mt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSurvey(survey.id)
                          setActiveTab('results')
                        }}
                        className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-medium text-neutral-500 hover:bg-neutral-50 active:bg-neutral-100 transition-colors cursor-pointer select-none active:scale-[0.97] whitespace-nowrap"
                      >
                        <BarChart3 size={14} />
                        Results
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/surveys/${survey.id}/edit`)}
                        className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-medium text-neutral-500 hover:bg-neutral-50 active:bg-neutral-100 transition-colors cursor-pointer select-none active:scale-[0.97] whitespace-nowrap"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(survey.id)}
                        className="flex items-center justify-center min-h-11 min-w-11 rounded-lg text-neutral-300 hover:bg-error-50 hover:text-error-600 active:bg-error-100 transition-colors cursor-pointer select-none active:scale-[0.93]"
                        aria-label="Delete survey"
                      >
                        <Trash2 size={15} />
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
        <StaggeredList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATES.map((template, index) => (
            <StaggeredItem
              key={template.name}
              className="rounded-xl bg-white shadow-sm overflow-hidden"
            >
              <button
                type="button"
                onClick={() => navigate(`/admin/surveys/create?template=${index}`)}
                className="w-full text-left p-4 cursor-pointer active:bg-neutral-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-plum-50 shrink-0">
                    <Copy size={16} className="text-plum-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading text-sm font-semibold text-neutral-900">
                      {template.name}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">{template.description}</p>
                    <p className="text-xs text-neutral-400 mt-1.5">
                      {template.questionCount} questions
                    </p>
                  </div>
                </div>
              </button>
              <div className="px-4 pb-3">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => navigate(`/admin/surveys/create?template=${index}`)}
                  icon={<Copy size={14} />}
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
        <motion.div variants={fadeUp} className="space-y-4">
          {/* Survey selector */}
          <Dropdown
            options={surveyOptions}
            value={selectedSurvey ?? undefined}
            onChange={(v) => setSelectedSurvey(v)}
            placeholder="Select a survey to view results"
          />

          {!selectedSurvey ? (
            <EmptyState
              illustration="search"
              title="Select a survey"
              description="Choose a survey above to view its responses"
            />
          ) : (
            <div className="space-y-3">
              {/* Header row */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-600">
                  {results?.length ?? 0} response{(results?.length ?? 0) !== 1 ? 's' : ''}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download size={14} />}
                  onClick={exportResultsCSV}
                  disabled={!results?.length}
                  className="w-full sm:w-auto"
                >
                  Export CSV
                </Button>
              </div>

              {!results?.length ? (
                <EmptyState
                  illustration="empty"
                  title="No responses yet"
                  description="Responses will appear here once attendees or leaders submit the survey"
                />
              ) : (
                <StaggeredList className="space-y-2">
                  {results.map((response) => {
                    const isExpanded = expandedResponses.has(response.id)
                    return (
                      <StaggeredItem
                        key={response.id}
                        className="rounded-xl bg-white shadow-sm overflow-hidden"
                      >
                        {/* Response header - tappable to expand */}
                        <button
                          type="button"
                          onClick={() => toggleResponseExpanded(response.id)}
                          className="w-full text-left p-4 cursor-pointer active:bg-neutral-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 shrink-0">
                              <User size={16} className="text-primary-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-neutral-900 truncate">
                                {response.user_name ?? 'Unknown User'}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
                                {response.event_title && (
                                  <>
                                    <span className="truncate max-w-[180px]">{response.event_title}</span>
                                    <span className="text-neutral-200">·</span>
                                  </>
                                )}
                                {response.submitted_at && (
                                  <span className="flex items-center gap-1 shrink-0">
                                    <Calendar size={11} />
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
                              ? <ChevronUp size={16} className="text-neutral-300 shrink-0" />
                              : <ChevronDown size={16} className="text-neutral-300 shrink-0" />
                            }
                          </div>
                        </button>

                        {/* Expanded answers */}
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3 border-t border-neutral-100">
                            {surveyQuestions.length > 0 ? (
                              surveyQuestions.map((q) => {
                                const answer = response.answers[q.id]
                                const display = answer == null
                                  ? '-'
                                  : Array.isArray(answer)
                                    ? answer.join(', ')
                                    : String(answer)
                                return (
                                  <div key={q.id} className="pt-3">
                                    <p className="text-xs font-medium text-neutral-500">{q.text}</p>
                                    <p className="text-sm text-neutral-900 mt-0.5">{display}</p>
                                  </div>
                                )
                              })
                            ) : (
                              // Fallback: render raw answers if questions aren't available
                              Object.entries(response.answers).map(([key, val]) => (
                                <div key={key} className="pt-3">
                                  <p className="text-xs font-medium text-neutral-500">{key}</p>
                                  <p className="text-sm text-neutral-900 mt-0.5">
                                    {val == null ? '-' : String(val)}
                                  </p>
                                </div>
                              ))
                            )}

                            {/* Edit / Delete actions */}
                            <div className="flex items-center gap-1 pt-2">
                              <button
                                type="button"
                                onClick={() => openEditSheet(response)}
                                className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-medium text-neutral-500 hover:bg-neutral-50 active:bg-neutral-100 transition-colors cursor-pointer select-none active:scale-[0.97]"
                              >
                                <Pencil size={14} />
                                Edit
                              </button>
                              <div className="flex-1" />
                              <button
                                type="button"
                                onClick={() => setDeleteResponseTarget(response.id)}
                                className="flex items-center justify-center min-h-11 min-w-11 rounded-lg text-neutral-300 hover:bg-error-50 hover:text-error-600 active:bg-error-100 transition-colors cursor-pointer select-none active:scale-[0.93]"
                                aria-label="Delete response"
                              >
                                <Trash2 size={15} />
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
          <BottomSheet
            open={!!editingResponse}
            onClose={() => setEditingResponse(null)}
          >
            <div className="p-5 space-y-4">
              <div>
                <h3 className="font-heading text-base font-bold text-neutral-900">
                  Edit Response
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {editingResponse?.user_name ?? 'Unknown User'}
                  {editingResponse?.event_title ? ` · ${editingResponse.event_title}` : ''}
                </p>
              </div>

              {surveyQuestions.length > 0 && (
                <div className="rounded-xl bg-neutral-50 p-4">
                  <SurveyQuestionRenderer
                    questions={surveyQuestions}
                    answers={editAnswers}
                    setAnswer={setEditAnswer}
                    numbered={false}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={() => setEditingResponse(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  icon={<Save size={16} />}
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
          <ConfirmationSheet
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
        <motion.div variants={fadeUp} className="space-y-4">
          <div className="p-5 rounded-xl bg-white shadow-sm space-y-5">
            <div>
              <h3 className="font-heading text-sm font-semibold text-neutral-900 mb-1">
                Automated Post-Event Surveys
              </h3>
              <p className="text-xs text-neutral-400">
                Automatically prompt attendees to complete a feedback survey after events conclude.
              </p>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">Enable auto-surveys</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Send survey notifications to checked-in attendees when impact is logged
                </p>
              </div>
              <Toggle
                checked={autoConfig.enabled}
                onChange={(enabled) =>
                  updateAutoConfig.mutate({ ...autoConfig, enabled })
                }
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">Use default questions</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Use activity-type-specific template questions for each event
                </p>
              </div>
              <Toggle
                checked={autoConfig.default_questions_enabled}
                onChange={(default_questions_enabled) =>
                  updateAutoConfig.mutate({ ...autoConfig, default_questions_enabled })
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-900">
                Notification delay (hours)
              </label>
              <p className="text-xs text-neutral-400">
                How many hours after event completion to send the survey notification. The survey itself stays available for 7 days.
              </p>
              <Input
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

          <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
            <p className="text-xs text-neutral-500">
              When an event leader logs impact data, checked-in attendees will receive an in-app notification
              linking to the post-event survey. A banner also appears on their home screen for up to 7 days.
            </p>
          </div>

          {/* Leader Impact Forms settings */}
          {impactFormConfig && (
            <div className="p-5 rounded-xl bg-white shadow-sm space-y-5">
              <div>
                <h3 className="font-heading text-sm font-semibold text-neutral-900 mb-1">
                  Leader Impact Forms
                </h3>
                <p className="text-xs text-neutral-400">
                  Automatically assign impact logging tasks to collective leaders after events complete.
                  Leaders receive a shared task - any leader, co-leader, or assist-leader can fill it out.
                </p>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Enable impact form tasks</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Create a shared task for collective leaders when events are completed
                  </p>
                </div>
                <Toggle
                  checked={impactFormConfig.enabled}
                  onChange={(enabled) =>
                    updateImpactFormConfig.mutate({ ...impactFormConfig, enabled })
                  }
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Auto-create tasks</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Automatically generate impact form tasks when events are marked completed
                  </p>
                </div>
                <Toggle
                  checked={impactFormConfig.auto_task_enabled}
                  onChange={(auto_task_enabled) =>
                    updateImpactFormConfig.mutate({ ...impactFormConfig, auto_task_enabled })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-900">
                  Task deadline (hours)
                </label>
                <p className="text-xs text-neutral-400">
                  How many hours after event completion leaders have to submit the impact form
                </p>
                <Input
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

          <div className="p-4 rounded-xl bg-moss-50 border border-moss-100">
            <p className="text-xs text-moss-700">
              <strong>Impact forms vs attendee surveys:</strong> Impact forms are sent to collective <em>leaders</em> as shared tasks.
              Attendee surveys are sent to <em>all checked-in attendees</em>. You can have both active for the same activity type -
              leaders log impact data, attendees give feedback.
            </p>
          </div>
        </motion.div>
      )}

      <ConfirmationSheet
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
