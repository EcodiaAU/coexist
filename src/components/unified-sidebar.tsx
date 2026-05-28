import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    Settings,
    Shield,
    X,
    ChevronRight, MessageCircle,
    BookOpen,
    Megaphone,
    TreePine,
    Leaf
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { APP_NAME } from '@/lib/constants'
import { useAuth } from '@/hooks/use-auth'
import { useCollective } from '@/hooks/use-collective'
import { useHasPartners } from '@/hooks/use-has-partners'
import { useUnreadUpdateCount } from '@/hooks/use-updates'
import { useUnreadCount as useUnreadNotificationCount } from '@/hooks/use-notifications'
import { useLayout } from '@/hooks/use-layout'
import { Avatar } from '@/components/avatar'

import {
    SidebarShell,
    SidebarNavList,
    getAccentClasses,
    adminHomeItem,
    adminNavCategories,
    leaderHomeItem,
    leaderNavCategories,
    memberHomeItem,
    memberNavCategories,
} from '@/components/sidebar'
import type { Suite, NavItem, NavCategory } from '@/components/sidebar'

/* ------------------------------------------------------------------ */
/*  Suite identity config                                              */
/* ------------------------------------------------------------------ */

interface SuiteIdentity {
  key: Suite
  label: string
  subtitle: string
  path: string
  icon: React.ReactNode
  iconSmall: React.ReactNode
  iconGradient: string
  badgeBg: string
  badgeBorder: string
  labelColor: string
  pillHover: string
}

function getSuiteIdentity(suite: Suite, collectiveName: string): SuiteIdentity {
  switch (suite) {
    case 'admin':
      return {
        key: 'admin',
        label: 'Admin',
        subtitle: 'Co-Exist',
        path: '/admin',
        icon: <Shield size={14} className="text-white" />,
        iconSmall: <Shield size={12} className="text-white" />,
        iconGradient: 'from-primary-700 to-primary-900',
        badgeBg: 'from-primary-50/80 to-primary-50/30',
        badgeBorder: 'border-neutral-100',
        labelColor: 'text-primary-500',
        pillHover: 'hover:bg-neutral-50',
      }
    case 'leader':
      return {
        key: 'leader',
        label: 'Leader',
        subtitle: collectiveName,
        path: '/leader',
        icon: <TreePine size={14} className="text-white" />,
        iconSmall: <TreePine size={12} className="text-white" />,
        iconGradient: 'from-moss-400 to-moss-600',
        badgeBg: 'from-moss-50/80 to-moss-50/30',
        badgeBorder: 'border-moss-100/30',
        labelColor: 'text-moss-500',
        pillHover: 'hover:bg-neutral-50',
      }
    default:
      return {
        key: 'main',
        label: 'Member',
        subtitle: 'Co-Exist',
        path: '/',
        icon: <Leaf size={14} className="text-white" />,
        iconSmall: <Leaf size={12} className="text-white" />,
        iconGradient: 'from-sprout-500 to-primary-600',
        badgeBg: 'from-sprout-50/80 to-primary-50/30',
        badgeBorder: 'border-sprout-100/30',
        labelColor: 'text-sprout-600',
        pillHover: 'hover:bg-neutral-50',
      }
  }
}

/* ------------------------------------------------------------------ */
/*  Mobile profile card                                                */
/* ------------------------------------------------------------------ */

function MobileProfileCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { profile } = useAuth()

  return (
    <button
      type="button"
      onClick={() => onNavigate('/profile')}
      className={cn(
        'w-full flex items-center gap-3.5 p-3 group',
        'bg-gradient-to-br from-primary-50/80 to-primary-50/30',
        'rounded-2xl border border-neutral-100',
        'cursor-pointer select-none text-left',
        'hover:from-primary-50 hover:to-primary-50/50',
        'transition-transform duration-200 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
      )}
    >
      <Avatar
        src={profile?.avatar_url}
        name={profile?.display_name ?? ''}
        size="lg"
      />
      <div className="flex-1 min-w-0">
        <p className="font-heading text-[15px] sm:text-[17px] font-bold text-neutral-900 line-clamp-2 leading-tight">
          {profile?.display_name}
        </p>
      </div>
      <ChevronRight
        size={16}
        strokeWidth={1.5}
        className="text-neutral-300 group-hover:text-neutral-400 transition-colors shrink-0"
      />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Mobile overlay sidebar                                             */
/* ------------------------------------------------------------------ */

const instantTransition = { duration: 0 }

function MobileSidebarOverlay({
  open,
  onClose,
  suite: urlSuite,
  flatCategories,
  isActive,
  reduced,
}: {
  open: boolean
  onClose: () => void
  suite: Suite
  collectiveName: string
  availableSuites: Suite[]
  allSuiteCategories: Record<Suite, NavCategory[]>
  flatCategories: NavCategory[]
  isActive: (path: string) => boolean
  reduced: boolean
  profile: Record<string, unknown> | null | undefined
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const sheetRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const [mobileSuite, setMobileSuite] = useState<Suite>(urlSuite)

  useEffect(() => {
    if (open) setMobileSuite(urlSuite)
  }, [open, urlSuite])

  const handleNavigate = useCallback(
    (to: string) => {
      onClose()
      requestAnimationFrame(() => navigate(to))
    },
    [navigate, onClose],
  )

  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
      requestAnimationFrame(() => sheetRef.current?.focus())
    } else {
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }, [])

  const accent = getAccentClasses(mobileSuite)

  const slideTransition = shouldReduceMotion
    ? instantTransition
    : { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.7 }

  const backdropTransition = shouldReduceMotion
    ? instantTransition
    : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as const }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="fixed inset-0 bg-black/50 gpu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: backdropTransition }}
            exit={{ opacity: 0, transition: shouldReduceMotion ? instantTransition : { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            tabIndex={-1}
            className={cn(
              'fixed top-0 right-0 bottom-0',
              'w-[min(84vw,360px)]',
              'bg-white gpu-panel',
              'shadow-xl',
              'flex flex-col',
              'outline-none',
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: slideTransition }}
            exit={{
              x: '100%',
              transition: shouldReduceMotion
                ? instantTransition
                : { type: 'spring', stiffness: 380, damping: 34 },
            }}
            onKeyDown={handleKeyDown}
          >
            <div
              className="px-5 pb-4"
              style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1" />
                <img
                  src="/logos/black-wordmark.png"
                  alt={APP_NAME}
                  className="h-5 w-auto"
                />
                <div className="flex-1 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className={cn(
                      'flex items-center justify-center w-11 h-11 rounded-xl',
                      'bg-neutral-50 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100',
                      'transition-transform duration-150 active:scale-[0.90]',
                      'cursor-pointer select-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                    )}
                    aria-label="Close menu"
                  >
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <MobileProfileCard onNavigate={handleNavigate} />
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-none hide-scrollbar"
              style={{
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 2rem)',
              }}
            >
              <SidebarNavList
                suite="main"
                categories={flatCategories}
                collapsed={false}
                isCurrent
                isActive={isActive}
                reduced={reduced}
                isMobileMode
                onNavigate={handleNavigate}
              />
            </div>

            <div
              className={cn('p-2.5 border-t', accent.borderColor)}
              style={{
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.625rem)',
              }}
            >
              <button
                type="button"
                onClick={() => handleNavigate('/settings')}
                className={cn(
                  'flex items-center gap-2.5 w-full px-2.5 h-9',
                  'rounded-xl text-[13px]',
                  'text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700',
                  'transition-[colors,transform] duration-150 active:scale-[0.97]',
                  'cursor-pointer select-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                )}
              >
                <Settings size={17} strokeWidth={1.5} />
                <span>Settings</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/*  UnifiedSidebar - orchestrator                                      */
/* ------------------------------------------------------------------ */

interface UnifiedSidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function UnifiedSidebar({ mobileOpen, onMobileClose }: UnifiedSidebarProps) {
  const location = useLocation()
  const { navMode } = useLayout()
  const shouldReduceMotion = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)
  const { user, profile, collectiveRoles, isStaff, isManager, isSuperAdmin, hasCapability } = useAuth()
  // 1.8.5 item 7 (fork_moy0xmrx_158384) - admin sidebar gated by isManager
  // (manager+admin), not isStaff (which includes national_leader). Per Tate
  // verbatim 16:44 AEST 9 May 2026: "leaders can't see or access admin pages."
  const isAdminTier = isManager
  const { hasPartners } = useHasPartners()
  // Sidesheet "Updates" entry pill = combined unread announcements + unread
  // personal notifications, matching the count shown in the /updates page
  // header. Clears the moment the user opens /updates (see useMarkAllUpdatesRead).
  const { data: unreadUpdates = 0 } = useUnreadUpdateCount()
  const { data: unreadNotifications = 0 } = useUnreadNotificationCount()
  const updatesBadgeCount = unreadUpdates + unreadNotifications

  const isDevUser = import.meta.env.DEV &&
    !!user?.email &&
    (import.meta.env.VITE_DEV_EMAILS ?? '').split(',').map((e: string) => e.trim().toLowerCase()).includes(user.email.toLowerCase())

  const suite: Suite = location.pathname.startsWith('/admin')
    ? 'admin'
    : location.pathname.startsWith('/leader') && !location.pathname.startsWith('/leaderboard') && !location.pathname.startsWith('/leadership')
      ? 'leader'
      : 'main'

  const leaderCollectiveId = useMemo(() => {
    const membership = collectiveRoles.find(
      (m) => ['leader', 'co_leader', 'assist_leader'].includes(m.role),
    )
    return membership?.collective_id
  }, [collectiveRoles])

  const { data: collectiveDetail } = useCollective(suite === 'leader' ? leaderCollectiveId : undefined)
  const collectiveName = (collectiveDetail?.name ?? 'My Collective').replace(/\s+Collective$/i, '')

  const isAnyLeader = isStaff || collectiveRoles.some(
    (m) => ['leader', 'co_leader', 'assist_leader'].includes(m.role),
  )

  const availableSuites = useMemo<Suite[]>(() => {
    const suites: Suite[] = ['main']
    if (isAnyLeader) suites.push('leader')
    // 1.8.5 item 7 - admin suite is manager+admin only, not "isStaff" which
    // includes national_leader. Leaders use /leader for collective scope.
    if (isAdminTier) suites.push('admin')
    return suites
  }, [isAnyLeader, isAdminTier])

  /** Paths to hide from member nav when their backing data is empty */
  const hiddenPaths = useMemo(() => {
    const paths: string[] = []
    if (!hasPartners) paths.push('/partners')
    return paths
  }, [hasPartners])

  const filterMemberItems = useCallback(
    (items: NavItem[]) => items.filter((item) => !hiddenPaths.includes(item.path)),
    [hiddenPaths],
  )

  const allSuiteCategories = useMemo(() => {
    const result: Record<Suite, NavCategory[]> = { main: [], admin: [], leader: [] }
    result.main = memberNavCategories
      .map((cat) => ({ ...cat, items: filterMemberItems(cat.items) }))
      .filter((cat) => cat.items.length > 0)
    if (isAdminTier) {
      result.admin = adminNavCategories
        .filter((cat) => !cat.superAdminOnly || isSuperAdmin)
        .map((cat) => ({
          ...cat,
          items: cat.items.filter((item) =>
            (!item.capability || hasCapability(item.capability)) &&
            (!item.devOnly || isDevUser)
          ),
        }))
        .filter((cat) => cat.items.length > 0)
    }
    if (isAnyLeader) {
      result.leader = leaderNavCategories
    }
    return result
  }, [isSuperAdmin, hasCapability, isAnyLeader, isAdminTier, isDevUser, filterMemberItems])

  const flatCategories = useMemo(() => {
    // 1.8.5 item 7 - admin home + admin nav appear only for manager+admin tier.
    // Leaders default to leader-home; collective leaders without admin tier
    // get the leader suite via isAnyLeader below.
    const highestHome = isAdminTier ? adminHomeItem : isAnyLeader ? leaderHomeItem : memberHomeItem

    const updatesItem: NavItem = { label: 'Updates', path: '/updates', icon: <Megaphone size={17} strokeWidth={1.5} />, badge: updatesBadgeCount }
    const chatItem: NavItem = { label: 'Chat', path: '/chat', icon: <MessageCircle size={17} strokeWidth={1.5} />, desktopOnly: true }
    const learnItem: NavItem = { label: 'Learn', path: '/learn', icon: <BookOpen size={17} strokeWidth={1.5} /> }

    // Learn is gated to staff + collective leaders (assist/co/leader). Participants
    // and non-admin members don't see it (Tate verbatim 2026-05-28: "participant
    // sees Learn, that's only for assistant/coleader/leaders and staff").
    const topItems: NavItem[] = isAdminTier
      ? [highestHome, chatItem, updatesItem]
      : isAnyLeader
        ? [highestHome, chatItem, learnItem, updatesItem]
        : [highestHome, chatItem, updatesItem]

    const cats: NavCategory[] = [{ label: '', items: topItems }]

    if (isAdminTier) {
      const adminCats = adminNavCategories
        .filter((cat) => !cat.superAdminOnly || isSuperAdmin)
        .map((cat, i) => ({
          ...cat,
          items: [
            ...(i === 0 && highestHome !== adminHomeItem ? [adminHomeItem] : []),
            ...cat.items.filter((item) =>
              (!item.capability || hasCapability(item.capability)) &&
              (!item.superAdminOnly || isSuperAdmin) &&
              (!item.devOnly || isDevUser)
            ),
          ],
        }))
        .filter((cat) => cat.items.length > 0)
      cats.push(...adminCats)
    }

    if (isAnyLeader) {
      const leaderCats = leaderNavCategories.map((cat, i) => ({
        ...cat,
        items: [
          ...(i === 0 && highestHome !== leaderHomeItem ? [leaderHomeItem] : []),
          ...cat.items,
        ],
      }))
      cats.push(...leaderCats)
    }

    const memberCats = memberNavCategories.map((cat, i) => ({
      ...cat,
      items: filterMemberItems([
        ...(i === 0 && highestHome !== memberHomeItem ? [memberHomeItem] : []),
        ...cat.items.filter((item) => item.path !== '/updates' && item.path !== '/chat'),
      ]),
    })).filter((cat) => cat.items.length > 0)
    cats.push(...memberCats)

    return cats
  }, [isAnyLeader, isAdminTier, isSuperAdmin, hasCapability, isDevUser, filterMemberItems, updatesBadgeCount])

  const isActive = (path: string) => {
    if (path === '/' || path === '/admin' || path === '/leader') {
      return location.pathname === path
    }
    return location.pathname.startsWith(path)
  }

  const reduced = !!shouldReduceMotion
  const isMobileMode = navMode === 'bottom-tabs'

  // ── Mobile mode: render overlay sidebar ──
  if (isMobileMode) {
    return (
      <MobileSidebarOverlay
        open={!!mobileOpen}
        onClose={onMobileClose ?? (() => {})}
        suite={suite}
        collectiveName={collectiveName}
        availableSuites={availableSuites}
        allSuiteCategories={allSuiteCategories}
        flatCategories={flatCategories}
        isActive={isActive}
        reduced={reduced}
        profile={profile}
      />
    )
  }

  // ── Desktop mode: shell + nav list ──
  return (
    <SidebarShell
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((p) => !p)}
    >
      <SidebarNavList
        suite="main"
        categories={flatCategories}
        collapsed={collapsed}
        isCurrent
        isActive={isActive}
        reduced={reduced}
        isMobileMode={false}
      />
    </SidebarShell>
  )
}
