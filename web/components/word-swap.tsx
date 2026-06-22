'use client'

import { useState, useRef, useEffect } from 'react'

/**
 * Animated sage-highlight keyword. On hover it smoothly cycles through
 * alternate words that still make sense in the sentence (a "reel"). All words
 * occupy the same grid cell so the highlight box stays a stable width and the
 * words crossfade + slide. Falls back to the first word with no JS / no hover.
 */
export function WordSwap({ words, className = '' }: { words: string[]; className?: string }) {
  const [i, setI] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = () => {
    if (timer.current || words.length < 2) return
    timer.current = setInterval(() => setI((v) => (v + 1) % words.length), 1150)
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
      className={`mark mark-reel ${className}`}
      onMouseEnter={start}
      onMouseLeave={stop}
      aria-label={words[0]}
    >
      {words.map((w, idx) => (
        <span
          key={w}
          aria-hidden={idx !== i}
          className="mark-reel-word"
          style={{
            opacity: idx === i ? 1 : 0,
            transform: idx === i ? 'translateY(0)' : 'translateY(0.4em)',
          }}
        >
          {w}
        </span>
      ))}
    </span>
  )
}
