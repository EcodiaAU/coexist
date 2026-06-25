import { type ReactNode, useState, useEffect, useRef, createContext, useContext, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatedOutlet } from '@/components/animated-outlet'

import {
    LayoutDashboard,
    CalendarDays,
    MoreHorizontal,
    Home,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { WAVE_PATHS } from '@/components/wave-paths'
import { useCollective } from '@/hooks/use-collective'
import { useLayout } from '@/hooks/use-layout'
import { BottomTabBar, type Tab } from '@/components/bottom-tab-bar'
import { useMenuSheet } from '@/hooks/use-menu-sheet'
import {
    LeaderCollectiveScopeContext,
    useLeaderCollectiveScopeProvider,
} from '@/hooks/use-leader-collective-scope'

/* ------------------------------------------------------------------ */
/*  Leader header context - lets child pages set title + actions       */
/* ------------------------------------------------------------------ */

interface LeaderHeaderState {
  title: string
  subtitle?: string
  actions?: ReactNode
  heroContent?: ReactNode
  /** When true, the layout skips the hero bar and uses p-0 - page owns its entire background */
  fullBleed?: boolean
}

interface LeaderHeaderContextValue {
  setHeader: (opts: LeaderHeaderState) => void
  collectiveId: string | undefined
  collectiveSlug: string | undefined
}

const LeaderHeaderContext = createContext<LeaderHeaderContextValue | null>(null)

/**
 * Call from any leader page to set the page header title and optional actions.
 */
interface LeaderHeaderOpts {
  subtitle?: string
  actions?: ReactNode
  heroContent?: ReactNode
  fullBleed?: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLeaderHeader(
  title: string,
  opts?: LeaderHeaderOpts | ReactNode,
) {
  const ctx = useContext(LeaderHeaderContext)
  // Destructure opts to get stable primitive deps - avoids re-firing on every render
  // when callers pass an inline object literal like { fullBleed: true }
  const isOptsObject = opts != null && typeof opts === 'object' && !('$$typeof' in (opts as Record<string, unknown>)) && ('subtitle' in (opts as Record<string, unknown>) || 'actions' in (opts as Record<string, unknown>) || 'heroContent' in (opts as Record<string, unknown>) || 'fullBleed' in (opts as Record<string, unknown>))
  const optsRecord = isOptsObject ? (opts as LeaderHeaderOpts) : undefined
  const subtitle = optsRecord?.subtitle
  const actions = optsRecord ? optsRecord.actions : (!isOptsObject ? opts as ReactNode : undefined)
  const heroContent = optsRecord?.heroContent
  const fullBleed = optsRecord?.fullBleed

  useEffect(() => {
    if (isOptsObject) {
      ctx?.setHeader({ title, subtitle, actions, heroContent, fullBleed })
    } else {
      ctx?.setHeader({ title, actions })
    }
  }, [ctx, title, isOptsObject, subtitle, actions, heroContent, fullBleed])
}

/** Access the leader's collective context from any leader sub-page */
// eslint-disable-next-line react-refresh/only-export-components
export function useLeaderContext() {
  const ctx = useContext(LeaderHeaderContext)
  return { collectiveId: ctx?.collectiveId, collectiveSlug: ctx?.collectiveSlug }
}

/** Returns true when the component is rendered inside the leader layout. */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsLeaderLayout() {
  return useContext(LeaderHeaderContext) !== null
}

/* ------------------------------------------------------------------ */
/*  Per-page hero config - earthy/nature-inspired gradients            */
/* ------------------------------------------------------------------ */

interface LeaderHeroCfg { hue: string; defaultSubtitle: string; w: number }

// All leader heroes standardised to Co-Exist sage/olive/green tones to
// match the profile-page hero. 2026-05-16 Tate: every hero in the app
// must read as the same brand-green family - no bark, no warm tones.
// Deep army-olive from the Co-Exist marketing web app (olive-700 #474f2f), so
// the leader portal reads as the same product as the site + admin. Subtle depth
// shift between sections that the persistent hero glides between.
const LEADER_HERO_MOSS    = 'bg-olive-700'
const LEADER_HERO_PRIMARY = 'bg-olive-800'

const PAGE_HERO_CONFIG: Record<string, LeaderHeroCfg> = {
  'Dashboard':      { hue: LEADER_HERO_MOSS,    defaultSubtitle: 'Your collective at a glance',          w: 1 },
  'Events':         { hue: LEADER_HERO_MOSS,    defaultSubtitle: 'Manage and create conservation events', w: 2 },
  'Tasks':          { hue: LEADER_HERO_PRIMARY, defaultSubtitle: 'Tasks and personal to-dos',             w: 3 },
  'Reports':        { hue: LEADER_HERO_PRIMARY, defaultSubtitle: 'Generate impact and activity reports',  w: 1 },
  'Create Event':   { hue: LEADER_HERO_MOSS,    defaultSubtitle: 'Plan a new conservation activity',      w: 2 },
}

const DEFAULT_HERO: LeaderHeroCfg = { hue: LEADER_HERO_MOSS, defaultSubtitle: '', w: 1 }

/* Wave indices map to shared WAVE_PATHS from wave-transition.tsx:
   0 = gentle hills, 1 = soft dunes, 2 = double crest, 3 = asymmetric shelf, 4 = choppy reef */

/* ------------------------------------------------------------------ */
/*  Nav items                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Mobile bottom tab bar tabs for leader suite                        */
/* ------------------------------------------------------------------ */

const leaderBottomTabs: Tab[] = [
  {
    key: 'back',
    label: 'App',
    path: '/',
    exact: true,
    icon: <Home size={22} strokeWidth={1.5} />,
    activeIcon: <Home size={22} strokeWidth={2} fill="currentColor" />,
  },
  {
    key: 'leader-home',
    label: 'Dashboard',
    path: '/leader',
    exact: true,
    icon: <LayoutDashboard size={22} strokeWidth={1.5} />,
    activeIcon: <LayoutDashboard size={22} strokeWidth={2} fill="currentColor" />,
  },
  {
    key: 'leader-events',
    label: 'Events',
    path: '/leader/events',
    icon: <CalendarDays size={22} strokeWidth={1.5} />,
    activeIcon: <CalendarDays size={22} strokeWidth={2} fill="currentColor" />,
  },
  {
    key: 'more',
    label: 'More',
    path: '/more',
    exact: true,
    isMore: true,
    icon: <MoreHorizontal size={22} strokeWidth={1.5} />,
    activeIcon: <MoreHorizontal size={22} strokeWidth={2} />,
  },
]

/* ------------------------------------------------------------------ */
/*  Shared nav link component                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Leader bottom tabs - wires More to sidebar                         */
/* ------------------------------------------------------------------ */

function LeaderBottomTabs() {
  const { openMenu } = useMenuSheet()
  return (
    <BottomTabBar
      tabs={leaderBottomTabs}
      layoutPrefix="leader-tab"
      accent="moss"
      onMorePress={openMenu}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  LeaderLayout  route-level layout, renders <Outlet />              */
/* ------------------------------------------------------------------ */

export function LeaderLayout() {
  const location = useLocation()
  const { navMode } = useLayout()
  const showBottomTabs = navMode === 'bottom-tabs'
  const [header, setHeaderState] = useState<LeaderHeaderState>({ title: '' })
  const scrollRef = useRef<HTMLDivElement>(null)

  // Collective scope - managers see managed collectives, admins see all, leaders see own
  const scopeCtx = useLeaderCollectiveScopeProvider()
  const collectiveId = scopeCtx.selectedCollectiveId

  const { data: collectiveDetail } = useCollective(collectiveId)
  const collectiveSlug = collectiveDetail?.slug ?? collectiveId
  const collectiveNameRaw = collectiveDetail?.name ?? 'My Collective'
  // Strip trailing "Collective" - e.g. "Byron Bay Collective" → "Byron Bay"
  const _collectiveName = collectiveNameRaw.replace(/\s+Collective$/i, '')

  // Scroll content to top on route change  instant to avoid fighting
  // with page transition animations
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  const setHeader = useCallback((opts: LeaderHeaderState) => {
    setHeaderState((prev) => {
      // Skip state update if nothing changed - prevents cascading re-renders
      if (
        prev.title === opts.title &&
        prev.subtitle === opts.subtitle &&
        prev.fullBleed === opts.fullBleed &&
        prev.actions === opts.actions &&
        prev.heroContent === opts.heroContent
      ) return prev
      return opts
    })
  }, [])

  const headerCtx = useMemo(() => ({ setHeader, collectiveId, collectiveSlug }), [setHeader, collectiveId, collectiveSlug])

  return (
    <LeaderCollectiveScopeContext.Provider value={scopeCtx}>
    <LeaderHeaderContext.Provider value={headerCtx}>
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar is handled by UnifiedSidebar in AppShell */}

        {/* Mobile drawer + hamburger removed - handled by UnifiedSidebar in AppShell */}

        {/* ── Main content ── */}
        <div ref={scrollRef} className={cn(
          'flex-1 flex flex-col min-w-0 min-h-0 bg-surface-1',
          showBottomTabs && 'overflow-y-auto overscroll-none hide-scrollbar',
        )}>
          {/* Shared hero bar - only for non-fullBleed pages */}
          {!header.fullBleed && header.title ? (() => {
            const cfg = PAGE_HERO_CONFIG[header.title] ?? DEFAULT_HERO
            const subtitle = header.subtitle ?? cfg.defaultSubtitle
            return (
              <div
                className={cn(
                  'relative overflow-hidden',
                  'transition-colors duration-700 ease-in-out',
                  cfg.hue,
                  'px-6 pt-12 pb-14 sm:px-8 sm:pt-16 sm:pb-16',
                  'before:absolute before:inset-x-0 before:bottom-full before:h-[200px] before:bg-inherit',
                )}
              >
                <div className="relative z-10">
                  <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                      <h1 className="font-heading text-3xl sm:text-4xl font-normal display-tight text-white">
                        {header.title}
                      </h1>
                      {subtitle && (
                        <p className="mt-1 text-sm text-white/50">{subtitle}</p>
                      )}
                    </div>
                    {header.actions && (
                      <div className="flex items-center gap-2 shrink-0">{header.actions}</div>
                    )}
                  </div>

                  {header.heroContent && (
                    <div className="mt-5">{header.heroContent}</div>
                  )}
                </div>

                {/* Wave divider */}
                <div className="absolute bottom-0 left-0 right-0 z-20">
                  <svg
                    viewBox="0 0 1440 70"
                    preserveAspectRatio="none"
                    className="w-full h-7 sm:h-10 block"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d={WAVE_PATHS[0]} className="fill-white" />
                  </svg>
                </div>
              </div>
            )
          })() : null}

          {/* Content rendered by nested <Route> children */}
          <div className={cn(
            'relative flex-1',
            header.fullBleed ? 'p-0 bg-white' : 'p-4 sm:p-6 lg:p-8',
            !header.fullBleed && 'bg-neutral-50',
            showBottomTabs && 'pb-[calc(5rem+var(--safe-bottom))]',
          )}>

            <AnimatedOutlet />
          </div>
        </div>

        {/* Leader bottom tab bar - mobile only */}
        {showBottomTabs && (
          <LeaderBottomTabs />
        )}
      </div>
    </LeaderHeaderContext.Provider>
    </LeaderCollectiveScopeContext.Provider>
  )
}
