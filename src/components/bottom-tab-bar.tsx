import { useLocation, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { usePlatform } from '@/hooks/use-platform'
import { TAB_SUITES, isTabActive, type TabSpec } from '@/lib/tab-suites'

interface BottomTabBarProps {
  /** Badge count for the chat tab (unread messages) */
  chatBadge?: number
  /** Show a warning dot on the Home tab when sync is paused */
  syncWarning?: boolean
  /** The current suite's tabs (src/lib/tab-suites.ts). Defaults to the member app's. */
  tabs?: readonly TabSpec[]
  /** layoutId prefix for the active pill: one per suite, so the pill never slides across a suite change */
  layoutPrefix?: string
  /** Called when the "More" tab is pressed instead of navigating */
  onMorePress?: () => void
  className?: string
}

/**
 * The web tab bar: Android, the web, iPad, and any iPhone without the Liquid
 * Glass bar. ONE style for the member app, the leader suite and the admin
 * suite; only the tabs differ. Mounted once, by the app shell.
 */
export function BottomTabBar({
  chatBadge = 0,
  syncWarning = false,
  tabs = TAB_SUITES.main,
  layoutPrefix = 'tab',
  onMorePress,
  className,
}: BottomTabBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { isAndroid } = usePlatform()

  const handleTabPress = (tab: TabSpec) => {
    if (tab.isMore && onMorePress) {
      onMorePress()
      return
    }

    navigate(tab.path)
  }

  // Android gesture/button nav bars don't reliably populate env(safe-area-inset-bottom).
  // Apply a 16px minimum so the bar always clears the system UI on Android.
  const navStyle = isAndroid
    ? { marginBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }
    : undefined

  return (
    <div data-eos-id="src/components/bottom-tab-bar.tsx#10"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'pointer-events-none',
        className,
      )}
    >
      <nav data-eos-id="src/components/bottom-tab-bar.tsx#11"
        className={cn(
          'pointer-events-auto',
          'mx-4 mb-[var(--safe-bottom,0px)] rounded-[20px]',
          'bg-white shadow-sm',
        )}
        style={navStyle}
        aria-label="Navigation"
        role="tablist"
      >
        <div data-eos-id="src/components/bottom-tab-bar.tsx#12" className="flex items-center justify-around h-[56px] px-1">
          {tabs.map((tab) => {
            const active = isTabActive(tab, location.pathname)
            const Icon = tab.icon

            return (
              <button data-eos-id="src/components/bottom-tab-bar.tsx#13"
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
                  active ? 'text-primary-800' : 'text-neutral-400/70',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
                )}
              >
                {/* Active pill background */}
                {active && (
                  <motion.span data-eos-id="src/components/bottom-tab-bar.tsx#14"
                    layoutId={shouldReduceMotion ? undefined : `${layoutPrefix}-pill`}
                    className="absolute inset-x-1.5 inset-y-1 rounded-md bg-primary-100"
                    transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
                  />
                )}

                {/* Icon */}
                <span data-eos-id="src/components/bottom-tab-bar.tsx#15" className="relative flex items-center justify-center z-10">
                  <Icon size={21} strokeWidth={active ? 2.2 : 1.5} />

                  {/* Sync warning dot on Home tab */}
                  {tab.key === 'home' && syncWarning && (
                    <span data-eos-id="src/components/bottom-tab-bar.tsx#16"
                      className="absolute -top-0.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-warning-500 ring-2 ring-white/90"
                      aria-label="Sync paused"
                    />
                  )}

                  {/* Chat badge */}
                  {tab.key === 'chat' && chatBadge > 0 && (
                    <span data-eos-id="src/components/bottom-tab-bar.tsx#17"
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
                <span data-eos-id="src/components/bottom-tab-bar.tsx#18" data-eos-var="tab.label" data-eos-var-label="Label" data-eos-var-scope="item"
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
