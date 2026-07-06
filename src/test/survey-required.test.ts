import { describe, it, expect } from 'vitest'
import {
  isAnswerFilled,
  surveyMissingRequired,
  canSubmitSurvey,
  type SurveyQuestion,
} from '@/components/survey-questions-utils'

/**
 * Regression cover for the post-event-survey "required sections incomplete
 * when they are filled" false-negative, plus the empty-multi-select false
 * positive. canSubmitSurvey / surveyMissingRequired are the single gate for
 * both the attendee post-event survey and the leader log-impact form, so the
 * suite exercises EVERY question type - including the values the old strict
 * `val !== ''` check mishandled: a rating/scale of 0, a "0" number entry, a
 * "No" (false) answer, and an empty vs populated multi-select.
 */

function q(partial: Partial<SurveyQuestion> & { id: string; type: string }): SurveyQuestion {
  return { text: partial.id, required: true, ...partial }
}

describe('isAnswerFilled - per-value recognition', () => {
  it('treats null / undefined as empty', () => {
    expect(isAnswerFilled(null)).toBe(false)
    expect(isAnswerFilled(undefined)).toBe(false)
  })

  it('treats empty and whitespace-only strings as empty', () => {
    expect(isAnswerFilled('')).toBe(false)
    expect(isAnswerFilled('   ')).toBe(false)
  })

  it('treats a non-empty string as filled', () => {
    expect(isAnswerFilled('Great event')).toBe(true)
  })

  it('treats the number 0 as filled (rating star 0 / scale min 0)', () => {
    expect(isAnswerFilled(0)).toBe(true)
  })

  it('treats a positive number as filled', () => {
    expect(isAnswerFilled(5)).toBe(true)
  })

  it('treats the number-input string "0" as filled', () => {
    expect(isAnswerFilled('0')).toBe(true)
  })

  it('treats boolean false as filled (a "No" answer is answered)', () => {
    expect(isAnswerFilled(false)).toBe(true)
    expect(isAnswerFilled(true)).toBe(true)
  })

  it('treats an empty array as empty (required multi-select not answered)', () => {
    expect(isAnswerFilled([])).toBe(false)
  })

  it('treats a non-empty array as filled (multi-select with a pick)', () => {
    expect(isAnswerFilled(['Litter'])).toBe(true)
  })
})

/* Every renderer-produced type, filled with a legitimate value. */
const ALL_TYPES: { type: string; extra?: Partial<SurveyQuestion>; filled: unknown }[] = [
  { type: 'free_text', filled: 'It was good' },
  { type: 'free_text', extra: { text_multiline: false }, filled: 'short' },
  { type: 'rating', extra: { star_count: 5 }, filled: 3 },
  { type: 'scale', extra: { min_value: 0, max_value: 10 }, filled: 0 }, // scale of 0
  { type: 'scale', extra: { min_value: 1, max_value: 5 }, filled: 4 },
  { type: 'multiple_choice', extra: { options: ['A', 'B'] }, filled: 'A' },
  { type: 'checkbox', extra: { options: ['A', 'B'] }, filled: ['A'] },
  { type: 'dropdown', extra: { options: ['A', 'B'] }, filled: 'B' },
  { type: 'yes_no', filled: 'No' },
  { type: 'number', extra: { impact_metric: 'trees' }, filled: '0' }, // zero count
  { type: 'date', filled: '2026-07-06' },
  { type: 'email', filled: 'a@b.com' },
  { type: 'phone', filled: '0400 000 000' },
  { type: 'profile_autofill', extra: { profile_field: 'phone' }, filled: '0400 000 000' },
]

describe('canSubmitSurvey - every question type filled with a valid answer', () => {
  it.each(ALL_TYPES)('type=$type filled=$filled passes', ({ type, extra, filled }) => {
    const question = q({ id: 'x', type, ...extra })
    expect(canSubmitSurvey([question], { x: filled })).toBe(true)
    expect(surveyMissingRequired([question], { x: filled })).toEqual([])
  })

  it.each(ALL_TYPES)('type=$type unanswered (undefined) blocks submit', ({ type, extra }) => {
    const question = q({ id: 'x', type, ...extra })
    expect(canSubmitSurvey([question], {})).toBe(false)
    expect(surveyMissingRequired([question], {})).toEqual(['x'])
  })
})

describe('canSubmitSurvey - false-negative regressions the strict check produced', () => {
  it('a rating of 0 is a filled required answer (was: incomplete)', () => {
    const question = q({ id: 'r', type: 'rating', star_count: 5 })
    expect(canSubmitSurvey([question], { r: 0 })).toBe(true)
  })

  it('a scale of 0 is a filled required answer (was: incomplete)', () => {
    const question = q({ id: 's', type: 'scale', min_value: 0, max_value: 10 })
    expect(canSubmitSurvey([question], { s: 0 })).toBe(true)
  })

  it('a "No" yes/no is a filled required answer', () => {
    const question = q({ id: 'yn', type: 'yes_no' })
    expect(canSubmitSurvey([question], { yn: 'No' })).toBe(true)
  })

  it('a full survey stays submittable across every type at once', () => {
    const questions = ALL_TYPES.map((t, i) => q({ id: `q${i}`, type: t.type, ...t.extra }))
    const answers = Object.fromEntries(ALL_TYPES.map((t, i) => [`q${i}`, t.filled]))
    expect(surveyMissingRequired(questions, answers)).toEqual([])
    expect(canSubmitSurvey(questions, answers)).toBe(true)
  })
})

describe('canSubmitSurvey - false-positive the strict check produced', () => {
  it('a required multi-select with NOTHING selected ([]) blocks submit', () => {
    const question = q({ id: 'm', type: 'checkbox', options: ['A', 'B'] })
    expect(canSubmitSurvey([question], { m: [] })).toBe(false)
    expect(surveyMissingRequired([question], { m: [] })).toEqual(['m'])
  })

  it('a required text field of only whitespace blocks submit', () => {
    const question = q({ id: 't', type: 'free_text' })
    expect(canSubmitSurvey([question], { t: '   ' })).toBe(false)
  })
})

describe('canSubmitSurvey - conditional / branching questions', () => {
  const parent = q({ id: 'p', type: 'yes_no' })
  const child = q({ id: 'c', type: 'free_text', show_if: { question_id: 'p', equals: 'Yes' } })
  const optional = q({ id: 'o', type: 'free_text', required: false })

  it('a hidden required conditional does NOT block submit (parent = No)', () => {
    // Child is required but hidden because parent is "No" -> not counted.
    expect(canSubmitSurvey([parent, child], { p: 'No' })).toBe(true)
    expect(surveyMissingRequired([parent, child], { p: 'No' })).toEqual([])
  })

  it('a hidden required conditional does NOT block submit (parent unanswered)', () => {
    expect(surveyMissingRequired([child], {})).toEqual([])
  })

  it('a SHOWN required conditional DOES block submit until filled (parent = Yes)', () => {
    expect(canSubmitSurvey([parent, child], { p: 'Yes' })).toBe(false)
    expect(surveyMissingRequired([parent, child], { p: 'Yes' })).toEqual(['c'])
    expect(canSubmitSurvey([parent, child], { p: 'Yes', c: 'because' })).toBe(true)
  })

  it('a stale answer on a now-hidden conditional does not un-block or matter', () => {
    // Parent flipped back to No; child still carries its old typed value.
    // Child is hidden so it is neither required nor blocking.
    expect(canSubmitSurvey([parent, child], { p: 'No', c: 'old value' })).toBe(true)
  })

  it('an optional unanswered question never blocks submit', () => {
    expect(canSubmitSurvey([optional], {})).toBe(true)
  })
})

describe('surveyMissingRequired - answers-merge false negative (the page-level bug)', () => {
  // The page previously SWAPPED userAnswers for existingAnswers instead of
  // merging. Touching one field dropped all prior saved answers from the
  // gate. The fix merges { ...existingAnswers, ...userAnswers }; this pins the
  // merged shape still passes while a swap (userAnswers only) would fail.
  const questions = [
    q({ id: 'a', type: 'rating', star_count: 5 }),
    q({ id: 'b', type: 'free_text' }),
    q({ id: 'd', type: 'checkbox', options: ['X', 'Y'] }),
  ]
  const existingAnswers = { a: 4, b: 'nice', d: ['X'] }

  it('a SWAP to just the edited key would falsely report incomplete', () => {
    const swapped = { b: 'edited' } // old behaviour: userAnswers only
    expect(canSubmitSurvey(questions, swapped)).toBe(false)
    expect(surveyMissingRequired(questions, swapped).sort()).toEqual(['a', 'd'])
  })

  it('the MERGED answers keep the survey submittable after a single edit', () => {
    const merged = { ...existingAnswers, ...{ b: 'edited' } }
    expect(canSubmitSurvey(questions, merged)).toBe(true)
    expect(surveyMissingRequired(questions, merged)).toEqual([])
  })
})
