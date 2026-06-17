import { useState, useMemo, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
    MessageSquareText,
    User,
    Calendar,
    ChevronDown,
    ChevronUp,
    Star,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useLeaderHeader } from '@/components/leader-layout'
import { useLeaderCollectiveScope } from '@/hooks/use-leader-collective-scope'
import { Dropdown } from '@/components/dropdown'
import { Header } from '@/components/header'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { parseSurveyQuestions, type SurveyQuestion } from '@/components/survey-questions-utils'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface FeedbackRow {
  id: string
  survey_id: string | null
  event_id: string | null
  answers: Record<string, unknown>
  submitted_at: string | null
  respondent: string | null
  event_title: string | null
  event_date: string | null
  survey_title: string | null
  questions: SurveyQuestion[]
}

interface EventGroup {
  eventId: string
  title: string
  date: string | null
  responses: FeedbackRow[]
}

/**
 * All survey responses for events in the focused collective. RLS
 * (survey_responses_select_own_or_leader) scopes this to the collective's
 * leader / co_leader / assist_leader, and to managers/admins globally;
 * the events!inner join + collective_id filter narrows to the focused
 * collective so managers/admins see one collective at a time.
 */
function useCollectiveFeedback(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['leader-feedback', collectiveId],
    queryFn: async (): Promise<FeedbackRow[]> => {
      if (!collectiveId) return []
      const { data, error } = await supabase
        .from('survey_responses')
        .select(
          'id, survey_id, event_id, answers, submitted_at,' +
            ' profiles:user_id(display_name),' +
            ' surveys:survey_id(title, questions),' +
            ' events:event_id!inner(title, date_start, collective_id)',
        )
        .eq('events.collective_id', collectiveId)
        .order('submitted_at', { ascending: false })
      if (error) throw error
      // The embedded !inner join confuses the generated PostgREST row types
      // (same pattern as admin/reports.tsx survey export), so cast the joined
      // shape explicitly. The query itself is runtime-correct.
      const rows = (data ?? []) as unknown as Array<{
        id: string
        survey_id: string | null
        event_id: string | null
        answers: Record<string, unknown> | null
        submitted_at: string | null
        profiles: { display_name: string | null } | null
        surveys: { title: string | null; questions: unknown } | null
        events: { title: string | null; date_start: string | null } | null
      }>
      return rows.map((r) => ({
        id: r.id,
        survey_id: r.survey_id,
        event_id: r.event_id,
        answers: (r.answers ?? {}) as Record<string, unknown>,
        submitted_at: r.submitted_at,
        respondent: r.profiles?.display_name ?? null,
        event_title: r.events?.title ?? null,
        event_date: r.events?.date_start ?? null,
        survey_title: r.surveys?.title ?? null,
        questions: parseSurveyQuestions(r.surveys?.questions),
      }))
    },
    enabled: !!collectiveId,
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Answer helpers                                                     */
/* ------------------------------------------------------------------ */

function formatAnswer(value: unknown): string {
  if (value == null || value === '') return '-'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/** Pull a 0–n rating from a rating/scale question if the survey has one. */
function ratingFor(row: FeedbackRow): number | null {
  const q = row.questions.find((q) => q.type === 'rating' || q.type === 'scale')
  if (!q) return null
  const raw = row.answers[q.id]
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LeaderFeedbackPage() {
  const rm = useReducedMotion()
  const scopeCtx = useLeaderCollectiveScope()
  const collectiveId = scopeCtx.selectedCollectiveId

  useLeaderHeader('Feedback', { fullBleed: true })

  const { data: feedback, isLoading } = useCollectiveFeedback(collectiveId)
  const showLoading = useDelayedLoading(isLoading || scopeCtx.isLoading)

  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set())

  const collectiveScopeOptions = useMemo(
    () => scopeCtx.availableCollectives.map((c) => ({ value: c.id, label: c.name })),
    [scopeCtx.availableCollectives],
  )

  // Group responses by event, newest event first.
  const eventGroups = useMemo<EventGroup[]>(() => {
    const map = new Map<string, EventGroup>()
    for (const r of feedback ?? []) {
      const key = r.event_id ?? 'unknown'
      let g = map.get(key)
      if (!g) {
        g = { eventId: key, title: r.event_title ?? 'Event', date: r.event_date, responses: [] }
        map.set(key, g)
      }
      g.responses.push(r)
    }
    return [...map.values()].sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0
      const tb = b.date ? new Date(b.date).getTime() : 0
      return tb - ta
    })
  }, [feedback])

  const totalResponses = feedback?.length ?? 0

  const toggleEvent = useCallback((id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleResponse = useCallback((id: string) => {
    setExpandedResponses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const collectiveName = useMemo(() => {
    const c = scopeCtx.availableCollectives.find((c) => c.id === collectiveId)
    return c ? c.name.replace(/\s+Collective$/i, '') : null
  }, [scopeCtx.availableCollectives, collectiveId])

  if (showLoading) {
    return (
      <div className="relative min-h-dvh overflow-x-hidden bg-white">
        <Header title="Feedback" back transparent className="absolute left-0 right-0 z-30" />
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-14 space-y-4">
          <div className="flex flex-col items-center gap-2 pb-2">
            <div className="h-3 w-16 rounded-full bg-moss-200/40 animate-pulse" />
            <div className="h-8 w-44 rounded-lg bg-moss-200/30 animate-pulse" />
          </div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-white shadow-sm animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="absolute inset-0 bg-white" />
      <Header title="Feedback" back transparent className="absolute left-0 right-0 z-30" />

      <motion.div
        className="relative z-10 px-4 sm:px-6 lg:px-8 pt-14 space-y-5 pb-24"
        variants={rm ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* ── Hero title ── */}
        <motion.div
          variants={rm ? undefined : fadeUp}
          className="flex flex-col items-center justify-center text-center pb-1"
        >
          <p className="text-[11px] font-semibold text-moss-500 uppercase tracking-[0.2em]">
            Event Feedback
          </p>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold text-neutral-900 mt-1.5">
            {collectiveName ? `${collectiveName} Feedback` : 'Feedback'}
          </h1>
          <p className="text-sm text-neutral-500 mt-1.5 max-w-sm">
            Survey responses attendees have shared about your events.
          </p>
          {scopeCtx.showCollectiveSelector && collectiveScopeOptions.length > 1 && (
            <div className="mt-3">
              <Dropdown
                options={collectiveScopeOptions}
                value={collectiveId ?? ''}
                onChange={scopeCtx.setSelectedCollectiveId}
                className="w-52"
              />
            </div>
          )}
        </motion.div>

        {/* ── Stat pills ── */}
        <motion.div variants={rm ? undefined : fadeUp} className="flex justify-center gap-3">
          {[
            { value: totalResponses, label: 'Responses', color: 'text-moss-700' },
            { value: eventGroups.length, label: 'Events', color: 'text-neutral-900' },
          ].map((s) => (
            <div
              key={s.label}
              className="flex flex-col items-center rounded-2xl bg-white shadow-sm border border-neutral-100 px-6 py-3 min-w-[96px]"
            >
              <span className={cn('font-heading text-2xl font-extrabold tabular-nums', s.color)}>
                {s.value}
              </span>
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mt-0.5">
                {s.label}
              </span>
            </div>
          ))}
        </motion.div>

        {/* ── Empty state ── */}
        {eventGroups.length === 0 ? (
          <motion.div variants={rm ? undefined : fadeUp}>
            <EmptyState
              illustration="empty"
              title="No feedback yet"
              description="Survey responses from your events will appear here once attendees submit them."
            />
          </motion.div>
        ) : (
          /* ── Event groups ── */
          <motion.div variants={rm ? undefined : fadeUp} className="space-y-3">
            {eventGroups.map((group) => {
              const eventOpen = expandedEvents.has(group.eventId)
              return (
                <div
                  key={group.eventId}
                  className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden"
                >
                  {/* Event header */}
                  <button
                    type="button"
                    onClick={() => toggleEvent(group.eventId)}
                    className="w-full text-left p-4 cursor-pointer active:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-moss-100 shrink-0">
                        <MessageSquareText size={18} className="text-moss-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{group.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
                          {formatDate(group.date) && (
                            <>
                              <span className="flex items-center gap-1">
                                <Calendar size={11} />
                                {formatDate(group.date)}
                              </span>
                              <span className="text-neutral-200">·</span>
                            </>
                          )}
                          <span>
                            {group.responses.length} response{group.responses.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      {eventOpen ? (
                        <ChevronUp size={16} className="text-neutral-300 shrink-0" />
                      ) : (
                        <ChevronDown size={16} className="text-neutral-300 shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Responses */}
                  {eventOpen && (
                    <div className="px-3 pb-3 space-y-2 border-t border-neutral-100 pt-3">
                      {group.responses.map((response) => {
                        const responseOpen = expandedResponses.has(response.id)
                        const rating = ratingFor(response)
                        return (
                          <div
                            key={response.id}
                            className="rounded-xl bg-neutral-50/60 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => toggleResponse(response.id)}
                              className="w-full text-left p-3 cursor-pointer active:bg-neutral-100 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 shrink-0">
                                  <User size={14} className="text-primary-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-neutral-900 truncate">
                                    {response.respondent ?? 'Attendee'}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
                                    {rating != null && (
                                      <span className="flex items-center gap-0.5 text-amber-500">
                                        <Star size={11} fill="currentColor" />
                                        {rating}
                                      </span>
                                    )}
                                    {response.submitted_at && (
                                      <span>{formatDate(response.submitted_at)}</span>
                                    )}
                                  </div>
                                </div>
                                {responseOpen ? (
                                  <ChevronUp size={14} className="text-neutral-300 shrink-0" />
                                ) : (
                                  <ChevronDown size={14} className="text-neutral-300 shrink-0" />
                                )}
                              </div>
                            </button>

                            {responseOpen && (
                              <div className="px-3 pb-3 space-y-2.5 border-t border-neutral-100 pt-2.5">
                                {response.questions.length > 0 ? (
                                  response.questions.map((q) => (
                                    <div key={q.id}>
                                      <p className="text-xs font-medium text-neutral-500">{q.text}</p>
                                      <p className="text-sm text-neutral-900 mt-0.5 whitespace-pre-wrap">
                                        {formatAnswer(response.answers[q.id])}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  Object.entries(response.answers).map(([key, val]) => (
                                    <div key={key}>
                                      <p className="text-xs font-medium text-neutral-500">{key}</p>
                                      <p className="text-sm text-neutral-900 mt-0.5 whitespace-pre-wrap">
                                        {formatAnswer(val)}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
