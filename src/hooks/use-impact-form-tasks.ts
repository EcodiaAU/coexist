import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { wallClockNow } from '@/lib/date-format'
import type { ImpactFormConfig } from '@/hooks/use-auto-survey'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ImpactFormTask {
  id: string
  event_id: string
  event_title: string
  activity_type: string
  collective_id: string
  collective_name: string | null
  survey_id: string
  survey_title: string
  date_end: string
  due_date: string
  status: 'pending' | 'completed'
  completed_by: string | null
  completed_by_name: string | null
  completed_at: string | null
}

/* ------------------------------------------------------------------ */
/*  Fetch active impact form surveys (keyed by activity type)          */
/* ------------------------------------------------------------------ */

function useImpactFormSurveys() {
  return useQuery({
    queryKey: ['impact-form-surveys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surveys')
        .select('id, title, activity_type')
        .eq('is_impact_form', true)
        .eq('status', 'active')

      if (error) throw error
      // Map activity_type → survey for fast lookup
      const map = new Map<string, { id: string; title: string }>()
      for (const s of data ?? []) {
        if (s.activity_type) map.set(s.activity_type, { id: s.id, title: s.title })
      }
      return map
    },
    staleTime: 10 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Pending impact form tasks for the current leader                   */
/* ------------------------------------------------------------------ */

/**
 * Finds events that need impact forms filled out by this leader.
 *
 * An event needs an impact form when:
 * 1. It has ended (date_end < now) within the visibility window (deadline + 7d buffer)
 * 2. Its activity type has an active impact form survey
 * 3. No event_impact row exists yet for the event
 * 4. The user is a leader/co-leader/assist-leader of the event's collective
 * 5. Impact form config is enabled
 *
 * This creates "virtual" task instances - they're not stored in
 * task_instances because the impact form is a first-class concept
 * tied directly to event_impact, not the generic task workflow.
 */
export function usePendingImpactFormTasks() {
  const { user, profile } = useAuth()
  const { data: surveyMap } = useImpactFormSurveys()
  // GLOBAL staff = manager/admin (+ the dead national_leader alias), NOT
  // 'leader'. profiles.role='leader' means "leads >=1 collective" (it is
  // auto-synced to the user's highest collective role), so treating it as
  // a global bypass leaked every collective's pending impact-form tasks to
  // every collective leader (Fei in Hobart saw Sydney/NE Vic/Melbourne/
  // Perth events). Matches is_admin_or_staff() and src/lib/capabilities.ts.
  // Managers are handled below via their managed_collectives scope.
  const isAdmin = profile?.role === 'admin'
  const isNationalLeader = profile?.role === 'national_leader'
  const isManager = profile?.role === 'manager'
  const isGlobalStaff = isAdmin || isNationalLeader

  return useQuery({
    queryKey: ['pending-impact-form-tasks', user?.id],
    queryFn: async () => {
      if (!user || !surveyMap || surveyMap.size === 0) return []

      // Check if impact forms are enabled
      const { data: configRow } = await supabase.from('app_settings')
        .select('value')
        .eq('key', 'impact_form_config')
        .maybeSingle()

      const config = (configRow as { value?: Partial<ImpactFormConfig> } | null)?.value
      if (config && !config.enabled) return []
      if (config && !config.auto_task_enabled) return []

      const deadlineHours = config?.deadline_hours ?? 48

      // Get collectives where this user is assist_leader+
      const { data: memberships } = await supabase
        .from('collective_members')
        .select('collective_id, role')
        .eq('user_id', user.id)
        .eq('status', 'active')

      const leaderCollectiveIds = (memberships ?? [])
        .filter((m) =>
          m.role === 'leader' || m.role === 'co_leader' || m.role === 'assist_leader',
        )
        .map((m) => m.collective_id)

      // Managers: scope to their managed collectives (from staff_roles)
      let managerCollectiveIds: string[] = []
      if (isManager) {
        const { data: staffRole } = await supabase
          .from('staff_roles')
          .select('managed_collectives')
          .eq('user_id', user.id)
          .maybeSingle()
        managerCollectiveIds = (staffRole?.managed_collectives as string[] | null) ?? []
      }

      // Admins/national_leaders see all; managers see managed; leaders see their own
      const collectiveFilter = isGlobalStaff
        ? null
        : [...new Set([...leaderCollectiveIds, ...managerCollectiveIds])]
      if (!isGlobalStaff && (collectiveFilter?.length ?? 0) === 0) return []

      // Visibility window: deadline + 7-day buffer for overdue tasks to still show.
      // E.g. 48h deadline → visible for ~9 days; 168h (7d) deadline → visible for ~14 days.
      const visibilityDays = Math.ceil(deadlineHours / 24) + 7
      // Floating-local: build the window in wall-clock-as-UTC space so
      // it compares apples-to-apples against events.date_start (also
      // wall-clock-as-UTC). setUTCDate keeps "N days ago" aligned with
      // the host wall-clock calendar.
      const wcNow = wallClockNow()
      const windowStart = new Date(wcNow.getTime())
      windowStart.setUTCDate(windowStart.getUTCDate() - visibilityDays)

      // Fetch events where either date_start or date_end falls within the
      // last 14 days. This catches multi-day events that started before the
      // window but ended within it. We filter more precisely in JS below.
      const now = wcNow.toISOString()
      let eventsQuery = supabase
        .from('events')
        .select('id, title, activity_type, collective_id, date_end, date_start, status, collectives(name)')
        .or(`date_start.gte.${windowStart.toISOString()},date_end.gte.${windowStart.toISOString()}`)
        .lte('date_start', now)
        .in('status', ['published', 'completed'])
        .order('date_start', { ascending: false })

      if (collectiveFilter) {
        eventsQuery = eventsQuery.in('collective_id', collectiveFilter)
      }

      const { data: events, error: eventsError } = await eventsQuery
      if (eventsError) throw eventsError
      if (!events?.length) return []

      // Filter to events whose activity type has an impact form AND have ended
      const nowDate = new Date()
      const relevantEvents = events.filter((e) => {
        if (!surveyMap.has(e.activity_type)) return false
        const endTime = new Date(e.date_end ?? e.date_start)
        return endTime <= nowDate
      })
      if (relevantEvents.length === 0) return []

      // Check which events already have impact logged (with who/when)
      const eventIds = relevantEvents.map((e) => e.id)
      const { data: existingImpact } = await supabase
        .from('event_impact')
        .select('event_id, logged_by, logged_at, profiles:logged_by(display_name)')
        .in('event_id', eventIds)

      const impactByEvent = new Map(
        (existingImpact ?? []).map((i) => [i.event_id, i]),
      )

      // Build task list - only events WITHOUT impact logged
      const tasks: ImpactFormTask[] = []
      for (const event of relevantEvents) {
        const survey = surveyMap.get(event.activity_type)
        if (!survey) continue

        const eventEnd = new Date(event.date_end ?? event.date_start)
        const dueDate = new Date(eventEnd.getTime() + deadlineHours * 60 * 60 * 1000)
        const impact = impactByEvent.get(event.id)

        tasks.push({
          id: `impact-form-${event.id}`,
          event_id: event.id,
          event_title: event.title,
          activity_type: event.activity_type,
          collective_id: event.collective_id,
          collective_name: (event.collectives as unknown as { name: string } | null)?.name ?? null,
          survey_id: survey.id,
          survey_title: survey.title,
          date_end: event.date_end ?? event.date_start,
          due_date: dueDate.toISOString(),
          status: impact ? 'completed' : 'pending',
          completed_by: impact?.logged_by ?? null,
          completed_by_name: (impact?.profiles as unknown as { display_name: string } | null)?.display_name ?? null,
          completed_at: impact?.logged_at ?? null,
        })
      }

      return tasks
    },
    enabled: !!user && !!surveyMap,
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Send impact form notifications to collective leaders               */
/* ------------------------------------------------------------------ */

/**
 * Send notification to collective leaders that an impact form needs
 * to be filled out. Called when an event ends and has an impact form
 * configured for its activity type.
 */
export function useNotifyLeadersForImpactForm() {
  return useMutation({
    mutationFn: async ({
      eventId,
      eventTitle,
      collectiveId,
    }: {
      eventId: string
      eventTitle: string
      collectiveId: string
    }) => {
      // Get leaders of this collective
      const { data: leaders, error: leadersError } = await supabase
        .from('collective_members')
        .select('user_id')
        .eq('collective_id', collectiveId)
        .eq('status', 'active')
        .in('role', ['leader', 'co_leader', 'assist_leader'])

      if (leadersError) throw leadersError
      if (!leaders?.length) return { sent: 0 }

      const title = 'Impact form ready'
      const body = `Log the impact for "${eventTitle}" - any leader in your collective can fill this out.`

      const notifications = leaders.map((l) => ({
        user_id: l.user_id,
        type: 'survey_request' as const,
        title,
        body,
        data: { event_id: eventId, type: 'impact_form' },
      }))

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications)

      if (notifError) throw notifError

      // Send push notifications
      const leaderIds = leaders.map((l) => l.user_id)
      supabase.functions.invoke('send-push', {
        body: {
          userIds: leaderIds,
          title,
          body,
          data: { type: 'survey_request', subtype: 'impact_form', event_id: eventId },
        },
      }).catch(console.error)

      return { sent: leaders.length }
    },
  })
}
