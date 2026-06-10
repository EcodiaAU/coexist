import { createContext, useContext } from 'react'

/**
 * Context so child components can know when the keyboard is open.
 *
 * Lives in its own module (not app-shell.tsx) so that fast-refresh
 * works on AppShell - components and non-component exports must not
 * coexist in the same file.
 */
export const KeyboardOpenContext = createContext(false)

export function useKeyboardOpen() {
  return useContext(KeyboardOpenContext)
}
