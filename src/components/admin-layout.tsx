import { type ReactNode, useState, useEffect, useRef, createContext, useContext, useCallback, useMemo, Suspense } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { AdminCollectiveScopeContext, useAdminCollectiveScopeProvider } from '@/hooks/use-admin-collective-scope'
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

interface HeroCfg { hue: string; tall?: boolean; f: number; w: number }

const PAGE_HERO_CONFIG: Record<string, HeroCfg> = {
  'Dashboard':           { hue: 'from-primary-800 via-primary-900 to-primary-950',  f: 0, w: 0 },
  'Collectives':         { hue: 'from-primary-600 via-primary-700 to-primary-900',  f: 1, w: 1, tall: true },
  'User Management':     { hue: 'from-primary-800 via-primary-850 to-neutral-900',  f: 2, w: 2, tall: true },
  'Workflows':           { hue: 'from-primary-700 via-primary-800 to-primary-950',  f: 3, w: 3, tall: true },
  'Events':              { hue: 'from-accent-700 via-accent-800 to-primary-950',    f: 4, w: 4, tall: true },
  'Create':              { hue: 'from-primary-700 via-primary-800 to-primary-950',  f: 5, w: 0, tall: true },
  'Surveys':             { hue: 'from-primary-800 via-primary-850 to-neutral-900',  f: 6, w: 1, tall: true },
  'Reports':             { hue: 'from-primary-700 via-primary-900 to-primary-950',  f: 7, w: 2, tall: true },
  'Email Marketing':     { hue: 'from-primary-900 via-primary-950 to-neutral-900',  f: 8, w: 3, tall: true },
  'Charity Settings':    { hue: 'from-primary-800 via-primary-900 to-neutral-900',  f: 9, w: 4, tall: true },
  'Export Centre':       { hue: 'from-primary-700 via-primary-900 to-primary-950',  f: 10, w: 0, tall: true },
  'Audit Log':           { hue: 'from-primary-900 via-primary-950 to-neutral-900',  f: 11, w: 1, tall: true },
  'Branding & Images':   { hue: 'from-primary-800 via-primary-850 to-neutral-900',  f: 0, w: 2, tall: true },
  'System':              { hue: 'from-primary-900 via-neutral-900 to-neutral-950',  f: 1, w: 3, tall: true },
  'Merch Management':    { hue: 'from-primary-800 via-primary-900 to-primary-950',  f: 3, w: 0, tall: true },
  'Applications':        { hue: 'from-sprout-700 via-primary-800 to-primary-950',   f: 4, w: 1, tall: true },
  'Create Survey':       { hue: 'from-primary-800 via-primary-850 to-neutral-900',  f: 5, w: 2, tall: true },
  'Dev Tools':           { hue: 'from-primary-900 via-neutral-900 to-neutral-950',  f: 6, w: 3, tall: true },
  'Partners & Sponsors': { hue: 'from-primary-700 via-primary-800 to-neutral-900',  f: 7, w: 4, tall: true },
  'Challenges':          { hue: 'from-accent-700 via-primary-800 to-primary-950',   f: 8, w: 0, tall: true },
  'Content Moderation':  { hue: 'from-primary-900 via-primary-950 to-neutral-900',  f: 9, w: 1, tall: true },
  'Organisational Policies': { hue: 'from-primary-800 via-primary-900 to-neutral-900',  f: 10, w: 2, tall: true },
  'Edit Policy':         { hue: 'from-primary-800 via-primary-900 to-neutral-900',  f: 10, w: 2, tall: true },
  'Updates':             { hue: 'from-secondary-700 via-primary-800 to-primary-950', f: 2, w: 3, tall: true },
  'New Update':          { hue: 'from-secondary-700 via-primary-800 to-primary-950', f: 2, w: 3, tall: true },
  'Development':         { hue: 'from-amber-700 via-amber-800 to-primary-950',     f: 3, w: 4, tall: true },
  'Create Module':       { hue: 'from-amber-600 via-amber-700 to-primary-900',     f: 4, w: 0, tall: true },
  'Edit Module':         { hue: 'from-amber-600 via-amber-700 to-primary-900',     f: 4, w: 0, tall: true },
  'Module Detail':       { hue: 'from-amber-600 via-amber-700 to-primary-900',     f: 5, w: 1, tall: true },
  'Create Section':      { hue: 'from-amber-700 via-amber-800 to-primary-950',     f: 6, w: 2, tall: true },
  'Edit Section':        { hue: 'from-amber-700 via-amber-800 to-primary-950',     f: 6, w: 2, tall: true },
  'Create Quiz':         { hue: 'from-amber-800 via-primary-800 to-primary-950',   f: 7, w: 3, tall: true },
  'Edit Quiz':           { hue: 'from-amber-800 via-primary-800 to-primary-950',   f: 7, w: 3, tall: true },
  'Development Results': { hue: 'from-amber-700 via-primary-900 to-primary-950',   f: 8, w: 4, tall: true },
  'Emergency Contacts':  { hue: 'from-red-700 via-primary-800 to-primary-950',    f: 9, w: 0, tall: true },
}

const DEFAULT_HERO: HeroCfg = { hue: 'from-primary-800 via-primary-900 to-primary-950', tall: true, f: 11, w: 3 }


/* ------------------------------------------------------------------ */
/*  Shape formations – unique decorative geometry per page             */
/* ------------------------------------------------------------------ */

type ShapeFormation = Array<{ className: string }>

const SHAPE_FORMATIONS: ShapeFormation[] = [
  // 0 - Top-right cluster + bottom-left accent
  [
    { className: 'absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/[0.05]' },
    { className: 'absolute -right-4 top-2 w-36 h-36 rounded-full border border-white/[0.08]' },
    { className: 'absolute -left-10 bottom-0 w-40 h-40 rounded-full bg-white/[0.04]' },
    { className: 'absolute right-12 bottom-6 w-16 h-16 rounded-full border border-white/[0.10]' },
  ],
  // 1 - Diagonal drift (top-left → bottom-right)
  [
    { className: 'absolute -left-12 -top-12 w-56 h-56 rounded-full bg-white/[0.06]' },
    { className: 'absolute left-[30%] top-[20%] w-20 h-20 rounded-full border border-white/[0.08]' },
    { className: 'absolute right-[15%] bottom-[10%] w-32 h-32 rounded-full bg-white/[0.04]' },
    { className: 'absolute -right-8 -bottom-8 w-48 h-48 rounded-full border border-white/[0.06]' },
  ],
  // 2 - Centre constellation
  [
    { className: 'absolute left-[40%] -top-10 w-52 h-52 rounded-full bg-white/[0.05]' },
    { className: 'absolute left-[25%] top-[35%] w-16 h-16 rounded-full border border-white/[0.10]' },
    { className: 'absolute right-[20%] bottom-4 w-24 h-24 rounded-full bg-white/[0.04]' },
    { className: 'absolute -left-6 bottom-[20%] w-28 h-28 rounded-full border border-white/[0.07]' },
  ],
  // 3 - Bottom-heavy ring pair
  [
    { className: 'absolute -right-20 -bottom-20 w-72 h-72 rounded-full border border-white/[0.06]' },
    { className: 'absolute -right-8 -bottom-8 w-44 h-44 rounded-full border border-white/[0.04]' },
    { className: 'absolute -left-14 -top-14 w-44 h-44 rounded-full bg-white/[0.05]' },
    { className: 'absolute right-[30%] top-4 w-14 h-14 rounded-full bg-white/[0.06]' },
  ],
  // 4 - Scattered pebbles
  [
    { className: 'absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/[0.04]' },
    { className: 'absolute left-[10%] top-[15%] w-12 h-12 rounded-full bg-white/[0.08]' },
    { className: 'absolute right-[25%] top-[40%] w-10 h-10 rounded-full border border-white/[0.12]' },
    { className: 'absolute -left-8 -bottom-8 w-36 h-36 rounded-full border border-white/[0.06]' },
    { className: 'absolute left-[50%] bottom-3 w-8 h-8 rounded-full bg-white/[0.06]' },
  ],
  // 5 - Left pillar + right accent
  [
    { className: 'absolute -left-20 -top-20 w-72 h-72 rounded-full border border-white/[0.07]' },
    { className: 'absolute -left-8 -top-8 w-44 h-44 rounded-full bg-white/[0.05]' },
    { className: 'absolute right-6 top-6 w-20 h-20 rounded-full border border-white/[0.10]' },
    { className: 'absolute right-[10%] -bottom-6 w-32 h-32 rounded-full bg-white/[0.03]' },
  ],
  // 6 - Floating archipelago
  [
    { className: 'absolute right-[5%] -top-6 w-36 h-36 rounded-full bg-white/[0.05]' },
    { className: 'absolute -left-14 top-[30%] w-40 h-40 rounded-full border border-white/[0.06]' },
    { className: 'absolute left-[55%] bottom-[15%] w-20 h-20 rounded-full bg-white/[0.06]' },
    { className: 'absolute right-4 bottom-10 w-12 h-12 rounded-full border border-white/[0.10]' },
    { className: 'absolute left-[20%] -bottom-4 w-24 h-24 rounded-full bg-white/[0.04]' },
  ],
  // 7 - Twin moons
  [
    { className: 'absolute -right-16 top-[10%] w-56 h-56 rounded-full bg-white/[0.05]' },
    { className: 'absolute -left-16 bottom-[5%] w-56 h-56 rounded-full bg-white/[0.05]' },
    { className: 'absolute left-[45%] top-2 w-14 h-14 rounded-full border border-white/[0.10]' },
    { className: 'absolute right-[30%] bottom-8 w-10 h-10 rounded-full border border-white/[0.08]' },
  ],
  // 8 - Crescent sweep (right arc)
  [
    { className: 'absolute -right-24 top-[5%] w-72 h-72 rounded-full border border-white/[0.06]' },
    { className: 'absolute -right-12 top-[15%] w-48 h-48 rounded-full bg-white/[0.04]' },
    { className: 'absolute left-[8%] top-[10%] w-16 h-16 rounded-full bg-white/[0.07]' },
    { className: 'absolute left-[25%] bottom-6 w-20 h-20 rounded-full border border-white/[0.09]' },
  ],
  // 9 - Horizon line (mid-band emphasis)
  [
    { className: 'absolute -left-16 top-[30%] w-60 h-60 rounded-full bg-white/[0.05]' },
    { className: 'absolute right-[10%] top-[25%] w-36 h-36 rounded-full border border-white/[0.07]' },
    { className: 'absolute left-[45%] top-[40%] w-12 h-12 rounded-full bg-white/[0.08]' },
    { className: 'absolute -right-6 -bottom-10 w-40 h-40 rounded-full border border-white/[0.05]' },
  ],
  // 10 - Ascending bubbles (bottom-left → top-right)
  [
    { className: 'absolute -left-10 -bottom-14 w-52 h-52 rounded-full bg-white/[0.05]' },
    { className: 'absolute left-[20%] bottom-[30%] w-18 h-18 rounded-full border border-white/[0.09]' },
    { className: 'absolute left-[45%] top-[25%] w-14 h-14 rounded-full bg-white/[0.06]' },
    { className: 'absolute right-[10%] -top-8 w-44 h-44 rounded-full border border-white/[0.06]' },
    { className: 'absolute right-[30%] top-[15%] w-10 h-10 rounded-full bg-white/[0.07]' },
  ],
  // 11 - Solitary giant + orbiting specs
  [
    { className: 'absolute left-[15%] -top-20 w-80 h-80 rounded-full bg-white/[0.04]' },
    { className: 'absolute right-[5%] top-[20%] w-12 h-12 rounded-full border border-white/[0.12]' },
    { className: 'absolute right-[20%] bottom-[15%] w-8 h-8 rounded-full bg-white/[0.08]' },
    { className: 'absolute -left-4 bottom-4 w-24 h-24 rounded-full border border-white/[0.06]' },
  ],
]

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
  '/admin/exports',
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

  // Reset header state on route change so fullBleed is correct before the child
  // page's useEffect fires (prevents the p-6 → p-0 flash on full-bleed pages).
  useEffect(() => {
    setHeaderState({ title: '', fullBleed: isFullBleedRoute })
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
        <div ref={scrollRef} data-parallax-scroll className={cn(
          'flex-1 flex flex-col min-w-0 min-h-0 bg-surface-1',
          showBottomTabs && 'overflow-y-auto overscroll-none hide-scrollbar',
        )}>
          {/* ── Shared hero bar - only for non-fullBleed pages ── */}
          {!header.fullBleed && header.title && header.title !== 'Dashboard' ? (() => {
            const cfg = PAGE_HERO_CONFIG[header.title] ?? DEFAULT_HERO
            const shapes = SHAPE_FORMATIONS[cfg.f % SHAPE_FORMATIONS.length]
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
                {/* Decorative shapes - unique formation per page */}
                {shapes.map((s, i) => (
                  <div key={i} className={cn('pointer-events-none', s.className)} />
                ))}

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
          <div className={cn(
            'relative flex-1',
            !header.fullBleed && 'overflow-clip',
            header.fullBleed ? 'p-0 bg-white' : 'p-4 sm:p-6 lg:p-8',
            !header.fullBleed && 'bg-gradient-to-b from-primary-50/40 via-white to-primary-50/20',
            showBottomTabs && 'pb-[calc(5rem+var(--safe-bottom))]',
          )}>

            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
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
