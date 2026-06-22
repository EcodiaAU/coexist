import { type ReactNode, useState, useEffect, useRef, createContext, useContext, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { AdminCollectiveScopeContext, useAdminCollectiveScopeProvider } from '@/hooks/use-admin-collective-scope'
import { AnimatedOutlet } from '@/components/animated-outlet'
import { WAVE_PATHS } from '@/components/wave-paths'

import {
    Users,
    CalendarDays,
    MapPin,
    ClipboardList, ClipboardCheck, FileText,
    Settings,
    Download,
    Heart,
    Bug,
    Image, Home,
    ShoppingBag,
    MoreHorizontal,
    Handshake,
    Mail,
    Megaphone,
    Phone,
    ArrowLeft,
    BarChart3,
    Leaf,
    GraduationCap,
    MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useLayout } from '@/hooks/use-layout'
import { BottomTabBar, type Tab } from '@/components/bottom-tab-bar'
import { useMenuSheet } from '@/hooks/use-menu-sheet'
import type { NavItem, NavCategory } from '@/components/sidebar/types'

/* ------------------------------------------------------------------ */
/*  Admin header context  lets child pages set title + actions        */
/* ------------------------------------------------------------------ */

interface AdminHeaderState {
  title: string
  subtitle?: string
  actions?: ReactNode
  heroContent?: ReactNode
  fullBleed?: boolean
}

interface AdminHeaderContextValue {
  setHeader: (opts: { title: string; subtitle?: string; actions?: ReactNode; heroContent?: ReactNode; fullBleed?: boolean }) => void
}

const AdminHeaderContext = createContext<AdminHeaderContextValue | null>(null)

/**
 * Call from any admin page to set the page header title and optional actions.
 * Pass heroContent to populate the shared hero bar.
 */
interface AdminHeaderOpts {
  subtitle?: string
  actions?: ReactNode
  heroContent?: ReactNode
  fullBleed?: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminHeader(
  title: string,
  opts?: AdminHeaderOpts | ReactNode,
) {
  const ctx = useContext(AdminHeaderContext)

  // Extract individual values so the effect only re-fires when they actually change,
  // not when a new wrapper object is created each render.
  const isOptsObject = opts != null && typeof opts === 'object' && !('$$typeof' in (opts as Record<string, unknown>)) && ('actions' in (opts as Record<string, unknown>) || 'heroContent' in (opts as Record<string, unknown>) || 'fullBleed' in (opts as Record<string, unknown>) || 'subtitle' in (opts as Record<string, unknown>))
  const optsRecord = isOptsObject ? (opts as AdminHeaderOpts) : undefined
  const subtitle = optsRecord?.subtitle
  const actions = optsRecord ? optsRecord.actions : (opts as ReactNode)
  const heroContent = optsRecord?.heroContent
  const fullBleed = optsRecord?.fullBleed

  useEffect(() => {
    ctx?.setHeader({ title, subtitle, actions, heroContent, fullBleed })
  }, [ctx, title, subtitle, actions, heroContent, fullBleed])
}

/* ------------------------------------------------------------------ */
/*  Per-page hero hue config - maps title → gradient hue               */
/* ------------------------------------------------------------------ */

interface HeroCfg { hue: string; tall?: boolean; w: number }

// All hero gradients standardised to Co-Exist sage/olive/green tones to
// match the profile-page hero (solid #879e62). 2026-05-16 Tate: every
// hero in the app must read as the same brand-green family - no purples,
// oranges, ambers, accents, secondaries.
const BRAND_HERO = 'from-primary-700 via-primary-800 to-primary-900'
const BRAND_HERO_DEEP = 'from-primary-800 via-primary-900 to-primary-950'
const BRAND_HERO_MOSS = 'from-moss-700 via-primary-800 to-primary-900'

const PAGE_HERO_CONFIG: Record<string, HeroCfg> = {
  'Dashboard':           { hue: BRAND_HERO_DEEP, w: 0 },
  'Collectives':         { hue: BRAND_HERO,      w: 1, tall: true },
  'User Management':     { hue: BRAND_HERO_DEEP, w: 2, tall: true },
  'Workflows':           { hue: BRAND_HERO,      w: 3, tall: true },
  'Events':              { hue: BRAND_HERO_MOSS, w: 4, tall: true },
  'Create':              { hue: BRAND_HERO,      w: 0, tall: true },
  'Surveys':             { hue: BRAND_HERO_DEEP, w: 1, tall: true },
  'Reports':             { hue: BRAND_HERO,      w: 2, tall: true },
  'Email Marketing':     { hue: BRAND_HERO_DEEP, w: 3, tall: true },
  'Charity Settings':    { hue: BRAND_HERO_DEEP, w: 4, tall: true },
  'Export Centre':       { hue: BRAND_HERO,      w: 0, tall: true },
  'Audit Log':           { hue: BRAND_HERO_DEEP, w: 1, tall: true },
  'Branding & Images':   { hue: BRAND_HERO_DEEP, w: 2, tall: true },
  'System':              { hue: BRAND_HERO_DEEP, w: 3, tall: true },
  'Merch Management':    { hue: BRAND_HERO_DEEP, w: 0, tall: true },
  'Applications':        { hue: BRAND_HERO_MOSS, w: 1, tall: true },
  'Create Survey':       { hue: BRAND_HERO_DEEP, w: 2, tall: true },
  'Dev Tools':           { hue: BRAND_HERO_DEEP, w: 3, tall: true },
  'Partners & Sponsors': { hue: BRAND_HERO,      w: 4, tall: true },
  'Challenges':          { hue: BRAND_HERO_MOSS, w: 0, tall: true },
  'Content Moderation':  { hue: BRAND_HERO_DEEP, w: 1, tall: true },
  'Organisational Policies': { hue: BRAND_HERO_DEEP, w: 2, tall: true },
  'Edit Policy':         { hue: BRAND_HERO_DEEP, w: 2, tall: true },
  'Updates':             { hue: BRAND_HERO,      w: 3, tall: true },
  'New Update':          { hue: BRAND_HERO,      w: 3, tall: true },
  'Development':         { hue: BRAND_HERO_MOSS, w: 4, tall: true },
  'Create Module':       { hue: BRAND_HERO_MOSS, w: 0, tall: true },
  'Edit Module':         { hue: BRAND_HERO_MOSS, w: 0, tall: true },
  'Module Detail':       { hue: BRAND_HERO_MOSS, w: 1, tall: true },
  'Create Section':      { hue: BRAND_HERO_MOSS, w: 2, tall: true },
  'Edit Section':        { hue: BRAND_HERO_MOSS, w: 2, tall: true },
  'Create Quiz':         { hue: BRAND_HERO_MOSS, w: 3, tall: true },
  'Edit Quiz':           { hue: BRAND_HERO_MOSS, w: 3, tall: true },
  'Development Results': { hue: BRAND_HERO_MOSS, w: 4, tall: true },
  'Emergency Contacts':  { hue: BRAND_HERO_MOSS, w: 0, tall: true },
}

const DEFAULT_HERO: HeroCfg = { hue: BRAND_HERO_DEEP, tall: true, w: 3 }

/** Returns true when the component is rendered inside the admin layout. */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsAdminLayout() {
  return useContext(AdminHeaderContext) !== null
}

/* ------------------------------------------------------------------ */
/*  Mobile bottom tab bar tabs for admin suite                         */
/* ------------------------------------------------------------------ */

const adminBottomTabs: Tab[] = [
  {
    key: 'back',
    label: 'App',
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
    key: 'admin-collectives',
    label: 'Collectives',
    path: '/admin/collectives',
    icon: <MapPin size={21} strokeWidth={1.5} />,
    activeIcon: <MapPin size={21} strokeWidth={2.2} />,
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

/* ------------------------------------------------------------------ */
/*  Admin bottom tabs - wires More to sidebar                          */
/* ------------------------------------------------------------------ */

function AdminBottomTabs() {
  const { openMenu } = useMenuSheet()
  return (
    <BottomTabBar
      tabs={adminBottomTabs}
      layoutPrefix="admin-tab"
      accent="primary"
      onMorePress={openMenu}
    />
  )
}


/* ------------------------------------------------------------------ */
/*  AdminLayout  route-level layout, renders <Outlet />              */
/* ------------------------------------------------------------------ */

/** Pages that are top-level admin destinations (no back button needed). */
const TOP_LEVEL_ADMIN_PATHS = new Set([
  '/admin',
  '/admin/users',
  '/admin/applications',
  '/admin/collectives',
  '/admin/events',
  '/admin/partners',
  '/admin/shop',
  '/admin/contacts',
  '/admin/tasks',
  '/admin/surveys',
  '/admin/email',
  '/admin/updates',
  '/admin/development',
  '/admin/legal-pages',
  '/admin/reports',
  '/admin/audit-log',
  '/admin/dev-tools',
])

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { navMode } = useLayout()
  const showBottomTabs = navMode === 'bottom-tabs'
  const showBackButton = !TOP_LEVEL_ADMIN_PATHS.has(location.pathname)
  const isFullBleedRoute = location.pathname === '/admin' ||
    location.pathname === '/admin/shop' ||
    /^\/admin\/collectives\/[^/]+/.test(location.pathname)
  const [header, setHeaderState] = useState<AdminHeaderState>({ title: '', fullBleed: isFullBleedRoute })
  const scrollRef = useRef<HTMLDivElement>(null)
  const scopeCtx = useAdminCollectiveScopeProvider()

  // Reset fullBleed on route change so the new layout is correct before the
  // child page's useAdminHeader effect fires (prevents the p-6 → p-0 flash on
  // full-bleed pages). Title + other header content carry over from the
  // previous page until the new page's effect runs; clearing them here meant
  // every admin → admin navigation showed a no-hero beat while the new lazy
  // chunk loaded (Tate 2026-06-12: "sometimes hero just doesn't show up on any
  // admin page"). Showing the old title for a frame is less jarring than the
  // whole hero disappearing.
  useEffect(() => {
    setHeaderState((prev) => ({ ...prev, fullBleed: isFullBleedRoute }))
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, isFullBleedRoute])

  const setHeader = useCallback((opts: { title: string; actions?: ReactNode; heroContent?: ReactNode; fullBleed?: boolean }) => {
    setHeaderState(opts)
  }, [])

  const headerCtx = useMemo(() => ({ setHeader }), [setHeader])

  return (
    <AdminCollectiveScopeContext.Provider value={scopeCtx}>
    <AdminHeaderContext.Provider value={headerCtx}>
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar is handled by UnifiedSidebar in AppShell */}

        {/* Mobile drawer + hamburger removed - handled by UnifiedSidebar in AppShell */}

        {/* Main content */}
        {/* The min-h-0 flex chain pins this column to viewport height, so it
            must own the scroll in EVERY nav mode. Gating overflow-y-auto on
            showBottomTabs left desktop sidebar mode (CEO's laptop) with no
            scroller while the inner content uses overflow-clip -> frozen,
            unscrollable admin pages. overscroll-none stays; hide-scrollbar is
            tab-only so desktop keeps a visible scrollbar. (2026-06-08) */}
        <div ref={scrollRef} data-parallax-scroll className={cn(
          'flex-1 flex flex-col min-w-0 min-h-0 bg-surface-1',
          // Mobile/tab mode: app-shell is overflow-hidden (viewport-pinned), so THIS
          // container owns the scroll -> overflow-y-auto. Desktop sidebar mode:
          // app-shell is min-h-dvh (the page grows and the DOCUMENT scrolls), so
          // putting overflow-y-auto here intercepts the wheel over content with no
          // bounded height to scroll -> froze content-scroll on the CEO laptop while
          // the sidebar/footer still scrolled the doc (Tate 2026-06-09). Scope the
          // scroller to tab mode; on desktop the document scrolls. Inner content is
          // overflow-x-clip (not overflow-clip) so Y still reaches the doc scroller.
          showBottomTabs && 'overflow-y-auto overscroll-none hide-scrollbar',
        )}>
          {/* ── Shared hero bar - only for non-fullBleed pages ── */}
          {!header.fullBleed && header.title && header.title !== 'Dashboard' ? (() => {
            const cfg = PAGE_HERO_CONFIG[header.title] ?? DEFAULT_HERO
            return (
              <div
                className={cn(
                  'relative overflow-hidden shrink-0',
                  'bg-gradient-to-br transition-[background] duration-700 ease-in-out',
                  cfg.hue,
                  cfg.tall
                    ? 'px-4 pb-14 sm:px-6 sm:pb-16 lg:px-8'
                    : 'px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8',
                  // Extend the gradient above the hero so overscroll never exposes the surface bg
                  'before:absolute before:inset-x-0 before:bottom-full before:h-[200px] before:bg-inherit',
                )}
                style={{
                  paddingTop: cfg.tall ? '3.5rem' : '2rem',
                }}
              >
                <div className="relative z-10">
                  {/* Back button - dark circle, consistent across all sub-pages */}
                  {showBackButton && (
                    <motion.button
                      type="button"
                      onClick={() => navigate(-1)}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className={cn(
                        'flex items-center justify-center',
                        'w-11 h-11 rounded-full mb-3',
                        'bg-black/40 text-white hover:bg-black/50',
                        'cursor-pointer select-none',
                        'transition-colors duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                      )}
                      aria-label="Go back"
                    >
                      <ArrowLeft size={22} />
                    </motion.button>
                  )}

                  <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white tracking-tight text-center">
                    {header.title}
                  </h1>
                  {header.actions && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      {header.actions}
                    </div>
                  )}

                  {/* Per-page hero content (stats, etc.) */}
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
                    <path d={WAVE_PATHS[cfg.w % WAVE_PATHS.length]} className="fill-surface-1" />
                  </svg>
                </div>
              </div>
            )
          })() : null}

          {/* Content rendered by nested <Route> children */}
          {/*
            Responsive padding: p-4 on phones → p-6 on small tablets → p-8 on
            desktop. Was a flat p-6 which cost 48px horizontal on a 375px
            iPhone SE, squishing content to 327px. /admin/impact was the
            worst offender because it also added its own px-4 sm:px-6 lg:px-8
            inside (stacking doubly). Child pages can now assume horizontal
            padding is already handled here and should not add their own.
          */}
          {/* overflow-x-clip (NOT overflow-clip): on native the shell pins the
              height chain to the viewport (height:calc(100dvh - kb) + overflow-hidden),
              so a flex-1 child with overflow-clip is sized to the visible area and
              CLIPS its content on the Y axis too -> the overflow-y-auto scroll
              container above has nothing to scroll -> admin pages frozen on the
              native app (Kurt's report). Member/leader layouts use this same flex
              chain WITHOUT a Y clip, which is why they scroll. Clip X only so any
              horizontal bleed is still contained while vertical scroll works. (2026-06-08) */}
          <div className={cn(
            'relative flex-1',
            !header.fullBleed && 'overflow-x-clip',
            header.fullBleed ? 'p-0 bg-white' : 'p-4 sm:p-6 lg:p-8',
            !header.fullBleed && 'bg-gradient-to-b from-primary-50/40 via-white to-primary-50/20',
            showBottomTabs && 'pb-[calc(5rem+var(--safe-bottom))]',
          )}>

            <AnimatedOutlet />
          </div>
        </div>

        {/* Admin bottom tab bar - mobile only */}
        {showBottomTabs && (
          <AdminBottomTabs />
        )}
      </div>
    </AdminHeaderContext.Provider>
    </AdminCollectiveScopeContext.Provider>
  )
}
