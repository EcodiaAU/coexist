import { useEffect, useRef } from 'react'
import { saveSurveyDraft } from '@/lib/offline-sync'

interface UseSurveyDraftArgs {
  surveyId?: string | null
  eventId?: string | null
  userId?: string | null
  answers: Record<string, unknown>
  /** Optional extra leader impact-form fields (e.g. notes). */
  extra?: Record<string, unknown>
  /** Stop persisting once the form is submitted (draft is cleared on submit). */
  enabled?: boolean
}

/**
 * Persists an in-progress survey / impact-form to localStorage so a mid-fill
 * app-switch (the user leaving to upload photos to OneDrive/Drive, which
 * cold-starts the Capacitor WebView) does not wipe their answers on return.
 *
 * Two write triggers, because the real loss event is the WebView being
 * reclaimed, which fires neither `beforeunload` nor an in-SPA navigation:
 *   1. a short debounce after every answer change, and
 *   2. an immediate flush on `visibilitychange`->hidden / `pagehide`
 *      (the proven signal this app already uses to persist its query cache).
 *
 * Origin: Winnie, Co-Exist national meeting 2026-07-27.
 */
export function useSurveyDraft({
  surveyId,
  eventId,
  userId,
  answers,
  extra,
  enabled = true,
}: UseSurveyDraftArgs) {
  const latest = useRef({ answers, extra })
  // Keep the ref current for the background-flush handler (updating a ref during
  // render is disallowed; do it after commit).
  useEffect(() => {
    latest.current = { answers, extra }
  })

  const ready = enabled && !!surveyId && !!eventId && !!userId

  // Debounced save on every answer/extra change.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      saveSurveyDraft(surveyId as string, eventId as string, userId as string, answers, extra)
    }, 600)
    return () => clearTimeout(t)
  }, [ready, surveyId, eventId, userId, answers, extra])

  // Immediate flush when the app is backgrounded or the tab is hidden.
  useEffect(() => {
    if (!ready) return
    const flush = () =>
      saveSurveyDraft(
        surveyId as string,
        eventId as string,
        userId as string,
        latest.current.answers,
        latest.current.extra,
      )
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [ready, surveyId, eventId, userId])
}
