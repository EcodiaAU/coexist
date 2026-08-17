import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepNameHandle } from '@/pages/onboarding/steps/step-name-handle'

/*
 * Regression guard for the Co-Exist Vic "I typed my name but can't continue"
 * report (iPhone, 2026-07-26).
 *
 * Root cause: the shared <Input> deliberately withholds its upward onChange
 * while an IME composition is open (to protect the Android GBoard buffer, see
 * src/components/input.tsx). iOS autocorrect keeps a one-word entry (a first
 * name) in an OPEN composition until a space/blur, so the parent's controlled
 * `displayName` was still '' at the moment the user tapped Continue. The button
 * was `disabled={!displayName.trim()}`, so a disabled button ate the tap and
 * the user was stranded.
 *
 * Fix invariants:
 *  1. Continue is never disabled, and reads the LIVE DOM value on tap, so a
 *     value sitting in the (uncontrolled) DOM behind a pending composition
 *     still advances the flow and is flushed upward.
 *  2. A genuinely empty field does NOT advance (it re-focuses instead).
 *  3. Normal (non-composition) typing still advances.
 */

function setup(displayName = '') {
  const onChange = vi.fn()
  const onNext = vi.fn()
  render(
    <StepNameHandle displayName={displayName} onChange={onChange} onNext={onNext} />,
  )
  const input = screen.getByLabelText('Display name') as HTMLInputElement
  const continueBtn = screen.getByRole('button', { name: 'Continue' })
  return { onChange, onNext, input, continueBtn }
}

describe('StepNameHandle - iOS composition Continue', () => {
  it('advances even when onChange was withheld during an open IME composition', () => {
    const { onChange, onNext, input, continueBtn } = setup('')

    // Simulate iOS autocorrect: composition is OPEN, so the shared <Input>
    // withholds the upward onChange. The typed value lands in the DOM only.
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'Jess' } })

    // Precondition of the bug: the parent never heard about the value.
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('Jess')

    // The fix: tapping Continue reads the live DOM value and advances.
    fireEvent.click(continueBtn)

    expect(onChange).toHaveBeenCalledWith('Jess')
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('does not advance when the field is genuinely empty', () => {
    const { onNext, continueBtn } = setup('')
    fireEvent.click(continueBtn)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('advances on normal typing that did propagate', () => {
    const { onNext, input, continueBtn } = setup('Alex')
    // Value already propagated to the parent (displayName='Alex') and sits in
    // the DOM; a plain tap advances.
    expect(input.value).toBe('Alex')
    fireEvent.click(continueBtn)
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
