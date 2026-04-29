/**
 * Survey question types and pure helpers.
 *
 * Lives in its own module (not survey-questions.tsx) so that fast-refresh
 * works on the SurveyQuestions component - the rule requires component
 * files to export only components.
 */

export interface SurveyQuestion {
  id: string
  type: string
  text: string
  description?: string
  options?: string[]
  allow_other?: boolean
  required?: boolean
  profile_field?: string
  placeholder?: string
  // Scale / rating
  min_value?: number
  max_value?: number
  min_label?: string
  max_label?: string
  star_count?: number
  // Number constraints
  number_min?: number
  number_max?: number
  number_step?: number
  // Text constraints
  text_min_length?: number
  text_max_length?: number
  text_multiline?: boolean
  // Date constraints
  date_min?: string
  date_max?: string
  // Impact metric mapping (number questions only)
  impact_metric?: string
}

/**
 * Resolve "other" write-in values into final answers.
 * Call before submitting to replace __other__ placeholders.
 */
export function resolveOtherValues(
  questions: SurveyQuestion[],
  answers: Record<string, unknown>,
  otherValues: Record<string, string>,
): Record<string, unknown> {
  const finalAnswers = { ...answers }
  for (const [qId, otherVal] of Object.entries(otherValues)) {
    if (!otherVal.trim()) continue
    const q = questions.find((q) => q.id === qId)
    if (!q) continue
    if (q.type === 'multiple_choice' || q.type === 'dropdown') {
      if (finalAnswers[qId] === '__other__') {
        finalAnswers[qId] = `Other: ${otherVal}`
      }
    } else if (q.type === 'checkbox') {
      const arr = (finalAnswers[qId] as string[]) ?? []
      if (arr.includes('__other__')) {
        finalAnswers[qId] = [...arr.filter((o) => o !== '__other__'), `Other: ${otherVal}`]
      }
    }
  }
  return finalAnswers
}

/**
 * Parse raw JSONB questions from the surveys table into typed SurveyQuestion[].
 * Returns [] on any parse/shape error rather than throwing - a malformed
 * questions blob shouldn't crash the survey renderer or the admin lists.
 */
export function parseSurveyQuestions(raw: unknown): SurveyQuestion[] {
  let parsed: unknown
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return []
  }
  return (Array.isArray(parsed) ? parsed : [])
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object' && typeof (q as Record<string, unknown>).id === 'string' && !!(q as Record<string, unknown>).id)
    .map((q) => ({
      id: q.id as string,
      type: (q.type as string) || 'free_text',
      text: (q.text as string) || '',
      description: (q.description as string) || undefined,
      options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
      allow_other: (q.allow_other as boolean) || undefined,
      required: (q.required as boolean) || undefined,
      profile_field: (q.profile_field as string) || undefined,
      placeholder: (q.placeholder as string) || undefined,
      min_value: (q.min_value as number) ?? undefined,
      max_value: (q.max_value as number) ?? undefined,
      min_label: (q.min_label as string) || undefined,
      max_label: (q.max_label as string) || undefined,
      star_count: (q.star_count as number) ?? undefined,
      number_min: (q.number_min as number) ?? undefined,
      number_max: (q.number_max as number) ?? undefined,
      number_step: (q.number_step as number) ?? undefined,
      text_min_length: (q.text_min_length as number) ?? undefined,
      text_max_length: (q.text_max_length as number) ?? undefined,
      text_multiline: (q.text_multiline as boolean) ?? undefined,
      date_min: (q.date_min as string) || undefined,
      date_max: (q.date_max as string) || undefined,
      impact_metric: (q.impact_metric as string) || undefined,
    }))
}
