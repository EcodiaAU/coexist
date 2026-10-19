import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepNameHandle } from '@/pages/onboarding/steps/step-name-handle'
import { initialNameParts, isPlaceholderDisplayName, needsNameStep } from '@/lib/onboarding-name'

/*
 * Regression guard for the Co-Exist Vic "I typed my name but can't continue"
 * report (iPhone, 2026-07-26), carried onto the two-field step that made last
 * name mandatory (2026-10-19).
 *
 * Root cause of the 2026-07 bug: the shared <Input> deliberately withholds its
 * upward onChange while an IME composition is open (to protect the Android
 * GBoard buffer, see src/components/input.tsx). iOS autocorrect keeps a
 * one-word entry in an OPEN composition until a space/blur, so the parent's
 * controlled value was still '' at the moment the user tapped Continue, and a
 * disabled button ate the tap.
 *
 * Fix invariants:
 *  1. Continue is never disabled, and reads the LIVE DOM values on tap, so a
 *     value sitting in the DOM behind a pending composition still advances the
 *     flow and is flushed upward. A last name is one word too.
 *  2. A genuinely empty first OR last name does NOT advance.
 *  3. Normal (non-composition) typing still advances.
 */

function setup(firstName = '', lastName = '') {
  const onChange = vi.fn()
  const onNext = vi.fn()
  render(
    <StepNameHandle firstName={firstName} lastName={lastName} onChange={onChange} onNext={onNext} />,
  )
  const first = screen.getByLabelText('First name') as HTMLInputElement
  const last = screen.getByLabelText('Last name') as HTMLInputElement
  const continueBtn = screen.getByRole('button', { name: 'Continue' })
  return { onChange, onNext, first, last, continueBtn }
}

describe('StepNameHandle - iOS composition Continue', () => {
  it('advances even when onChange was withheld during an open IME composition', () => {
    const { onChange, onNext, first, last, continueBtn } = setup('Jess', '')

    // Simulate iOS autocorrect on the LAST name: composition is OPEN, so the
    // shared <Input> withholds the upward onChange. The value is DOM-only.
    fireEvent.compositionStart(last)
    fireEvent.change(last, { target: { value: 'Ditchfield' } })

    expect(onChange).not.toHaveBeenCalled()
    expect(first.value).toBe('Jess')
    expect(last.value).toBe('Ditchfield')

    fireEvent.click(continueBtn)

    expect(onChange).toHaveBeenCalledWith('Jess', 'Ditchfield')
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('does not advance when the first name is empty', () => {
    const { onNext, continueBtn } = setup('', 'Ditchfield')
    fireEvent.click(continueBtn)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('does not advance when the last name is empty', () => {
    const { onNext, continueBtn } = setup('Jess', '   ')
    fireEvent.click(continueBtn)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('advances on normal typing that did propagate', () => {
    const { onNext, first, last, continueBtn } = setup('Alex', 'Ng')
    expect(first.value).toBe('Alex')
    expect(last.value).toBe('Ng')
    fireEvent.click(continueBtn)
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})

describe('onboarding name defaults', () => {
  const relay = 'bk2pv6nhy2@privaterelay.appleid.com'

  it('treats the email local part as a placeholder, not a name (Sign in with Apple)', () => {
    expect(isPlaceholderDisplayName('bk2pv6nhy2', relay)).toBe(true)
    expect(isPlaceholderDisplayName('BK2PV6NHY2', relay)).toBe(true)
    expect(isPlaceholderDisplayName('New User', relay)).toBe(true)
    expect(isPlaceholderDisplayName('', relay)).toBe(true)
    expect(isPlaceholderDisplayName('Charli', 'charli.b@gmail.com')).toBe(false)
  })

  it('pre-fills nothing from a placeholder', () => {
    expect(initialNameParts({ display_name: 'bk2pv6nhy2' }, relay)).toEqual({ firstName: '', lastName: '' })
  })

  it('splits a real display name (Google sends the full name)', () => {
    expect(initialNameParts({ display_name: 'Mary Jane Watson' }, 'mj@gmail.com')).toEqual({
      firstName: 'Mary',
      lastName: 'Jane Watson',
    })
    expect(initialNameParts({ display_name: 'Sophie' }, 's@gmail.com')).toEqual({ firstName: 'Sophie', lastName: '' })
  })

  it('real first and last names win over the display name', () => {
    expect(initialNameParts({ display_name: 'Jessie', first_name: 'Jessica', last_name: 'Ditchfield' }, 'j@x.org')).toEqual({
      firstName: 'Jessica',
      lastName: 'Ditchfield',
    })
  })

  it('asks for a name until both halves exist', () => {
    expect(needsNameStep({ first_name: 'Jess', last_name: null })).toBe(true)
    expect(needsNameStep({ first_name: ' ', last_name: 'D' })).toBe(true)
    expect(needsNameStep({ first_name: 'Jess', last_name: 'Ditchfield' })).toBe(false)
    expect(needsNameStep(null)).toBe(true)
  })
})
