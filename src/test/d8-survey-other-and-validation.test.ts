import { describe, it, expect } from 'vitest'
import {
  OTHER_SENTINEL,
  OTHER_PREFIX,
  isOtherValue,
  otherTextOf,
  makeOtherValue,
  checkboxHasOther,
  checkboxOtherText,
  setCheckboxOther,
  toggleCheckboxOther,
  getSurveyAnswerError,
  surveyAnswerErrors,
  canSubmitSurvey,
  type SurveyQuestion,
} from '@/components/survey-questions-utils'

function q(partial: Partial<SurveyQuestion> & { id: string; type: string }): SurveyQuestion {
  return { text: partial.id, ...partial }
}

/**
 * D8 finding 515: "Other..." write-in was silently discarded (the answer stayed
 * "__other__"). The renderer now persists the write-in straight into the answer
 * via these helpers, so the stored value carries the real text. This suite pins
 * the storage format + the "is other selected" detection that the renderer,
 * results view and CSV export all rely on.
 */
describe('D8/515 - single-select "Other" resolution', () => {
  it('empty text keeps the sentinel so the option stays selected while typing', () => {
    expect(makeOtherValue('')).toBe(OTHER_SENTINEL)
    expect(makeOtherValue('   ')).toBe(OTHER_SENTINEL)
    expect(isOtherValue(OTHER_SENTINEL)).toBe(true)
    expect(otherTextOf(OTHER_SENTINEL)).toBe('')
  })

  it('typed text persists as "Other: <text>" and round-trips back for the input', () => {
    const v = makeOtherValue('Regenerative farming')
    expect(v).toBe(`${OTHER_PREFIX}Regenerative farming`)
    expect(isOtherValue(v)).toBe(true)
    expect(otherTextOf(v)).toBe('Regenerative farming')
  })

  it('a fixed option is NOT treated as an "Other" value', () => {
    expect(isOtherValue('Activities')).toBe(false)
    expect(otherTextOf('Activities')).toBe('')
  })
})

describe('D8/515 - checkbox "Other" resolution preserves fixed options', () => {
  it('toggling other adds the sentinel then removes any other entry', () => {
    expect(toggleCheckboxOther(['A'])).toEqual(['A', OTHER_SENTINEL])
    expect(toggleCheckboxOther(['A', OTHER_SENTINEL])).toEqual(['A'])
    expect(toggleCheckboxOther(['A', `${OTHER_PREFIX}foo`])).toEqual(['A'])
  })

  it('typing replaces the single other entry in place, keeping fixed selections + order', () => {
    const next = setCheckboxOther(['A', OTHER_SENTINEL], 'Beekeeping')
    expect(next).toEqual(['A', `${OTHER_PREFIX}Beekeeping`])
    expect(checkboxHasOther(next)).toBe(true)
    expect(checkboxOtherText(next)).toBe('Beekeeping')
    // retyping does not accumulate duplicate other entries
    expect(setCheckboxOther(next, 'Composting')).toEqual(['A', `${OTHER_PREFIX}Composting`])
  })

  it('empty text falls back to the sentinel (option stays visibly selected)', () => {
    expect(setCheckboxOther(['A', `${OTHER_PREFIX}x`], '')).toEqual(['A', OTHER_SENTINEL])
  })
})

/**
 * D8 findings 520 (email/phone "validated automatically" but nothing validated)
 * and 521 (number min/max displayed but not enforced). getSurveyAnswerError is
 * the shared source of truth for the submit gate + the inline renderer error.
 */
describe('D8/520 - email + phone format validation', () => {
  it('accepts a valid email and rejects a malformed one', () => {
    expect(getSurveyAnswerError(q({ id: 'e', type: 'email' }), 'a@b.co')).toBeNull()
    expect(getSurveyAnswerError(q({ id: 'e', type: 'email' }), 'not-an-email')).toBe('Enter a valid email address')
    expect(getSurveyAnswerError(q({ id: 'e', type: 'email' }), 'a@b')).toBe('Enter a valid email address')
  })

  it('accepts AU/international phone shapes and rejects junk', () => {
    expect(getSurveyAnswerError(q({ id: 'p', type: 'phone' }), '0412 345 678')).toBeNull()
    expect(getSurveyAnswerError(q({ id: 'p', type: 'phone' }), '+61 4 1234 5678')).toBeNull()
    expect(getSurveyAnswerError(q({ id: 'p', type: 'phone' }), '(07) 3000 0000')).toBeNull()
    expect(getSurveyAnswerError(q({ id: 'p', type: 'phone' }), 'call me')).toBe('Enter a valid phone number')
    expect(getSurveyAnswerError(q({ id: 'p', type: 'phone' }), '12345')).toBe('Enter a valid phone number')
  })

  it('an empty optional email/phone is not an error (only filled values validate)', () => {
    expect(getSurveyAnswerError(q({ id: 'e', type: 'email' }), '')).toBeNull()
    expect(getSurveyAnswerError(q({ id: 'p', type: 'phone' }), undefined)).toBeNull()
  })
})

describe('D8/521 - number range enforcement', () => {
  const nq = q({ id: 'n', type: 'number', number_min: 1, number_max: 100 })

  it('accepts in-range and rejects out-of-range', () => {
    expect(getSurveyAnswerError(nq, 50)).toBeNull()
    expect(getSurveyAnswerError(nq, 1)).toBeNull()
    expect(getSurveyAnswerError(nq, 100)).toBeNull()
    expect(getSurveyAnswerError(nq, 0)).toBe('Enter a number between 1 and 100')
    expect(getSurveyAnswerError(nq, 999999)).toBe('Enter a number between 1 and 100')
  })

  it('single-sided bounds and NaN', () => {
    expect(getSurveyAnswerError(q({ id: 'n', type: 'number', number_min: 5 }), 4)).toBe('Enter a number of at least 5')
    expect(getSurveyAnswerError(q({ id: 'n', type: 'number', number_max: 5 }), 6)).toBe('Enter a number of at most 5')
    expect(getSurveyAnswerError(q({ id: 'n', type: 'number' }), 'abc')).toBe('Enter a valid number')
  })
})

describe('D8/520+521 - canSubmitSurvey blocks malformed answers', () => {
  const questions: SurveyQuestion[] = [
    q({ id: 'email', type: 'email', required: true }),
    q({ id: 'trees', type: 'number', number_min: 0, number_max: 500 }),
  ]

  it('blocks submit on a bad email even though it is "filled"', () => {
    expect(canSubmitSurvey(questions, { email: 'nope', trees: 10 })).toBe(false)
    expect(surveyAnswerErrors(questions, { email: 'nope', trees: 10 })).toHaveProperty('email')
  })

  it('blocks submit on an out-of-range optional number', () => {
    expect(canSubmitSurvey(questions, { email: 'a@b.co', trees: 99999 })).toBe(false)
  })

  it('allows submit when every answer is well-formed', () => {
    expect(canSubmitSurvey(questions, { email: 'a@b.co', trees: 10 })).toBe(true)
  })
})
