import { useEffect, useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { cn } from '@/lib/cn'
import { useKeyboardHeight } from '@/hooks/use-keyboard-height'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/* ====================================================================== */
/*  Modal - the canonical local (non-route) modal primitive.              */
/*                                                                        */
/*  ADOPT-AND-RESTYLE (Lane 7, 2026-08-21): built on the OSS primitives   */
/*  added in Lane 0 - `vaul` for the mobile bottom sheet (drag-dismiss)   */
/*  and shadcn `Dialog` (Radix) for the centred desktop dialog - restyled */
/*  to the olive tokens (surface-0 card, neutral border, primary ring).   */
/*  It replaces the hand-rolled `createPortal` + `fixed inset-0` scrim     */
/*  that ~11 local dialogs each reimplemented. Each migrated dialog keeps  */
/*  its own inner content, props and close behaviour and hands it to this  */
/*  shell as `children`.                                                   */
/*                                                                        */
/*  This is the LOCAL modal (controlled open/onClose, state-driven). The  */
/*  routed-page-in-a-sheet chain (`BottomSheet` -> `RouteSheet` -> full    */
/*  `<Page>`) that the explore event-detail sheet uses is a separate,      */
/*  route-aware primitive and is intentionally NOT replaced here - it      */
/*  layers on top of the same sheet idea for the back/Escape/scroll-keep   */
/*  routing case. Use `Modal` for a local dialog; use `RouteSheet` (via a  */
/*  `navigate(..., { state: { backgroundLocation }})`) for a routed page.  */
/*                                                                        */
/*  Mobile   (< 640px): vaul Drawer - bottom sheet, olive shell, grab      */
/*                      handle + drag-dismiss when `dismissible`.          */
/*  Desktop  (>= 640px): shadcn Dialog - centred, olive shell, spring/fade */
/*                      via the shadcn animation utilities.                */
/*                                                                        */
/*  `dismissible={false}` makes it a blocking gate: no backdrop tap, no    */
/*  Escape, no drag, no close button (used by phone-gate / dietary-gate).  */
/*  `keyboardAware` lifts the mobile sheet above the on-screen keyboard     */
/*  using `useKeyboardHeight` (the Capacitor plugin signal that works       */
/*  under `Keyboard.resize:'none'`, where visualViewport never changes -    */
/*  the RCA-2026-07-06 phone-gate fix); Vaul's own visualViewport-based     */
/*  reposition is turned off in that mode so the two never fight.           */
/* ====================================================================== */

const DESKTOP_BREAKPOINT = 640

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

export interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** false = blocking: no backdrop tap / Escape / drag / close button. Default true. */
  dismissible?: boolean
  /** Accessible name (a visually-hidden title is rendered from it to satisfy a11y). */
  ariaLabel?: string
  /** Extra classes on the surface card (e.g. `sm:max-w-md`, custom radius). */
  className?: string
  /** Lift the mobile sheet above the on-screen keyboard via useKeyboardHeight. */
  keyboardAware?: boolean
  /**
   * Explicit px offset to lift the mobile sheet above the keyboard, taking
   * precedence when larger than the internal useKeyboardHeight reading. Lets a
   * caller pass its own hardened inset (e.g. phone-gate's estimate fallback for
   * a missed keyboardWillShow under iOS Keyboard.resize:'none'). Implies
   * keyboard-aware mode (Vaul's own reposition is turned off).
   */
  keyboardInset?: number
}

export function Modal({
  open,
  onClose,
  children,
  dismissible = true,
  ariaLabel = 'Dialog',
  className,
  keyboardAware = false,
  keyboardInset,
}: ModalProps) {
  const isDesktop = useIsDesktop()
  const keyboardHeight = useKeyboardHeight()
  const kbActive = keyboardAware || keyboardInset != null
  const kbOffset = Math.max(keyboardAware ? keyboardHeight : 0, keyboardInset ?? 0)

  /* ---- Desktop: centred shadcn Dialog ---- */
  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && dismissible) onClose()
        }}
      >
        <DialogContent
          data-eos-id="src/components/modal.tsx#desktop"
          showCloseButton={dismissible}
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
          className={cn(
            // Olive shell: surface-0 card, neutral border, own scroller, no default grid/padding.
            'flex max-h-[88vh] flex-col overflow-hidden border-neutral-200 bg-surface-0 p-0 sm:max-w-md',
            className,
          )}
        >
          <DialogTitle className="sr-only">{ariaLabel}</DialogTitle>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </DialogContent>
      </Dialog>
    )
  }

  /* ---- Mobile: vaul bottom sheet ---- */
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && dismissible) onClose()
      }}
      dismissible={dismissible}
      // Own the keyboard offset (useKeyboardHeight / explicit inset) in
      // keyboard-aware mode; otherwise let Vaul reposition inputs itself.
      repositionInputs={!kbActive}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          data-eos-id="src/components/modal.tsx#overlay"
          className="fixed inset-0 z-[200] bg-black/50"
        />
        <Drawer.Content
          data-eos-id="src/components/modal.tsx#mobile"
          aria-label={ariaLabel}
          className={cn(
            'fixed inset-x-0 bottom-0 z-[201] flex max-h-[92vh] flex-col rounded-t-2xl bg-surface-0 shadow-sm outline-none ring-1 ring-primary-400/10',
            className,
          )}
          // Lift the whole sheet above the keypad. Vaul positions Content with a
          // transform for the open/drag animation and does not touch `bottom`,
          // so overriding `bottom` composes with it (same mechanism the raw
          // phone-gate used before this migration).
          style={kbActive && kbOffset > 0 ? { bottom: kbOffset } : undefined}
        >
          <Drawer.Title className="sr-only">{ariaLabel}</Drawer.Title>
          {dismissible && (
            <div
              className="mx-auto mt-3 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300"
              aria-hidden="true"
            />
          )}
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)' }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
