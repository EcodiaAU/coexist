import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { parseSurveyQuestions, type SurveyQuestion } from '@/components/survey-questions-utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EventSurveyData {
  surveyId: string
  title: string
  questions: SurveyQuestion[]
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Load the admin-created survey for a given event.
 *
 * @param mode - `'leader'` (default): impact form → auto-send fallback.
 *               `'attendee'`: auto-send only, skips impact forms.
 *
 * Priority for leader mode:
 *  1. Survey directly linked to this event (surveys.event_id)
 *  2. Impact form survey matching the event's activity type
 *  3. Auto-send survey matching the event's activity type
 *
 * Priority for attendee mode:
 *  1. Survey directly linked to this event (surveys.event_id)
 *  2. Auto-send survey matching the event's activity type
 *
 * This distinction is critical — impact forms are for leaders to log
 * conservation outcomes, NOT for attendee feedback. Attendees should
 * only see auto_send_after_event surveys.
 */
export function useEventSurvey(
  eventId: string | undefined,
  activityType: string | undefined,
  mode: 'leader' | 'attendee' = 'leader',
) {
  return useQuery({
    queryKey: ['event-survey', eventId, activityType, mode],
    queryFn: async (): Promise<EventSurveyData | null> => {
      if (!eventId) return null

      // 1. Direct event-linked survey
      const { data: direct } = await supabase
        .from('surveys')
        .select('id, title, questions')
        .eq('event_id', eventId)
        .eq('status', 'active')
        .maybeSingle()

      // 2. Impact form survey for this activity type (leader-only)
      const impactForm =
        direct ?? (mode === 'leader' && activityType
          ? (
              await supabase
                .from('surveys')
                .select('id, title, questions')
                .eq('activity_type', activityType)
                .eq('is_impact_form', true)
                .eq('status', 'active')
                .maybeSingle()
            ).data
          : null)

      // 3. Fallback: auto-send survey for this activity type (attendee-facing only).
      //    Leaders should NOT see attendee feedback surveys on the impact form page —
      //    those questions are irrelevant and have no impact_metric tags.
      const survey =
        (direct ?? impactForm) ??
        (mode !== 'leader' && activityType
          ? (
              await supabase
                .from('surveys')
                .select('id, title, questions')
                .eq('activity_type', activityType)
                .eq('auto_send_after_event', true)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            ).data
          : null)

      if (!survey) return null

      return {
        surveyId: survey.id,
        title: survey.title,
        questions: parseSurveyQuestions(survey.questions),
      }
    },
    enabled: !!eventId,
    staleTime: 10 * 60 * 1000,
  })
}
