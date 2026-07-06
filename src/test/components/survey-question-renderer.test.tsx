import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SurveyQuestionRenderer } from '@/components/survey-questions'
import type { SurveyQuestion } from '@/components/survey-questions-utils'

/**
 * QA sweep regression cover:
 * - P3-8: numeric survey answers must reach setAnswer as real numbers, not
 *   the raw input string, so the persisted answers jsonb carries 42 not "42".
 * - P3-9: rating star buttons must carry an accessible name (they used to
 *   announce as bare "button" to screen readers).
 */

const numberQ: SurveyQuestion = {
  id: 'q-num',
  type: 'number',
  text: 'How many trees did you plant?',
  required: true,
}

const ratingQ: SurveyQuestion = {
  id: 'q-rate',
  type: 'rating',
  text: 'Rate the event',
  required: true,
  star_count: 5,
}

describe('SurveyQuestionRenderer - number questions (P3-8)', () => {
  it('coerces typed input to a number before it reaches setAnswer', () => {
    const setAnswer = vi.fn()
    render(
      <SurveyQuestionRenderer questions={[numberQ]} answers={{}} setAnswer={setAnswer} />,
    )
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '42' } })
    expect(setAnswer).toHaveBeenCalledWith('q-num', 42)
    const [, stored] = setAnswer.mock.calls.at(-1)!
    expect(typeof stored).toBe('number')
  })

  it('keeps a cleared field as empty string so required-validation still trips', () => {
    const setAnswer = vi.fn()
    render(
      <SurveyQuestionRenderer questions={[numberQ]} answers={{ 'q-num': 42 }} setAnswer={setAnswer} />,
    )
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '' } })
    expect(setAnswer).toHaveBeenCalledWith('q-num', '')
  })

  it('coerces zero to the number 0, not "0"', () => {
    const setAnswer = vi.fn()
    render(
      <SurveyQuestionRenderer questions={[numberQ]} answers={{}} setAnswer={setAnswer} />,
    )
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
    expect(setAnswer).toHaveBeenCalledWith('q-num', 0)
  })
})

describe('SurveyQuestionRenderer - rating stars (P3-9)', () => {
  it('gives every star button an accessible name and pressed state', () => {
    const setAnswer = vi.fn()
    render(
      <SurveyQuestionRenderer questions={[ratingQ]} answers={{ 'q-rate': 3 }} setAnswer={setAnswer} />,
    )
    expect(screen.getByRole('button', { name: '1 star' })).toBeInTheDocument()
    for (const n of [2, 3, 4, 5]) {
      expect(screen.getByRole('button', { name: `${n} stars` })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '3 stars' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '5 stars' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('stores the tapped star as a number', () => {
    const setAnswer = vi.fn()
    render(
      <SurveyQuestionRenderer questions={[ratingQ]} answers={{}} setAnswer={setAnswer} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '4 stars' }))
    expect(setAnswer).toHaveBeenCalledWith('q-rate', 4)
  })
})
