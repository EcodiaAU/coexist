import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { wallClockNow } from '@/lib/date-format'
import type { Database, TablesInsert } from '@/types/database.types'

type ActivityType = Database['public']['Enums']['activity_type']

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TimelineAnchor = 'next_event' | 'next_event_of_type' | 'event_series'

export interface TimelineRule {
  id: string
  template_id: string
  anchor: TimelineAnchor
  activity_type_filter: string | null
  series_id_filter: string | null
  offset_days: number
  lookahead_days: number
  match_all_events: boolean
  display_label: string | null
  created_at: string
  updated_at: string
}

export interface TimelineRuleInput {
  template_id: string
  anchor: TimelineAnchor
  activity_type_filter?: string | null
  series_id_filter?: string | null
  offset_days: number
  lookahead_days?: number
  match_all_events?: boolean
}

/* ------------------------------------------------------------------ */
/*  Display label generator                                            */
/* ------------------------------------------------------------------ */

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  clean_up: 'clean up',
  tree_planting: 'tree planting',
  ecosystem_restoration: 'ecosystem restoration',
  nature_hike: 'nature hike',
  camp_out: 'camp out',
  spotlighting: 'spotlighting',
  other: 'other',
}

export function buildDisplayLabel(rule: {
  anchor: TimelineAnchor
  offset_days: number
  activity_type_filter?: string | null
  match_all_events?: boolean
}): string {
  const days = Math.abs(rule.offset_days)
  const direction = rule.offset_days < 0 ? 'before' : rule.offset_days > 0 ? 'after' : 'on the day of'
  const dayLabel = days === 0 ? '' : `${days} day${days !== 1 ? 's' : ''} ${direction}`

  const allOrNext = rule.match_all_events ? 'each' : "the next"

  let eventLabel = 'event'
  if (rule.anchor === 'next_event_of_type' && rule.activity_type_filter) {
    eventLabel = ACTIVITY_TYPE_LABELS[rule.activity_type_filter] ?? rule.activity_type_filter
  } else if (rule.anchor === 'event_series') {
    eventLabel = 'event in the series'
  }

  if (days === 0) return `On the day of ${allOrNext} ${eventLabel}`
  return `${dayLabel} ${allOrNext} ${eventLabel}`
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useTimelineRule(templateId: string | undefined) {
  return useQuery({
    queryKey: ['timeline-rule', templateId],
    queryFn: async () => {
      if (!templateId) return null
      const { data, error } = await supabase.from('timeline_rules')
        .select('*')
        .eq('template_id', templateId)
        .maybeSingle()
      if (error) throw error
      return data as TimelineRule | null
    },
    enabled: !!templateId,
    staleTime: 60 * 1000,
  })
}

export function useUpsertTimelineRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TimelineRuleInput) => {
      const label = buildDisplayLabel(input)
      const row: TablesInsert<'timeline_rules'> = {
        template_id: input.template_id,
        anchor: input.anchor,
        activity_type_filter: (input.activity_type_filter || null) as ActivityType | null,
        series_id_filter: input.series_id_filter || null,
        offset_days: input.offset_days,
        lookahead_days: input.lookahead_days ?? 60,
        match_all_events: input.match_all_events ?? false,
        display_label: label,
      }
      const { data, error } = await supabase.from('timeline_rules')
        .upsert(row, { onConflict: 'template_id' })
        .select('*')
        .single()
      if (error) throw error
      return data as TimelineRule
    },
    onSuccess: (rule) => {
      queryClient.setQueryData(['timeline-rule', rule.template_id], rule)
      queryClient.invalidateQueries({ queryKey: ['admin-task-templates'] })
    },
  })
}

export function useDeleteTimelineRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.from('timeline_rules')
        .delete()
        .eq('template_id', templateId)
      if (error) throw error
    },
    onSuccess: (_d, templateId) => {
      queryClient.setQueryData(['timeline-rule', templateId], null)
      queryClient.invalidateQueries({ queryKey: ['admin-task-templates'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Dynamic instance resolution                                        */
/* ------------------------------------------------------------------ */

/**
 * Given a list of collectives the current user is staff in, fetch all
 * active event_relative templates with dynamic timelines, resolve their
 * matching events per collective, and generate task instances.
 *
 * This is the core engine. Called during lazy task generation.
 */
export async function resolveAndGenerateDynamicInstances(
  staffCollectiveIds: string[],
): Promise<void> {
  if (staffCollectiveIds.length === 0) return

  // 1. Fetch all active templates that use dynamic timeline
  const { data: templates } = await supabase.from('task_templates')
    .select('*')
    .eq('is_active', true)
    .eq('schedule_type', 'event_relative')
    .eq('use_dynamic_timeline', true)

  if (!templates?.length) return

  // 2. Fetch timeline rules for these templates
  type TemplateRow = { id: string; collective_id: string | null; [k: string]: unknown }
  const templateIds = (templates as TemplateRow[]).map((t) => t.id)
  const { data: rules } = await supabase.from('timeline_rules')
    .select('*')
    .in('template_id', templateIds)

  if (!rules?.length) return

  const ruleMap = new Map((rules as TimelineRule[]).map((r) => [r.template_id, r]))

  // 3. For each template + collective combo, find matching events.
  // Floating-local: event.date_start is wall-clock-as-UTC, so compare
  // against the viewer's wall-clock-now.
  const now = wallClockNow()

  // Build all event queries in parallel, then batch upsert task instances
  interface EventQueryJob {
    templateId: string
    collectiveId: string
    rule: TimelineRule
  }

  const jobs: EventQueryJob[] = []
  for (const template of templates as TemplateRow[]) {
    const rule = ruleMap.get(template.id as string)
    if (!rule) continue

    const targetCollectives = template.collective_id
      ? [template.collective_id].filter((id): id is string => typeof id === 'string' && staffCollectiveIds.includes(id))
      : staffCollectiveIds

    for (const collectiveId of targetCollectives) {
      jobs.push({ templateId: template.id, collectiveId, rule })
    }
  }

  // Fetch events for all jobs in parallel
  const eventResults = await Promise.all(
    jobs.map(async (job) => {
      const lookaheadEnd = new Date(now)
      lookaheadEnd.setDate(lookaheadEnd.getDate() + job.rule.lookahead_days)

      let eventQuery = supabase
        .from('events')
        .select('id, title, date_start, activity_type, series_id')
        .eq('collective_id', job.collectiveId)
        .eq('status', 'published')
        .gte('date_start', now.toISOString())
        .lte('date_start', lookaheadEnd.toISOString())
        .order('date_start', { ascending: true })

      if (job.rule.anchor === 'next_event_of_type' && job.rule.activity_type_filter) {
        eventQuery = eventQuery.eq('activity_type', job.rule.activity_type_filter as Database['public']['Enums']['activity_type'])
      }
      if (job.rule.anchor === 'event_series' && job.rule.series_id_filter) {
        eventQuery = eventQuery.eq('series_id', job.rule.series_id_filter)
      }
      if (!job.rule.match_all_events) {
        eventQuery = eventQuery.limit(1)
      }

      const { data: events } = await eventQuery
      return { job, events: events ?? [] }
    }),
  )

  // Collect all upsert rows
  const dynamicRows: Array<{
    template_id: string
    collective_id: string
    event_id: string
    due_date: string
    period_key: string
    status: string
  }> = []

  for (const { job, events } of eventResults) {
    for (const event of events) {
      const eventDate = new Date(event.date_start)
      const dueDate = new Date(eventDate)
      dueDate.setDate(dueDate.getDate() + job.rule.offset_days)
      dueDate.setHours(23, 59, 59, 999)

      if (dueDate < now) continue

      dynamicRows.push({
        template_id: job.templateId,
        collective_id: job.collectiveId,
        event_id: event.id,
        due_date: dueDate.toISOString(),
        period_key: `event:${event.id}`,
        status: 'pending',
      })
    }
  }

  // Single batch upsert
  if (dynamicRows.length > 0) {
    const { error } = await supabase.from('task_instances')
      .upsert(dynamicRows, { onConflict: 'template_id,collective_id,period_key', ignoreDuplicates: true })
    if (error) console.error('[timeline] batch upsert error:', error.message)
  }
}
