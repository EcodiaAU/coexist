/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'

interface MenuSheetContextValue {
  open: boolean
  openMenu: () => void
  closeMenu: () => void
  toggleMenu: () => void
}

const MenuSheetContext = createContext<MenuSheetContextValue | null>(null)

export function MenuSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const openMenu = useCallback(() => setOpen(true), [])
  const closeMenu = useCallback(() => setOpen(false), [])
  const toggleMenu = useCallback(() => setOpen((p) => !p), [])

  const value = useMemo(
    () => ({ open, openMenu, closeMenu, toggleMenu }),
    [open, openMenu, closeMenu, toggleMenu],
  )

  return (
    <MenuSheetContext.Provider data-eos-id="src/hooks/use-menu-sheet.tsx#0" value={value}>
      {children}
    </MenuSheetContext.Provider>
  )
}

export function useMenuSheet() {
  const ctx = useContext(MenuSheetContext)
  if (!ctx) throw new Error('useMenuSheet must be used within MenuSheetProvider')
  return ctx
}
