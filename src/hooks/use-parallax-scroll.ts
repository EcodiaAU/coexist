import { useEffect, useLayoutEffect, useRef, useCallback, type RefObject } from 'react'

/**
 * DOM-driven parallax hook - bypasses framer-motion's React render cycle
 * so transforms update every frame on mobile (iOS WebKit + Capacitor).
 *
 * Returns a `register` function: call it with a ref and parallax config
 * to wire up a DOM element. The hook writes `transform` directly via rAF,
 * guaranteeing smooth 60fps parallax on both desktop and mobile.
 */

export interface ParallaxLayerConfig {
  /** Scroll range [0 → scrollEnd] mapped to [0 → yRange] pixels of translateY */
  yRange?: number
  /** Scroll range end (default 500) */
  scrollEnd?: number
  /** Also scale from 1 → scaleEnd over [0 → scaleScrollEnd] */
  scaleEnd?: number
  scaleScrollEnd?: number
  /** Fade opacity from 1 → opacityEnd over [0 → opacityScrollEnd] */
  opacityEnd?: number
  opacityScrollEnd?: number
}

interface RegisteredLayer {
  ref: RefObject<HTMLElement | null>
  config: Required<ParallaxLayerConfig>
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function lerp(scroll: number, scrollEnd: number, start: number, end: number) {
  const t = clamp(scroll / scrollEnd, 0, 1)
  return start + (end - start) * t
}

/**
 * Core parallax engine. Attaches to both `window` and `#main-content`
 * scroll containers and drives registered layers via direct DOM writes.
 *
 * Respects prefers-reduced-motion at the OS level.
 */
export function useParallaxEngine() {
  const layersRef = useRef<RegisteredLayer[]>([])
  const rafRef = useRef<number>(0)
  const containerRef = useRef<HTMLElement | null>(null)
  const reducedMotion = useRef(false)

  // Check reduced motion preference
  useLayoutEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = mq.matches
    const handler = (e: MediaQueryListEvent) => { reducedMotion.current = e.matches }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Grab scroll container - prefer #main-content (Page), fall back to
  // [data-parallax-scroll] (AdminLayout) so parallax works everywhere.
  useLayoutEffect(() => {
    containerRef.current =
      document.getElementById('main-content') ??
      document.querySelector<HTMLElement>('[data-parallax-scroll]')
  })

  // The animation tick - reads scroll, writes transforms
  const tick = useCallback(() => {
    if (reducedMotion.current) return

    const winY = window.scrollY || 0
    const cY = containerRef.current ? containerRef.current.scrollTop : 0
    const scroll = Math.max(winY, cY)

    for (const layer of layersRef.current) {
      const el = layer.ref.current
      if (!el) continue

      const { yRange, scrollEnd, scaleEnd, scaleScrollEnd, opacityEnd, opacityScrollEnd } = layer.config

      const y = lerp(scroll, scrollEnd, 0, yRange)
      const scale = scaleEnd !== 1 ? lerp(scroll, scaleScrollEnd, 1, scaleEnd) : 1
      const opacity = opacityEnd !== 1 ? lerp(scroll, opacityScrollEnd, 1, opacityEnd) : -1 // -1 = don't touch

      // Write directly - no React, no framer-motion
      el.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`
      if (opacity >= 0) {
        el.style.opacity = String(opacity)
      }
    }
  }, [])

  // Set up scroll listeners + continuous rAF loop for mobile
  // Mobile WebKit (iOS Safari + Capacitor) throttles scroll events during
  // momentum scrolling, so event-driven updates stall. Instead we run a
  // continuous rAF loop that polls scroll position every frame - guarantees
  // smooth parallax on all platforms including mobile momentum scroll.
  useEffect(() => {
    // Seed initial position
    tick()

    let running = true
    const loop = () => {
      if (!running) return
      tick()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [tick])

  /** Register a DOM ref as a parallax layer. Call in the component body. */
  const register = useCallback((ref: RefObject<HTMLElement | null>, config: ParallaxLayerConfig = {}) => {
    const full: Required<ParallaxLayerConfig> = {
      yRange: config.yRange ?? 0,
      scrollEnd: config.scrollEnd ?? 500,
      scaleEnd: config.scaleEnd ?? 1,
      scaleScrollEnd: config.scaleScrollEnd ?? 400,
      opacityEnd: config.opacityEnd ?? 1,
      opacityScrollEnd: config.opacityScrollEnd ?? 300,
    }

    // Avoid duplicate registrations for the same ref
    const existing = layersRef.current.findIndex((l) => l.ref === ref)
    if (existing >= 0) {
      layersRef.current[existing] = { ref, config: full }
    } else {
      layersRef.current.push({ ref, config: full })
    }
  }, [])

  /** Unregister a layer (call in cleanup / useEffect return) */
  const unregister = useCallback((ref: RefObject<HTMLElement | null>) => {
    layersRef.current = layersRef.current.filter((l) => l.ref !== ref)
  }, [])

  return { register, unregister }
}

/* ------------------------------------------------------------------ */
/*  Convenience hook - pre-built 3-layer hero (bg, fg, text)           */
/* ------------------------------------------------------------------ */

export function useParallaxLayers(opts?: {
  textRange?: number
  bgRange?: number
  fgRange?: number
  withScale?: boolean
  withOpacity?: boolean
}) {
  const {
    textRange = 120,
    bgRange = 80,
    fgRange = 25,
    withScale = true,
    withOpacity = false,
  } = opts ?? {}

  const bgRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  const { register, unregister } = useParallaxEngine()

  useEffect(() => {
    register(bgRef, { yRange: bgRange, scrollEnd: 500, scaleEnd: withScale ? 1.08 : 1, scaleScrollEnd: 400 })
    register(fgRef, { yRange: fgRange, scrollEnd: 500 })
    register(textRef, {
      yRange: textRange,
      scrollEnd: 500,
      opacityEnd: withOpacity ? 0 : 1,
      opacityScrollEnd: 300,
    })

    return () => {
      unregister(bgRef)
      unregister(fgRef)
      unregister(textRef)
    }
  }, [register, unregister, bgRange, fgRange, textRange, withScale, withOpacity])

  return { bgRef, fgRef, textRef }
}

/* ------------------------------------------------------------------ */
/*  Legacy compat - useParallaxScroll still exported for shop hero     */
/* ------------------------------------------------------------------ */

export function useParallaxScroll() {
  const { register, unregister } = useParallaxEngine()
  return { register, unregister }
}
