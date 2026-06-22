'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'

/**
 * Animated sage-highlight keyword. On hover it ROLLS through alternate phrases
 * (odometer/turn): the vertical track moves up one 1.5em slot per phrase and
 * the box width animates to the active phrase. Padding lives on the word spans
 * so the measured width includes it (never clips horizontally); the 1.5em slot
 * fits ascenders + descenders (never clips vertically). First phrase shows with
 * no JS / no hover / reduced motion.
 */
export function WordSwap({ words }: { words: string[] }) {
  const [i, setI] = useState(0)
  const [width, setWidth] = useState<number | undefined>(undefined)
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const measure = (idx: number) => {
    const el = refs.current[idx]
    if (el) setWidth(el.getBoundingClientRect().width)
  }

  useLayoutEffect(() => { measure(i) }, [i])

  useEffect(() => {
    let cancelled = false
    const m = () => { if (!cancelled) measure(0) }
    // Measure once the brand font is actually applied, else width is wrong.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(m)
    }
    const t = setTimeout(m, 450)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = () => {
    if (timer.current || words.length < 2) return
    timer.current = setInterval(() => setI((v) => (v + 1) % words.length), 1600)
  }
  const stop = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    setI(0)
  }

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  return (
    <span
      className="wordroll"
      onMouseEnter={start}
      onMouseLeave={stop}
      style={{ width }}
      aria-label={words[0]}
    >
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
