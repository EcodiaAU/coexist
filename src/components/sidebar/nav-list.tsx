import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import type { NavCategory, Suite } from './types'
import { getAccentClasses } from './accent'

/* ------------------------------------------------------------------ */
/*  Shared nav list renderer                                           */
/* ------------------------------------------------------------------ */

export function SidebarNavList({
  suite,
  categories,
  collapsed,
  isCurrent,
  isActive,
  reduced,
  isMobileMode,
  onNavigate,
}: {
  suite: Suite
  categories: NavCategory[]
  collapsed: boolean
  isCurrent: boolean
  isActive: (path: string) => boolean
  reduced: boolean
  isMobileMode: boolean
  onNavigate?: (path: string) => void
}) {
  const sAccent = getAccentClasses(suite)
  const sLayoutId = `unified-sidebar-${suite}`
  let itemIndex = 0

  // Filter categories/items based on mobile vs desktop
  const filteredCategories = categories
    .filter((cat) => isMobileMode || !cat.mobileOnly)
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => (isMobileMode || !item.mobileOnly) && (!isMobileMode || !item.desktopOnly)),
    }))
    .filter((cat) => cat.items.length > 0)

  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out"
      style={{ gridTemplateRows: isCurrent ? '1fr' : '0fr' }}
      aria-hidden={!isCurrent}
    >
      <nav className={cn(
        'overflow-hidden px-2',
        isCurrent ? 'py-2' : 'py-0',
        'transition-[padding] duration-300 ease-in-out',
      )}>
        {filteredCategories.map((cat, catIdx) => {
          const showLabel = catIdx > 0
          return (
            <div key={cat.label || `cat-${catIdx}`}>
              {/* Section header - prominent group divider for role groups */}
              {cat.sectionHeader && !collapsed && (
                <div className={cn(
                  'mx-2.5 mt-6 mb-2.5 pl-3 border-l-[3px]',
                  cat.sectionBorderColor ?? 'border-neutral-200',
                )}>
                  <p className={cn(
                    'text-[13px] font-extrabold uppercase tracking-[0.12em]',
                    cat.labelColor ?? 'text-primary-400',
                  )}>
                    {cat.sectionHeader}
                  </p>
                </div>
              )}
              {cat.sectionHeader && collapsed && (
                <div className={cn('my-3 mx-2 h-0.5 rounded-full', cat.dotColor ?? sAccent.dividerColor)} />
              )}
              {/* Sub-category label (within a group) */}
              {showLabel && cat.label && !cat.sectionHeader && (
                <div>
                  {!collapsed && (
                    <p className={cn(
                      'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] px-2.5 mt-4 mb-1.5',
                      cat.labelColor ?? 'text-neutral-400',
                    )}>
                      {cat.dotColor && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cat.dotColor)} />}
                      {cat.label}
                    </p>
                  )}
                  {collapsed && <div className={cn('my-2.5 mx-2 h-px opacity-30', cat.dotColor ?? sAccent.dividerColor)} />}
                </div>
              )}

              <ul className="space-y-0.5">
                {cat.items.map((item) => {
                  const isItemActive = isCurrent && isActive(item.path)
                  const idx = itemIndex++
                  return (
                    <li
                      key={item.path + item.label}
                      className={cn(
                        'transition-[opacity,transform] duration-250 ease-out',
                        isCurrent
                          ? 'opacity-100 translate-y-0'
                          : 'opacity-0 translate-y-1',
                      )}
                      style={{
                        transitionDelay: isCurrent ? `${idx * 25}ms` : '0ms',
                      }}
                    >
                      {isMobileMode && onNavigate ? (
                        <button
                          type="button"
                          onClick={() => onNavigate(item.path)}
                          className={cn(
                            'relative flex items-center gap-2.5 w-full',
                            'rounded-xl text-[13px]',
                            'transition-[colors,transform] duration-150 active:scale-[0.97]',
                            'cursor-pointer select-none text-left',
                            'focus-visible:outline-none focus-visible:ring-2',
                            sAccent.focusRing,
                            'px-2.5 h-9',
                            isItemActive ? sAccent.activeClasses : sAccent.hoverClasses,
                          )}
                          aria-current={isItemActive ? 'page' : undefined}
                        >
                          {isItemActive && (
                            <motion.span
                              layoutId={reduced ? undefined : `${sLayoutId}-mobile`}
                              className={cn(
                                'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b',
                                sAccent.indicatorFrom,
                                sAccent.indicatorTo,
                              )}
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                          )}
                          <span className={cn(
                            'flex items-center justify-center shrink-0 transition-transform duration-150',
                            isItemActive && 'scale-105',
                          )}>
                            {item.icon}
                          </span>
                          <span className="truncate flex-1">{item.label}</span>
                          {item.badge !== undefined && item.badge > 0 && (
                            <span
                              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-success-500 px-1.5 text-[10px] font-bold text-white tabular-nums shrink-0"
                              aria-label={`${item.badge} unread`}
                            >
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </button>
                      ) : (
                        <Link
                          to={item.path}
                          onClick={() => window.scrollTo({ top: 0 })}
                          tabIndex={isCurrent ? 0 : -1}
                          className={cn(
                            'relative flex items-center gap-2.5',
                            'rounded-xl text-[13px]',
                            'transition-[colors,transform] duration-150 active:scale-[0.97]',
                            'cursor-pointer select-none',
                            'focus-visible:outline-none focus-visible:ring-2',
                            sAccent.focusRing,
                            collapsed ? 'justify-center h-10 w-10 mx-auto' : 'px-2.5 h-10',
                            isItemActive ? sAccent.activeClasses : sAccent.hoverClasses,
                          )}
                          aria-current={isItemActive ? 'page' : undefined}
                          title={collapsed ? item.label : undefined}
                        >
                          {isItemActive && !collapsed && (
                            <motion.span
                              layoutId={reduced ? undefined : sLayoutId}
                              className={cn(
                                'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b',
                                sAccent.indicatorFrom,
                                sAccent.indicatorTo,
                              )}
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                          )}

                          {isItemActive && collapsed && (
                            <motion.span
                              layoutId={reduced ? undefined : `${sLayoutId}-dot`}
                              className={cn(
                                'absolute left-0.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full',
                                sAccent.dotColor,
                              )}
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                          )}

                          <span
                            className={cn(
                              'relative flex items-center justify-center shrink-0 transition-transform duration-150',
                              isItemActive && 'scale-105',
                            )}
                          >
                            {item.icon}
                            {/* Collapsed: tiny dot indicator if there's a badge */}
                            {collapsed && item.badge !== undefined && item.badge > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-success-500 ring-2 ring-white" />
                            )}
                          </span>
                          {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                          {!collapsed && item.badge !== undefined && item.badge > 0 && (
                            <span
                              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-success-500 px-1.5 text-[10px] font-bold text-white tabular-nums shrink-0"
                              aria-label={`${item.badge} unread`}
                            >
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
