import { useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '@/components/bottom-sheet'

/**
 * Presents a routed detail page as a bottom sheet over the still-mounted
 * background list (react-router backgroundLocation pattern in App.tsx).
 *
 * When a list tap navigates with `state.backgroundLocation`, App renders the
 * background route (the list) underneath AND this sheet on top, so the list
 * keeps its scroll position for free. Closing via the sheet's own affordances
 * (backdrop tap, drag-down, Escape) plays the slide-down, then pops the history
 * entry so the background list is restored. Hardware/browser back and the detail
 * page's own Header-back also pop the entry, which unmounts this sheet.
 *
 * A direct URL to the same route (no backgroundLocation) renders the detail as a
 * normal full page instead - this wrapper is never involved.
 */
export function RouteSheet({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)

  const close = useCallback(() => {
    // Play the slide-down, then pop the history entry so the background list
    // (still mounted underneath) is restored with its scroll intact. The delay
    // matches the sheet's 300ms transform transition so the animation finishes
    // before the sheet unmounts (a shorter wait clipped the last frames = a snap).
    setOpen(false)
    window.setTimeout(() => navigate(-1), 300)
  }, [navigate])

  return (
    <BottomSheet open={open} onClose={close} bare>
      {children}
    </BottomSheet>
  )
}
