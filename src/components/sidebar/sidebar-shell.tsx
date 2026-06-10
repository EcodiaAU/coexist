import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PanelLeftClose, Settings } from 'lucide-react'
import { cn } from '@/lib/cn'
import { APP_NAME } from '@/lib/constants'
import { useAuth } from '@/hooks/use-auth'
import { Avatar } from '@/components/avatar'
import { getAccentClasses } from './accent'

/* ------------------------------------------------------------------ */
/*  Widths                                                             */
/* ------------------------------------------------------------------ */

const EXPANDED_WIDTH = 'w-[240px]'
const COLLAPSED_WIDTH = 'w-[60px]'

/* ------------------------------------------------------------------ */
/*  SidebarShell                                                       */
/* ------------------------------------------------------------------ */

interface SidebarShellProps {
  collapsed: boolean
  onToggleCollapse: () => void
  children: ReactNode
}

export function SidebarShell({ collapsed, onToggleCollapse, children }: SidebarShellProps) {
  const location = useLocation()
  const { profile } = useAuth()
  const dAccent = getAccentClasses('main')

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col',
        'sticky top-0 self-start min-h-dvh max-h-dvh z-50',
        'bg-white',
        'border-r',
        'shadow-md',
        'transition-[width,border-color] duration-250 ease-in-out',
        collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        dAccent.borderColor,
      )}
      aria-label="Sidebar navigation"
    >
      {/* ── Wordmark ── */}
      <div className="flex items-center justify-center px-4 py-4">
        <Link
          to="/"
          className={cn('focus-visible:outline-none focus-visible:ring-2 rounded-md', dAccent.focusRing)}
          aria-label={`${APP_NAME} home`}
        >
          <img
            src="/logos/black-wordmark.png"
            alt={APP_NAME}
            className={cn(
              'h-5 w-auto transition-opacity duration-200',
              collapsed ? 'hidden' : 'block',
            )}
          />
          <img
            src="/logos/black-logo-transparent.png"
            alt={APP_NAME}
            className={cn(
              'h-6 w-6 object-contain transition-opacity duration-200',
              collapsed ? 'block' : 'hidden',
            )}
          />
        </Link>
      </div>

      {/* ── Nav content (injected) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar">
        {children}
      </div>

      {/* ── Sticky footer: profile + settings + collapse ── */}
      <div className={cn('border-t transition-colors duration-250 px-2.5 py-2', dAccent.borderColor)}>
        <div className={cn('flex items-center gap-2 min-w-0', collapsed && 'flex-col')}>
          {/* Profile link */}
          <Link
            to="/profile"
            className={cn(
              'flex items-center gap-2 min-w-0 rounded-lg p-1',
              'transition-[colors,transform] duration-150 active:scale-[0.97] cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
              !collapsed && 'flex-1',
              location.pathname.startsWith('/profile')
                ? 'bg-primary-50 text-primary-800'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50/60',
            )}
            aria-label="View profile"
            title={collapsed ? profile?.display_name || 'Profile' : undefined}
          >
            <Avatar
              src={profile?.avatar_url}
              name={profile?.display_name || ''}
              size="sm"
            />
            {!collapsed && (
              <span className="font-heading text-[13px] font-semibold text-neutral-900 truncate">
                {profile?.display_name}
              </span>
            )}
          </Link>

          {/* Settings icon */}
          <Link
            to="/settings"
            className={cn(
              'flex items-center justify-center shrink-0',
              'size-8 rounded-lg text-[13px]',
              'transition-[colors,transform] duration-150 active:scale-[0.93] cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2',
              dAccent.focusRing,
              location.pathname.startsWith('/settings')
                ? dAccent.activeClasses
                : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50/60',
            )}
            title="Settings"
          >
            <Settings size={16} strokeWidth={1.5} />
          </Link>

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'flex items-center justify-center shrink-0',
              'size-8 rounded-lg',
              'text-primary-300',
              dAccent.collapseHover,
              'cursor-pointer select-none',
              'transition-transform duration-200 active:scale-[0.90]',
              'focus-visible:outline-none focus-visible:ring-2',
              dAccent.focusRing,
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <motion.span
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex items-center justify-center"
            >
              <PanelLeftClose size={15} strokeWidth={1.5} />
            </motion.span>
          </button>
        </div>
      </div>
    </aside>
  )
}
