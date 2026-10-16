import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { useBlindKeyboardRoom, keyboardInvisibleToLayout, blindKeyboardRoom, insideNestedScroller } from '@/hooks/use-blind-keyboard-room'

/*
 * Android 10 under adjustNothing never reports the keyboard (see
 * use-blind-keyboard-room.ts). These cases pin the two halves that matter:
 * the room appears only when the keyboard is invisible to layout, and it does
 * not disappear between the blur of a field and the click on Continue.
 */

function Harness({ enabled }: { enabled: boolean }) {
  const room = useBlindKeyboardRoom({ enabled })
  return (
    <div>
      <div data-testid="container" onFocus={room.onFocus} onBlur={room.onBlur}>
        <div data-kb-room-scroll="">
          <textarea data-testid="field" />
          <button type="button" data-testid="continue">Continue</button>
          {room.active && <div data-testid="room" style={{ height: blindKeyboardRoom() }} />}
        </div>
      </div>
      <button type="button" data-testid="outside">Outside</button>
    </div>
  )
}

/*
 * Mirrors onboarding.tsx: the room lives in the page, the step content is keyed
 * on the step, and Continue (inside the container) swaps the step. Removing the
 * focused Continue fires no blur React delivers, so only resetKey releases it.
 */
function StepHarness() {
  const [step, setStep] = useState(0)
  const room = useBlindKeyboardRoom({ enabled: true, resetKey: step })
  return (
    <div data-testid="container" onFocus={room.onFocus} onBlur={room.onBlur}>
      <div key={step} data-kb-room-scroll="">
        {step === 0 && <textarea data-testid="field" />}
        {step === 1 && <p data-testid="collectives">Join your Collectives</p>}
        {step === 1 && <input data-testid="field-next" />}
        {step === 0 && (
          <button type="button" data-testid="continue" onClick={() => setStep(1)}>Continue</button>
        )}
        {room.active && <div data-testid="room" style={{ height: blindKeyboardRoom() }} />}
      </div>
    </div>
  )
}

/* The collective step: the search field sits inside the step's own scrolling list. */
function NestedHarness() {
  const room = useBlindKeyboardRoom({ enabled: true })
  return (
    <div onFocus={room.onFocus} onBlur={room.onBlur}>
      <div data-kb-room-scroll="">
        <div style={{ overflowY: 'auto' }}>
          <input data-testid="search" />
        </div>
        {room.active && <div data-testid="room" />}
      </div>
    </div>
  )
}

function setGeometry(innerHeight: number, screenHeight: number, kb: number) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight })
  Object.defineProperty(window.screen, 'height', { configurable: true, value: screenHeight })
  document.documentElement.style.setProperty('--kb-height', `${kb}px`)
}

describe('keyboardInvisibleToLayout', () => {
  afterEach(() => setGeometry(768, 768, 0))

  it('is true on Android 10: no --kb-height and the WebView kept its full height', () => {
    setGeometry(740, 740, 0)
    expect(keyboardInvisibleToLayout()).toBe(true)
  })

  it('is false when the keyboard is reported through --kb-height (iOS)', () => {
    setGeometry(740, 740, 300)
    expect(keyboardInvisibleToLayout()).toBe(false)
  })

  it('is false when the WebView was resized for the keyboard (Android 11+)', () => {
    setGeometry(440, 740, 0)
    expect(keyboardInvisibleToLayout()).toBe(false)
  })
})

describe('useBlindKeyboardRoom', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Element.scrollBy is not implemented in jsdom.
    Element.prototype.scrollBy = vi.fn()
    setGeometry(740, 740, 0)
  })
  afterEach(() => {
    vi.useRealTimers()
    setGeometry(768, 768, 0)
  })

  it('adds room after a field takes focus, sized to 60% of the viewport', () => {
    const { getByTestId, queryByTestId } = render(<Harness enabled />)
    act(() => { getByTestId('field').focus() })
    expect(queryByTestId('room')).toBeNull()
    act(() => { vi.advanceTimersByTime(400) })
    expect(queryByTestId('room')).not.toBeNull()
    expect((getByTestId('room') as HTMLElement).style.height).toBe('444px')
  })

  it('keeps the room while focus moves from the field to Continue inside the container', () => {
    const { getByTestId, queryByTestId } = render(<Harness enabled />)
    act(() => { getByTestId('field').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    act(() => {
      fireEvent.blur(getByTestId('field'), { relatedTarget: getByTestId('continue') })
      getByTestId('continue').focus()
    })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(queryByTestId('room')).not.toBeNull()
  })

  it('removes the room only after a delay once focus leaves the container', () => {
    const { getByTestId, queryByTestId } = render(<Harness enabled />)
    act(() => { getByTestId('field').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { getByTestId('outside').focus() })
    act(() => { vi.advanceTimersByTime(100) })
    expect(queryByTestId('room')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(400) })
    expect(queryByTestId('room')).toBeNull()
  })

  it('never engages when the keyboard is reported (iOS, Android 11+)', () => {
    setGeometry(740, 740, 300)
    const { getByTestId, queryByTestId } = render(<Harness enabled />)
    act(() => { getByTestId('field').focus() })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(queryByTestId('room')).toBeNull()
  })

  it('never engages off Android', () => {
    const { getByTestId, queryByTestId } = render(<Harness enabled={false} />)
    act(() => { getByTestId('field').focus() })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(queryByTestId('room')).toBeNull()
  })

  it('releases the room when Continue swaps the step, so it never squeezes the next one', () => {
    const { getByTestId, queryByTestId } = render(<StepHarness />)
    act(() => { getByTestId('field').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    expect(queryByTestId('room')).not.toBeNull()
    act(() => {
      fireEvent.blur(getByTestId('field'), { relatedTarget: getByTestId('continue') })
      getByTestId('continue').focus()
    })
    act(() => { fireEvent.click(getByTestId('continue')) })
    expect(queryByTestId('collectives')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(queryByTestId('room')).toBeNull()
  })

  it('still opens the room for a field on the step after a swap', () => {
    const { getByTestId, queryByTestId } = render(<StepHarness />)
    act(() => { getByTestId('field').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { getByTestId('continue').focus() })
    act(() => { fireEvent.click(getByTestId('continue')) })
    act(() => { getByTestId('field-next').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    expect(queryByTestId('room')).not.toBeNull()
  })

  it('stays closed for a field inside the step\'s own scroller (collective search)', () => {
    const { getByTestId, queryByTestId } = render(<NestedHarness />)
    act(() => { getByTestId('search').focus() })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(queryByTestId('room')).toBeNull()
  })
})

describe('insideNestedScroller', () => {
  it('stops at the room scroller, so a plain step still gets the room', () => {
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    const field = document.createElement('input')
    scroller.appendChild(field)
    expect(insideNestedScroller(field, scroller)).toBe(false)
    const list = document.createElement('div')
    list.style.overflowY = 'auto'
    scroller.appendChild(list)
    const search = document.createElement('input')
    list.appendChild(search)
    expect(insideNestedScroller(search, scroller)).toBe(true)
  })
})
