import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Home,
    MessageCircle,
    User,
    MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { usePlatform } from '@/hooks/use-platform'

export interface Tab {
  key: string
  label: string
  path: string
  icon: ReactNode
  activeIcon: ReactNode
  /** If true, match only exact path (no prefix matching) */
  exact?: boolean
  /** If true, this tab triggers onMorePress instead of navigating */
  isMore?: boolean
}

const baseTabs: Tab[] = [
  {
    key: 'home',
    label: 'Home',
    path: '/',
    exact: true,
    icon: <Home size={21} strokeWidth={1.5} />,
    activeIcon: <Home size={21} strokeWidth={2.2} />,
  },
  {
    key: 'chat',
    label: 'Chat',
    path: '/chat',
    icon: <MessageCircle size={21} strokeWidth={1.5} />,
    activeIcon: <MessageCircle size={21} strokeWidth={2.2} />,
  },
  {
    key: 'profile',
    label: 'Profile',
    path: '/profile',
    icon: <User size={21} strokeWidth={1.5} />,
    activeIcon: <User size={21} strokeWidth={2.2} />,
  },
  {
    key: 'more',
    label: 'More',
    path: '/more',
    exact: true,
    isMore: true,
    icon: <MoreHorizontal size={21} strokeWidth={1.5} />,
    activeIcon: <MoreHorizontal size={21} strokeWidth={2.2} />,
  },
]

// eslint-disable-next-line react-refresh/only-export-components
export const MORE_TAB: Tab = {
  key: 'more',
  label: 'More',
  path: '/more',
  exact: true,
  isMore: true,
  icon: <MoreHorizontal size={21} strokeWidth={1.5} />,
  activeIcon: <MoreHorizontal size={21} strokeWidth={2.2} />,
}

interface BottomTabBarProps {
  /** Badge count for the chat tab (unread messages) */
  chatBadge?: number
  /** Show a warning dot on the Home tab when sync is paused */
  syncWarning?: boolean
  /** Override tab set (for leader/admin layouts) */
  tabs?: Tab[]
  /** layoutId prefix for animations - use unique value per tab bar instance */
  layoutPrefix?: string
  /** Accent color for active states */
  accent?: 'primary' | 'moss'
  /** Called when the "More" tab is pressed instead of navigating */
  onMorePress?: () => void
  className?: string
}

export function BottomTabBar({
  chatBadge = 0,
  syncWarning = false,
  tabs: customTabs,
  layoutPrefix = 'tab',
  accent = 'primary',
  onMorePress,
  className,
}: BottomTabBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { isAndroid } = usePlatform()

  const tabs = customTabs ?? baseTabs

  const handleTabPress = (tab: Tab) => {
    if (tab.isMore && onMorePress) {
      onMorePress()
      return
    }

    navigate(tab.path)
  }

  const isActive = (tab: Tab) => {
    if (tab.isMore) return false // More tab never shows "active" state
    if (tab.exact || tab.path === '/') return location.pathname === tab.path
    return location.pathname.startsWith(tab.path)
  }

  const activeText = accent === 'moss' ? 'text-moss-700' : 'text-primary-800'
  const inactiveText = accent === 'moss' ? 'text-moss-400/70' : 'text-neutral-400/70'
  const activePill = accent === 'moss' ? 'bg-moss-100' : 'bg-primary-100'

  // Android gesture/button nav bars don't reliably populate env(safe-area-inset-bottom).
  // Apply a 16px minimum so the bar always clears the system UI on Android.
  const navStyle = isAndroid
    ? { marginBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }
    : undefined

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'pointer-events-none',
        className,
      )}
    >
      <nav
        className={cn(
          'pointer-events-auto',
          'mx-4 mb-[var(--safe-bottom,0px)] rounded-[20px]',
          'bg-white shadow-sm',
        )}
        style={navStyle}
        aria-label="Navigation"
        role="tablist"
      >
        <div className="flex items-center justify-around h-[56px] px-1">
          {tabs.map((tab) => {
            const active = isActive(tab)

            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={tab.key === 'chat' && chatBadge > 0 ? `${tab.label}, ${chatBadge} unread` : tab.label}
                onClick={() => handleTabPress(tab)}
                className={cn(
                  'relative flex flex-col items-center justify-center',
                  'flex-1 h-full',
                  'cursor-pointer select-none',
                  'transition-colors duration-150',
                  active ? activeText : inactiveText,
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
                )}
              >
                {/* Active pill background */}
                {active && (
                  <motion.span
                    layoutId={shouldReduceMotion ? undefined : `${layoutPrefix}-pill`}
                    className={cn('absolute inset-x-1.5 inset-y-1 rounded-2xl', activePill)}
                    transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
                  />
                )}

                {/* Icon */}
                <span className="relative flex items-center justify-center z-10">
                  {active ? tab.activeIcon : tab.icon}

                  {/* Sync warning dot on Home tab */}
                  {tab.key === 'home' && syncWarning && (
                    <span
                      className="absolute -top-0.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-warning-500 ring-2 ring-white/90"
                      aria-label="Sync paused"
                    />
                  )}

                  {/* Chat badge */}
                  {tab.key === 'chat' && chatBadge > 0 && (
                    <span
                      className={cn(
                        'absolute -top-1.5 -right-2.5',
                        'flex items-center justify-center',
                        'min-w-[17px] h-[17px] px-1',
                        'rounded-full bg-error text-white',
                        'text-[9px] font-bold leading-none',
                        'ring-2 ring-white/90',
                      )}
                      aria-label={`${chatBadge} unread`}
                    >
                      {chatBadge > 99 ? '99+' : chatBadge}
                    </span>
                  )}
                </span>

                {/* Label */}
                <span
                  className={cn(
                    'relative z-10 text-[10px] mt-0.5 leading-none',
                    active ? 'font-bold' : 'font-medium',
                  )}
                >
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
