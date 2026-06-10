import { supabase } from '@/lib/supabase'
import { isBuiltinMetric } from '@/lib/impact-metrics'
import type { SurveyQuestion } from '@/components/survey-questions'
import type { Json } from '@/types/database.types'

/**
 * Sync impact-tagged survey answers into event_impact.
 * Built-in metrics → columns, custom metrics → custom_metrics jsonb.
 *
 * @param validKeys - Set of active metric keys from useImpactMetricDefs(). When
 *   provided, questions with an impact_metric not in this set are skipped. Pass
 *   undefined to skip the validation (e.g. in contexts without the hook).
 */
export async function syncSurveyImpact(
  eventId: string,
  questions: SurveyQuestion[],
  answers: Record<string, Json>,
  userId: string,
  validKeys?: Set<string>,
) {
  const builtinUpdates: Record<string, number> = {}
  const customUpdates: Record<string, number> = {}

  for (const q of questions) {
    if (!q.impact_metric) continue

    // Validate the metric key exists as builtin or in admin-defined defs.
    // When validKeys is undefined, skip custom-key validation (accept all).
    const knownKey = isBuiltinMetric(q.impact_metric) || (validKeys ? validKeys.has(q.impact_metric) : true)
    if (!knownKey) {
      console.warn(
        `[syncSurveyImpact] Question "${q.id}" has impact_metric="${q.impact_metric}" ` +
        `which is not a builtin metric or known metric def - skipping. ` +
        `Check for typos or deleted metrics in the survey builder.`,
      )
      continue
    }

    const raw = answers[q.id]
    const value = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
    if (!isNaN(value) && value >= 0) {
      if (isBuiltinMetric(q.impact_metric)) {
        builtinUpdates[q.impact_metric] = value
      } else {
        customUpdates[q.impact_metric] = value
      }
    }
  }

  if (Object.keys(builtinUpdates).length === 0 && Object.keys(customUpdates).length === 0) return

  const { data: existing } = await supabase
    .from('event_impact')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  // Strip DB-managed fields (id, created_at, updated_at, logged_at) so the
  // upsert doesn't send stale timestamps back and suppress DB triggers.
  const {
    id: _id,
    created_at: _ca,
    updated_at: _ua,
    logged_at: _la,
    ...existingFields
  } = existing ?? ({} as any)
  const existingCustom = (existing?.custom_metrics as Record<string, unknown>) ?? {}

  // Clear legacy notes when real survey data overwrites - otherwise
  // the "Legacy import: …" notes cause the row to be excluded from
  // post-baseline impact sums.
  const isLegacyRow = ((existing?.notes as string) ?? '').startsWith('Legacy import')

  const merged = {
    ...existingFields,
    event_id: eventId,
    logged_by: userId,
    notes: isLegacyRow ? null : (existing?.notes ?? null),
    custom_metrics: {
      ...existingCustom,
      ...customUpdates,
      survey_synced: true,
    },
    ...builtinUpdates,
  }

  const { error } = await supabase.from('event_impact').upsert(merged, { onConflict: 'event_id' })
  if (error) throw new Error(`syncSurveyImpact failed: ${error.message}`)
}
