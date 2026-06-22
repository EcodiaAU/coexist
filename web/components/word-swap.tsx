'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'

/**
 * Animated sage-highlight keyword. It AUTO-rolls through alternate phrases on a
 * gentle cadence (no hover needed): the vertical track moves up one 1.5em slot
 * per phrase and the box width animates to the active phrase. Padding lives on
 * the word spans so the measured width includes it (never clips horizontally);
 * the 1.5em slot fits ascenders + descenders (never clips vertically). Pauses
 * for reduced-motion and shows the first phrase if JS is off.
 */
export function WordSwap({ words, interval = 2400 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0)
  const [width, setWidth] = useState<number | undefined>(undefined)
  const refs = useRef<(HTMLSpanElement | null)[]>([])

  const measure = (idx: number) => {
    const el = refs.current[idx]
    if (el) setWidth(el.getBoundingClientRect().width)
  }

  useLayoutEffect(() => { measure(i) }, [i])

  useEffect(() => {
    let cancelled = false
    const m = () => { if (!cancelled) measure(0) }
    if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(m)
    const t = setTimeout(m, 450)

    const reduce = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let timer: ReturnType<typeof setInterval> | null = null
    if (!reduce && words.length > 1) {
      timer = setInterval(() => setI((v) => (v + 1) % words.length), interval)
    }
    return () => { cancelled = true; clearTimeout(t); if (timer) clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span className="wordroll" style={{ width }} aria-label={words[0]}>
      <span className="wordroll-track" style={{ transform: `translateY(-${i * 1.5}em)` }}>
        {words.map((w, idx) => (
          <span
            key={w}
            ref={(el) => { refs.current[idx] = el }}
            className="wordroll-word"
            aria-hidden={idx !== i}
          >
            {w}
          </span>
        ))}
      </span>
    </span>
  )
}
