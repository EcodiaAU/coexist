import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { useBlindKeyboardRoom, keyboardInvisibleToLayout, blindKeyboardRoom } from '@/hooks/use-blind-keyboard-room'

/*
 * Android 10 under adjustNothing never reports the keyboard (see
 * use-blind-keyboard-room.ts). These cases pin the two halves that matter:
 * the room appears only when the keyboard is invisible to layout, and it does
 * not disappear between the blur of a field and the click on Continue.
 */

function Harness({ enabled }: { enabled: boolean }) {
  const room = useBlindKeyboardRoom(enabled)
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
})
