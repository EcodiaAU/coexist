import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PendingSurvey {
  event_id: string
  event_title: string
  activity_type: string
  date_end: string
  collective_name: string | null
}

export interface AutoSurveyConfig {
  [key: string]: boolean | number
  enabled: boolean
  delay_hours: number
  default_questions_enabled: boolean
}

interface EventRow {
  id: string
  title: string
  activity_type: string
  date_end: string | null
  date_start: string
  status: string
  collective_id: string
  collectives: { name: string } | null
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fetch events the user attended (checked in) that have completed
 * but the user hasn't submitted a survey response yet.
 * Only shows events completed within the last 7 days.
 */
export function usePendingSurveys() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['pending-surveys', user?.id],
    queryFn: async () => {
      if (!user) return []

      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      // Get events user checked into that are completed
      const { data: checkedInEvents, error: regError } = await supabase
        .from('event_registrations')
        .select(`
          event_id,
          events(id, title, activity_type, date_end, date_start, status, collective_id,
            collectives(name)
          )
        `)
        .eq('user_id', user.id)
        .not('checked_in_at', 'is', null)

      if (regError) throw regError
      if (!checkedInEvents?.length) return []

      // Filter to completed events within the last 7 days
      const completedEvents = checkedInEvents
        .filter((r) => {
          const event = r.events as unknown as EventRow | null
          if (!event || event.status !== 'completed') return false
          const endDate = new Date(event.date_end ?? event.date_start)
          return endDate >= sevenDaysAgo
        })
        .map((r) => r.events as unknown as EventRow)

      if (!completedEvents.length) return []

      // Check which events the user has already responded to (unified survey_responses table)
      const eventIds = completedEvents.map((e) => e.id)
      const { data: existingResponses } = await supabase
        .from('survey_responses')
        .select('event_id')
        .eq('user_id', user.id)
        .not('event_id', 'is', null)
        .in('event_id', eventIds)

      const respondedIds = new Set((existingResponses ?? []).map((r) => r.event_id))

      // Only show pending for activity types that have an active auto-send survey
      const activityTypes = [...new Set(completedEvents.map((e) => e.activity_type))]
      const { data: autoSendSurveys } = await supabase
        .from('surveys')
        .select('activity_type')
        .in('activity_type', activityTypes)
        .eq('auto_send_after_event', true)
        .eq('status', 'active')
      const surveyedTypes = new Set((autoSendSurveys ?? []).map((s) => s.activity_type))

      return completedEvents
        .filter((e) => !respondedIds.has(e.id) && surveyedTypes.has(e.activity_type))
        .map((e) => ({
          event_id: e.id,
          event_title: e.title,
          activity_type: e.activity_type,
          date_end: e.date_end ?? e.date_start,
          collective_name: e.collectives?.name ?? null,
        })) as PendingSurvey[]
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Admin: fetch the auto-survey configuration from app_settings.
 */
export function useAutoSurveyConfig() {
  return useQuery({
    queryKey: ['auto-survey-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings')
        .select('value')
        .eq('key', 'auto_survey_config')
        .maybeSingle()

      if (error) throw error

      const defaults: AutoSurveyConfig = {
        enabled: true,
        delay_hours: 24,
        default_questions_enabled: true,
      }

      const row = data as { value?: Partial<AutoSurveyConfig> } | null
      if (!row?.value) return defaults
      return { ...defaults, ...row.value }
    },
    staleTime: 10 * 60 * 1000,
  })
}

/**
 * Admin: update the auto-survey configuration.
 */
export function useUpdateAutoSurveyConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (config: AutoSurveyConfig) => {
      const { error } = await supabase.from('app_settings')
        .upsert(
          { key: 'auto_survey_config', value: config },
          { onConflict: 'key' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-survey-config'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Impact Form Config                                                 */
/* ------------------------------------------------------------------ */

export interface ImpactFormConfig {
  [key: string]: boolean | number
  enabled: boolean
  auto_task_enabled: boolean
  deadline_hours: number
}

/**
 * Admin: fetch impact form configuration from app_settings.
 * Controls whether impact form tasks are auto-created for leaders
 * after events complete.
 */
export function useImpactFormConfig() {
  return useQuery({
    queryKey: ['impact-form-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings')
        .select('value')
        .eq('key', 'impact_form_config')
        .maybeSingle()

      if (error) throw error

      const defaults: ImpactFormConfig = {
        enabled: true,
        auto_task_enabled: true,
        deadline_hours: 48,
      }

      const row = data as { value?: Partial<ImpactFormConfig> } | null
      if (!row?.value) return defaults
      return { ...defaults, ...row.value }
    },
    staleTime: 10 * 60 * 1000,
  })
}

/**
 * Admin: update the impact form configuration.
 */
export function useUpdateImpactFormConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (config: ImpactFormConfig) => {
      const { error } = await supabase.from('app_settings')
        .upsert(
          { key: 'impact_form_config', value: config },
          { onConflict: 'key' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['impact-form-config'] })
    },
  })
}

/**
 * Send survey notification to all checked-in attendees of a completed event.
 * Called after impact is logged / event is marked completed.
 */
export function useTriggerSurveyNotifications() {
  return useMutation({
    mutationFn: async ({ eventId, eventTitle }: { eventId: string; eventTitle: string }) => {
      // Check if auto-surveys are enabled
      const { data: config } = await supabase.from('app_settings')
        .select('value')
        .eq('key', 'auto_survey_config')
        .maybeSingle()

      const autoConfig = (config as { value?: AutoSurveyConfig } | null)?.value
      if (autoConfig && !autoConfig.enabled) return { sent: 0 }

      // Get all checked-in attendees
      const { data: attendees, error } = await supabase
        .from('event_registrations')
        .select('user_id')
        .eq('event_id', eventId)
        .not('checked_in_at', 'is', null)

      if (error) throw error
      if (!attendees?.length) return { sent: 0 }

      // Check who already has a survey response (unified survey_responses table)
      const userIds = attendees.map((a) => a.user_id)
      const { data: existingResponses } = await supabase
        .from('survey_responses')
        .select('user_id')
        .eq('event_id', eventId)
        .in('user_id', userIds)

      const respondedIds = new Set((existingResponses ?? []).map((r) => r.user_id))
      const pendingUsers = userIds.filter((id) => !respondedIds.has(id))

      if (!pendingUsers.length) return { sent: 0 }

      const title = 'How was your event?'
      const body = `Tell us about "${eventTitle}" - your feedback helps improve future events.`

      // Insert notifications for each attendee
      const notifications = pendingUsers.map((userId) => ({
        user_id: userId,
        type: 'survey_request',
        title,
        body,
        data: { event_id: eventId },
      }))

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications)

      if (notifError) throw notifError

      // Send push notifications
      supabase.functions.invoke('send-push', {
        body: {
          userIds: pendingUsers,
          title,
          body,
          data: { type: 'survey_request', event_id: eventId },
        },
      }).catch(console.error)

      return { sent: pendingUsers.length }
    },
  })
}
