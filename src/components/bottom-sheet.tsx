import { useEffect, useRef, useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useKeyboardHeight } from '@/hooks/use-keyboard-height'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Snap points as fractions of viewport height (0-1). E.g. [0.4, 0.8] */
  snapPoints?: number[]
  /** Index into snapPoints for the initial snap position */
  initialSnap?: number
  className?: string
}

const MAX_HEIGHT_FRACTION = 0.92
const DESKTOP_BREAKPOINT = 640
const DISMISS_VELOCITY = 0.35  // px/ms
const DISMISS_DISTANCE = 0.25  // fraction of sheet height

const instantTransition = { duration: 0 }

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

/* ====================================================================== */
/*  Mobile bottom sheet  no framer, pure CSS transitions + touch events  */
/* ====================================================================== */

function MobileSheet({
  open,
  onClose,
  children,
  maxHeight,
  keyboardHeight,
  className,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  maxHeight: number
  keyboardHeight: number
  className?: string
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const hasFocusedRef = useRef(false)

  // Track mount state for enter/exit animation
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  // Mount → visible (triggers CSS transition in)
  /* eslint-disable react-hooks/set-state-in-effect -- intentional cascading render for CSS transition */
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement
      setMounted(true)
      // Double-rAF to ensure the element is in the DOM at translateY(100%) before we transition to 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else if (mounted) {
      // Animate out
      setVisible(false)
      // Restore focus to previously focused element
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
      // Fallback unmount  transitionend can be unreliable (e.g. if already at final position)
      const timer = setTimeout(() => setMounted(false), 350)
      return () => clearTimeout(timer)
    }
  }, [open, mounted])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Also unmount when transition actually ends (whichever comes first)
  const onTransitionEnd = useCallback((e: React.TransitionEvent) => {
    // Only react to the sheet's own transform transition, not children bubbling
    if (e.propertyName === 'transform' && !visible && !open) setMounted(false)
  }, [visible, open])

  // Body scroll lock
  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = 'hidden'
    }
    return () => { document.body.style.overflow = '' }
  }, [mounted])

  // Reset scroll to top on open
  useEffect(() => {
    if (visible && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [visible])

  // Escape key
  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mounted, onClose])

  // Auto-focus first input
  useEffect(() => {
    if (visible && !hasFocusedRef.current) {
      hasFocusedRef.current = true
      const timer = setTimeout(() => {
        const focusable = sheetRef.current?.querySelector<HTMLElement>(
          'input, textarea, select, [tabindex]:not([tabindex="-1"])',
        )
        focusable?.focus({ preventScroll: true })
      }, 120)
      return () => clearTimeout(timer)
    }
    if (!visible) hasFocusedRef.current = false
  }, [visible])

  // Focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }, [])

  /* ---- Touch drag on handle ---- */
  const dragState = useRef<{ startY: number; startTime: number } | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    dragState.current = { startY: touch.clientY, startTime: Date.now() }
    // Remove transition during drag for instant response
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.current || !sheetRef.current) return
    const touch = e.touches[0]
    const dy = Math.max(0, touch.clientY - dragState.current.startY)
    sheetRef.current.style.transform = `translateY(${dy}px)`
    // Fade backdrop
    if (backdropRef.current) {
      backdropRef.current.style.opacity = String(Math.max(0, 1 - dy / maxHeight))
    }
  }, [maxHeight])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragState.current || !sheetRef.current) return
    const touch = e.changedTouches[0]
    const dy = Math.max(0, touch.clientY - dragState.current.startY)
    const dt = Date.now() - dragState.current.startTime
    const velocity = dt > 0 ? dy / dt : 0
    dragState.current = null

    // Re-enable transition
    sheetRef.current.style.transition = ''

    if (velocity > DISMISS_VELOCITY || dy > maxHeight * DISMISS_DISTANCE) {
      // Dismiss
      sheetRef.current.style.transform = 'translateY(100%)'
      if (backdropRef.current) backdropRef.current.style.opacity = '0'
      // Wait for transition then close
      setTimeout(onClose, 250)
    } else {
      // Snap back
      sheetRef.current.style.transform = 'translateY(0)'
      if (backdropRef.current) backdropRef.current.style.opacity = ''
    }
  }, [maxHeight, onClose])

  /* ---- Scroll hint ---- */
  const [canScrollDown, setCanScrollDown] = useState(false)
  useEffect(() => {
    if (!visible) return
    const el = scrollRef.current
    if (!el) return
    let rafId = 0
    const check = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
      })
    }
    const initialRaf = requestAnimationFrame(() => {
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
    })
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { cancelAnimationFrame(initialRaf); cancelAnimationFrame(rafId); el.removeEventListener('scroll', check); ro.disconnect() }
  }, [visible])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50" style={!visible ? { pointerEvents: 'none' } : undefined}>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/50"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease-out',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Bottom sheet"
        onKeyDown={handleKeyDown}
        className={cn(
          'fixed inset-x-0 bottom-0 z-10 bg-surface-0 rounded-t-md shadow-sm flex flex-col',
          className,
        )}
        style={{
          maxHeight: keyboardHeight > 0 ? maxHeight - keyboardHeight : maxHeight,
          bottom: keyboardHeight > 0 ? keyboardHeight : 0,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.25s ease-out, max-height 0.25s ease-out',
        }}
        onTransitionEnd={onTransitionEnd}
      >
        {/* Grab handle  touch target for dragging */}
        <div
          className="flex justify-center py-3 cursor-grab active:cursor-grabbing select-none shrink-0"
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.75rem)', touchAction: 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="h-1 w-10 rounded-full bg-primary-200" aria-hidden="true" />
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="overflow-y-auto overscroll-contain px-5 flex-1 min-h-0 hide-scrollbar"
          style={{
            paddingBottom: keyboardHeight > 0
              ? `calc(${keyboardHeight}px + 1.5rem)`
              : 'max(env(safe-area-inset-bottom, 0px), 1.5rem)',
          }}
        >
          {children}
        </div>

        {/* Scroll hint gradient */}
        {canScrollDown && (
          <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-surface-0 to-transparent rounded-b-md pointer-events-none" />
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ====================================================================== */
/*  Main export  desktop uses framer centred modal, mobile uses above    */
/* ====================================================================== */

export function BottomSheet({
  open,
  onClose,
  children,
  snapPoints: _snapPoints = [0.5],
  initialSnap: _initialSnap = 0,
  className,
}: BottomSheetProps) {
  const shouldReduceMotion = useReducedMotion()
  const isDesktop = useIsDesktop()
  const keyboardHeight = useKeyboardHeight()

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const maxHeight = vh * MAX_HEIGHT_FRACTION

  /* ---- If mobile, delegate entirely to MobileSheet ---- */
  if (!isDesktop) {
    return (
      <MobileSheet open={open} onClose={onClose} maxHeight={maxHeight} keyboardHeight={keyboardHeight} className={className}>
        {children}
      </MobileSheet>
    )
  }

  /* ==================================================================== */
  /*  Desktop: centred modal (unchanged from original)                     */
  /* ==================================================================== */
  return <DesktopModal
    open={open}
    onClose={onClose}
    className={className}
    shouldReduceMotion={shouldReduceMotion ?? false}
  >
    {children}
  </DesktopModal>
}

function DesktopModal({
  open,
  onClose,
  children,
  className,
  shouldReduceMotion,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  shouldReduceMotion: boolean
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Body scroll lock
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
    }
    return () => {
      if (!open) return
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [open])

  // Auto-focus first input
  const hasFocusedRef = useRef(false)
  useEffect(() => {
    if (open && !hasFocusedRef.current) {
      hasFocusedRef.current = true
      const timer = setTimeout(() => {
        const focusable = sheetRef.current?.querySelector<HTMLElement>(
          'input, textarea, select, [tabindex]:not([tabindex="-1"])',
        )
        focusable?.focus({ preventScroll: true })
      }, 120)
      return () => clearTimeout(timer)
    }
    if (!open) hasFocusedRef.current = false
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }, [])

  // Scroll hint
  const [canScrollDown, setCanScrollDown] = useState(false)
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (!el) return
    let rafId = 0
    const check = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
      })
    }
    const initialRaf = requestAnimationFrame(() => {
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
    })
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { cancelAnimationFrame(initialRaf); cancelAnimationFrame(rafId); el.removeEventListener('scroll', check); ro.disconnect() }
  }, [open])

  const backdropTransition = shouldReduceMotion
    ? instantTransition
    : { duration: 0.2, ease: 'easeOut' as const }

  const contentVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1, y: 0,
      transition: shouldReduceMotion
        ? instantTransition
        : { delay: 0.1, duration: 0.2, ease: 'easeOut' as const },
    },
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" aria-label="Dialog">
          <motion.div
            className="fixed inset-0 bg-black/50 gpu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: backdropTransition }}
            exit={{ opacity: 0, transition: shouldReduceMotion ? instantTransition : { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label="Dialog"
              className={cn(
                'relative w-full max-w-md bg-surface-0 rounded-md shadow-sm pointer-events-auto gpu-panel',
                className,
              )}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 12 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
              transition={shouldReduceMotion ? instantTransition : { type: 'spring', stiffness: 260, damping: 28, mass: 0.6 }}
              onKeyDown={handleKeyDown}
            >
              <motion.div
                ref={scrollRef}
                className="overflow-y-auto overscroll-contain px-5 py-6 hide-scrollbar"
                style={{ maxHeight: '80vh' }}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
              >
                {children}
              </motion.div>
              <AnimatePresence>
                {canScrollDown && (
                  <motion.div
                    className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-surface-0 to-transparent rounded-b-md pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
