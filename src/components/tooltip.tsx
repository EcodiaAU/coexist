import {
  Children,
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

/**
 * Global hover / focus tooltip layer.
 *
 * Mount ONCE near the app root (`<TooltipLayer />`). It then shows a styled
 * tooltip for any icon-only control on the page - a `<button>`, `[role="button"]`
 * or `<a>` whose visible text is empty - that carries an accessible label. This
 * covers both the `<Button>` component and raw `<button>` elements identically,
 * with no per-button wrappers.
 *
 * Label source, in priority order:
 *   1. `data-tooltip="..."`  (explicit; also works on non-icon controls)
 *   2. `aria-label="..."`     (icon-only controls only)
 *   3. `title="..."`          (icon-only controls only; native title suppressed
 *                              while our tooltip is shown, so there is no double)
 *
 * Triggers:
 *   - Pointer hover, only on hover-capable devices - so it never sticks on touch.
 *   - Keyboard focus (`:focus-visible`), so it does not appear after a mouse click.
 *
 * To give an icon-only button a tooltip, just give it an `aria-label` (which you
 * want for screen readers anyway). No import, no wrapper.
 */

const TRIGGER_SELECTOR = 'button, [role="button"], a[href], [data-tooltip]'
const HOVER_DELAY = 250
const GAP = 8
const MARGIN = 8

type Side = 'top' | 'bottom'

function resolveLabel(el: HTMLElement): string | null {
  const explicit = el.dataset.tooltip
  if (explicit != null) return explicit.trim() || null
  // Only icon-only controls (no visible text) fall back to aria-label / title.
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text) return null
  const aria = el.getAttribute('aria-label')
  if (aria && aria.trim()) return aria.trim()
  const title = el.getAttribute('title')
  if (title && title.trim()) return title.trim()
  return null
}

function focusIsVisible(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

export function TooltipLayer() {
  const [active, setActive] = useState<{ label: string; el: HTMLElement } | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; side: Side }>({
    top: 0,
    left: 0,
    side: 'top',
  })
  const tipRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingRef = useRef<HTMLElement | null>(null)
  const suppressedTitleRef = useRef<{ el: HTMLElement; title: string } | null>(null)
  const shouldReduceMotion = useReducedMotion()

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = undefined
    pendingRef.current = null
  }

  const restoreTitle = useCallback(() => {
    const s = suppressedTitleRef.current
    if (s) {
      s.el.setAttribute('title', s.title)
      suppressedTitleRef.current = null
    }
  }, [])

  const close = useCallback(() => {
    clearTimer()
    restoreTitle()
    setActive(null)
  }, [restoreTitle])

  const openFor = useCallback((el: HTMLElement, immediate: boolean) => {
    const label = resolveLabel(el)
    if (!label) return
    clearTimer()
    const run = () => {
      // Suppress the native title tooltip so it does not double up.
      const title = el.getAttribute('title')
      if (title) {
        suppressedTitleRef.current = { el, title }
        el.removeAttribute('title')
      }
      pendingRef.current = null
      setActive({ label, el })
    }
    if (immediate) {
      run()
    } else {
      pendingRef.current = el
      timerRef.current = setTimeout(run, HOVER_DELAY)
    }
  }, [])

  useEffect(() => {
    const hoverCapable =
      typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches

    const closest = (t: EventTarget | null) =>
      t instanceof Element ? t.closest<HTMLElement>(TRIGGER_SELECTOR) : null

    const onOver = (e: PointerEvent) => {
      if (!hoverCapable) return
      const el = closest(e.target)
      if (!el || el === active?.el || el === pendingRef.current) return
      openFor(el, false)
    }
    const onOut = (e: PointerEvent) => {
      const el = closest(e.target)
      if (!el) return
      const related = e.relatedTarget as Node | null
      if (related && el.contains(related)) return
      if (el === active?.el || el === pendingRef.current) close()
    }
    const onFocusIn = (e: FocusEvent) => {
      const el = closest(e.target)
      if (!el || !focusIsVisible(el)) return
      openFor(el, true)
    }
    const onFocusOut = () => close()
    const onPointerDown = () => close()
    const onScroll = () => close()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }

    document.addEventListener('pointerover', onOver, true)
    document.addEventListener('pointerout', onOut, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerout', onOut, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('keydown', onKey, true)
      clearTimer()
      restoreTitle()
    }
  }, [active, openFor, close, restoreTitle])

  // Position synchronously before paint (no flash at 0,0).
  useLayoutEffect(() => {
    if (!active) return
    const tip = tipRef.current
    if (!tip) return
    const r = active.el.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    let side: Side = 'top'
    if (r.top - t.height - GAP < MARGIN) side = 'bottom'
    const top = side === 'top' ? r.top - t.height - GAP : r.bottom + GAP
    const left = Math.max(
      MARGIN,
      Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - MARGIN),
    )
    setCoords({ top, left, side })
  }, [active])

  return createPortal(
    <AnimatePresence>
      {active ? (
        <motion.div
          ref={tipRef}
          role="tooltip"
          initial={
            shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: coords.side === 'top' ? 4 : -4, scale: 0.96 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: coords.side === 'top' ? 4 : -4, scale: 0.96 }
          }
          transition={{ duration: 0.12, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className={cn(
            'max-w-[240px] rounded-md bg-neutral-900 px-2 py-1',
            'text-xs font-medium leading-snug text-center text-white',
            'shadow-sm',
          )}
        >
          {active.label}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export interface TooltipProps {
  /** Text shown on hover / focus. */
  label: string
  /** A single element to attach the tooltip to. Works on native DOM elements. */
  children: ReactElement
}

/**
 * Convenience wrapper that stamps `data-tooltip` on its child so the global
 * `<TooltipLayer />` picks it up. Use for explicit tooltips on native elements
 * (including controls that DO show text). For the `<Button>` component, set an
 * `aria-label` instead - it forwards that to the DOM, whereas arbitrary props
 * are not forwarded.
 */
export function Tooltip({ label, children }: TooltipProps) {
  const child = Children.only(children) as ReactElement<Record<string, unknown>>
  return cloneElement(child, { 'data-tooltip': label } as Record<string, unknown>)
}
