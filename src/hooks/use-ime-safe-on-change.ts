import { useRef, useCallback } from 'react'

type AnyInput = HTMLInputElement | HTMLTextAreaElement

/**
 * Returns props you can spread on a raw <input> / <textarea> to make its
 * onChange Samsung Keyboard + GBoard safe. While the IME is mid-composition
 * (predictive text, autocorrect, glide-typing), every keystroke would
 * otherwise trigger setState -> re-render and clobber the IME composing
 * buffer, producing dropped characters or visibly reversed text.
 *
 * Mirrors the same guard the canonical <Input> component already uses
 * (src/components/input.tsx). Use this for raw <input>s that can't be
 * refactored to the styled <Input> (e.g. when the layout is custom).
 *
 * Origin: 2026-06-01 Brandon Marlow (Samsung) screenshot of log-impact's
 * Species Planted field showing "ssaRg erIw euLB dNa ssaRg" instead of
 * "Grass Wire Blue and Grass". Same root cause as the 2026-05-16 signup
 * name-field-typing-backwards report.
 */
export function useImeSafeOnChange<E extends AnyInput>(
  onChange: ((value: string, ev: React.ChangeEvent<E>) => void) | undefined,
) {
  const composing = useRef(false)

  const onCompositionStart = useCallback(() => {
    composing.current = true
  }, [])

  const onCompositionEnd = useCallback(
    (e: React.CompositionEvent<E>) => {
      composing.current = false
      const target = e.currentTarget
      onChange?.(target.value, {
        ...e,
        target,
        currentTarget: target,
      } as unknown as React.ChangeEvent<E>)
    },
    [onChange],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<E>) => {
      if (composing.current) return
      onChange?.(e.currentTarget.value, e)
    },
    [onChange],
  )

  return {
    onChange: handleChange,
    onCompositionStart,
    onCompositionEnd,
  }
}
