import type { Suite } from './types'

/**
 * Accent class config per suite (main vs leader).
 *
 * Lives in its own module (not nav-list.tsx) so that fast-refresh
 * works on SidebarNavList - the rule requires component files to
 * export only components.
 */
export function getAccentClasses(suite: Suite) {
  const isMoss = suite === 'leader'
  return {
    borderColor: 'border-neutral-100',
    dividerColor: 'bg-neutral-100',
    activeClasses: isMoss
      ? 'bg-moss-50/70 text-moss-800 font-medium'
      : 'bg-primary-50/80 text-primary-700 font-medium',
    hoverClasses: isMoss
      ? 'text-neutral-500 hover:bg-neutral-50 hover:text-moss-700'
      : 'text-neutral-500 hover:bg-neutral-50/50 hover:text-neutral-900',
    indicatorFrom: isMoss ? 'from-moss-400' : 'from-primary-500',
    indicatorTo: isMoss ? 'to-moss-600' : 'to-primary-700',
    dotColor: isMoss ? 'bg-moss-500' : 'bg-primary-600',
    focusRing: isMoss ? 'focus-visible:ring-moss-400' : 'focus-visible:ring-primary-400',
    collapseHover: isMoss
      ? 'hover:text-primary-600 hover:bg-neutral-50'
      : 'hover:text-primary-600 hover:bg-neutral-50',
  }
}
