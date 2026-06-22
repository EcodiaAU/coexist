'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'

/**
 * Animated sage-highlight keyword. On hover it ROLLS through alternate words
 * (odometer/turn): the vertical track translates up one slot per word and the
 * highlight box width animates to the active word, so it reads as a clean
 * mechanical turn rather than a crossfade. Falls back to the first word with no
 * JS / no hover / reduced motion.
 */
export function WordSwap({ words }: { words: string[] }) {
  const [i, setI] = useState(0)
  const [width, setWidth] = useState<number | undefined>(undefined)
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep the box width matched to the active word (animated via CSS transition).
  useLayoutEffect(() => {
    const el = wordRefs.current[i]
    if (el) setWidth(el.offsetWidth)
  }, [i])

  useEffect(() => {
    // set initial width once fonts settle
    const el = wordRefs.current[0]
    if (el) setWidth(el.offsetWidth)
    const t = setTimeout(() => {
      const e0 = wordRefs.current[0]
      if (e0) setWidth(e0.offsetWidth)
    }, 300)
    return () => clearTimeout(t)
  }, [])

  const start = () => {
    if (timer.current || words.length < 2) return
    timer.current = setInterval(() => setI((v) => (v + 1) % words.length), 1500)
  }
  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
    setI(0)
  }

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  return (
    <span
      className="mark wordroll"
      onMouseEnter={start}
      onMouseLeave={stop}
      style={{ width }}
      aria-label={words[0]}
    >
      <span className="wordroll-track" style={{ transform: `translateY(-${i * 1.12}em)` }}>
        {words.map((w, idx) => (
          <span
            key={w}
            ref={(el) => { wordRefs.current[idx] = el }}
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
