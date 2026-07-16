import { type ReactNode, useRef, useEffect, useId } from 'react'
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface Tab {
  id: string
  label: string
  icon?: ReactNode
}

interface TabBarProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
  className?: string
  'aria-label'?: string
}

export function TabBar({
  tabs,
  activeTab,
  onChange,
  className,
  'aria-label': ariaLabel = 'View tabs',
}: TabBarProps) {
  const shouldReduceMotion = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const groupId = useId()

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current
      const button = activeRef.current
      const scrollLeft =
        button.offsetLeft -
        container.offsetWidth / 2 +
        button.offsetWidth / 2

      container.scrollTo({
        left: scrollLeft,
        behavior: shouldReduceMotion ? 'instant' : 'smooth',
      })
    }
  }, [activeTab, shouldReduceMotion])

  return (
    <LayoutGroup data-eos-id="src/components/tab-bar.tsx#0" id={groupId}>
      <div data-eos-id="src/components/tab-bar.tsx#1"
        ref={scrollRef}
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          'flex overflow-x-auto overflow-y-hidden hide-scrollbar',
          'border-b border-neutral-100',
          className,
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab

          return (
            <button data-eos-id="src/components/tab-bar.tsx#2"
              key={tab.id}
              ref={isActive ? activeRef : undefined}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative flex items-center justify-center gap-1.5',
                'whitespace-nowrap px-4 min-h-11 text-sm font-medium',
                'cursor-pointer select-none shrink-0',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
                isActive
                  ? 'text-neutral-900'
                  : 'text-neutral-500/70 hover:text-neutral-700',
              )}
            >
              {/* Animated underline indicator */}
              {isActive && (
                <motion.span data-eos-id="src/components/tab-bar.tsx#3"
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary-700"
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 }
                  }
                />
              )}
              <span data-eos-id="src/components/tab-bar.tsx#4" data-eos-var="tab.label" data-eos-var-label="Label" data-eos-var-scope="item" className="relative flex items-center gap-1.5">
                {tab.icon && (
                  <span data-eos-id="src/components/tab-bar.tsx#5" data-eos-var="tab.icon" data-eos-var-label="Icon" data-eos-var-scope="item" className="flex items-center shrink-0" aria-hidden="true">
                    {tab.icon}
                  </span>
                )}
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
