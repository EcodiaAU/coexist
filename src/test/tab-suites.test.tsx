import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/*
 * ONE BOTTOM TAB BAR FOR THE WHOLE APP.
 *
 * Reported by Tate 2026-10-22 (iMessage 4142): on his iPhone the bottom bar was
 * Apple's Liquid Glass on the member pages and turned into a plain white bar on
 * every leader and admin page. Root cause: the leader and admin layouts each
 * mounted their OWN web BottomTabBar (with their own accent and icon styling),
 * and the app shell hid the glass bar on /leader and /admin so the two would
 * not stack. Two bars, two styles, chosen by route.
 *
 * Now there is one host (LocationAwareChrome in app-shell.tsx) and one table
 * (src/lib/tab-suites.ts). The route picks the suite's four tabs; the host
 * renders them as the glass bar on a capable iPhone and as the one web bar
 * everywhere else. The source guards below stop a layout from mounting its own
 * bar again, which is exactly how this drifted the first time.
 */

vi.mock('@/hooks/use-platform', () => ({ usePlatform: () => ({ isAndroid: false, isIOS: false, isNative: false, isWeb: true }) }))

import { TAB_SUITES, activeTabKey, isTabActive, resolveSuite, selectedTabKey } from '@/lib/tab-suites'
import { BottomTabBar } from '@/components/bottom-tab-bar'

const SRC = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'test' || name === 'node_modules') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

describe('resolveSuite', () => {
  it('maps admin and leader routes to their suites and everything else to the member app', () => {
    expect(resolveSuite('/')).toBe('main')
    expect(resolveSuite('/chat/abc')).toBe('main')
    expect(resolveSuite('/events/123')).toBe('main')
    expect(resolveSuite('/admin')).toBe('admin')
    expect(resolveSuite('/admin/collectives/xyz')).toBe('admin')
    expect(resolveSuite('/leader')).toBe('leader')
    expect(resolveSuite('/leader/events/new')).toBe('leader')
  })

  it('keeps /leaderboard and /leadership in the member app', () => {
    expect(resolveSuite('/leaderboard')).toBe('main')
    expect(resolveSuite('/leadership')).toBe('main')
  })
})

describe('TAB_SUITES', () => {
  it('gives every suite exactly four tabs, so the glass bar swaps items without re-hosting the WebView', () => {
    for (const tabs of Object.values(TAB_SUITES)) expect(tabs).toHaveLength(4)
  })

  it('ends every suite with More and gives every tab a web icon and both SF Symbols', () => {
    for (const tabs of Object.values(TAB_SUITES)) {
      expect(tabs[3].isMore).toBe(true)
      for (const t of tabs) {
        expect(t.icon).toBeTruthy()
        expect(t.sfSymbol).toMatch(/^[a-z0-9.]+$/)
        expect(t.sfSymbolSelected).toMatch(/^[a-z0-9.]+$/)
      }
    }
  })

  it('carries the same tabs, in order, as each suite always had', () => {
    expect(TAB_SUITES.main.map((t) => t.label)).toEqual(['Home', 'Chat', 'Profile', 'More'])
    expect(TAB_SUITES.leader.map((t) => t.label)).toEqual(['App', 'Dashboard', 'Events', 'More'])
    expect(TAB_SUITES.admin.map((t) => t.label)).toEqual(['App', 'Chat', 'Collectives', 'More'])
  })

  it('keys a tab by where it goes, so App and Home share an id and the selection carries across suites', () => {
    expect(TAB_SUITES.leader[0].key).toBe('home')
    expect(TAB_SUITES.admin[0].key).toBe('home')
    expect(TAB_SUITES.admin[1].key).toBe('chat')
    for (const tabs of Object.values(TAB_SUITES)) {
      expect(new Set(tabs.map((t) => t.key)).size).toBe(tabs.length)
    }
  })
})

describe('tab selection', () => {
  it('matches exact tabs exactly and the rest by prefix, and never selects More', () => {
    expect(activeTabKey(TAB_SUITES.main, '/')).toBe('home')
    expect(activeTabKey(TAB_SUITES.main, '/profile/donations')).toBe('profile')
    expect(activeTabKey(TAB_SUITES.leader, '/leader')).toBe('leader-home')
    expect(activeTabKey(TAB_SUITES.leader, '/leader/events/abc')).toBe('leader-events')
    expect(activeTabKey(TAB_SUITES.admin, '/admin/collectives/abc')).toBe('admin-collectives')
    expect(activeTabKey(TAB_SUITES.main, '/events/123')).toBeNull()
    expect(activeTabKey(TAB_SUITES.admin, '/admin')).toBeNull()
    expect(isTabActive(TAB_SUITES.main[3], '/more')).toBe(false)
  })

  it('keeps the last tab on a route outside every tab when the suite has it, else the first tab', () => {
    expect(selectedTabKey(TAB_SUITES.main, '/events/1', 'chat')).toBe('chat')
    expect(selectedTabKey(TAB_SUITES.admin, '/admin', 'chat')).toBe('chat')
    expect(selectedTabKey(TAB_SUITES.admin, '/admin', 'profile')).toBe('home')
    expect(selectedTabKey(TAB_SUITES.leader, '/leader/tasks', 'leader-events')).toBe('leader-events')
    expect(selectedTabKey(TAB_SUITES.leader, '/leader/tasks', null)).toBe('home')
    expect(selectedTabKey(TAB_SUITES.main, '/events/1', 'more')).toBe('home')
    expect(selectedTabKey(TAB_SUITES.leader, '/leader', 'chat')).toBe('leader-home')
  })
})

describe('the web bar looks the same in every suite', () => {
  function navClass(path: string, tabs: (typeof TAB_SUITES)[keyof typeof TAB_SUITES]) {
    const { unmount } = render(
      <MemoryRouter initialEntries={[path]}>
        <BottomTabBar tabs={tabs} />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('tablist')
    const selected = screen.getAllByRole('tab').find((b) => b.getAttribute('aria-selected') === 'true')
    const out = {
      nav: nav.className,
      selected: selected?.textContent ?? null,
      selectedClass: selected?.className ?? null,
      idleClass: screen.getAllByRole('tab').find((b) => b.getAttribute('aria-selected') === 'false')!.className,
    }
    unmount()
    return out
  }

  it('renders the member, leader and admin bars with identical chrome and active styling', () => {
    const member = navClass('/', TAB_SUITES.main)
    const leader = navClass('/leader', TAB_SUITES.leader)
    const admin = navClass('/admin/collectives', TAB_SUITES.admin)
    expect(member.selected).toBe('Home')
    expect(leader.selected).toBe('Dashboard')
    expect(admin.selected).toBe('Collectives')
    expect(leader.nav).toBe(member.nav)
    expect(admin.nav).toBe(member.nav)
    expect(leader.selectedClass).toBe(member.selectedClass)
    expect(admin.selectedClass).toBe(member.selectedClass)
    expect(leader.idleClass).toBe(member.idleClass)
    expect(admin.idleClass).toBe(member.idleClass)
  })
})

describe('one bar host (source guards)', () => {
  it('mounts BottomTabBar and NativeTabBarController only in the app shell', () => {
    const offenders = walk(SRC)
      .filter((p) => !p.endsWith('components/app-shell.tsx'))
      .filter((p) => /<(BottomTabBar|NativeTabBarController)\b/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p))
    expect(offenders).toEqual([])
  })

  it('never hides the bar by suite: the shell only hides it for the keyboard', () => {
    const shell = read('components/app-shell.tsx')
    expect(shell).toMatch(/<NativeTabBarController\s[\s\S]*?tabs=\{tabs\}[\s\S]*?visible=\{!keyboardOpen\}/)
    expect(shell).not.toMatch(/isAdminRoute|isLeaderRoute/)
  })

  it('keeps the /leader-but-not-/leaderboard rule in one place', () => {
    const offenders = walk(SRC)
      .filter((p) => !p.endsWith('lib/tab-suites.ts'))
      .filter((p) => readFileSync(p, 'utf8').includes("startsWith('/leaderboard')"))
      .map((p) => relative(SRC, p))
    expect(offenders).toEqual([])
  })

  it('clears the shell bar in the leader and admin layouts with --tab-bar-space, never a literal web-bar height', () => {
    for (const f of ['components/leader-layout.tsx', 'components/admin-layout.tsx']) {
      const s = read(f)
      expect(s).toContain('var(--tab-bar-space,3.5rem)')
      expect(s).not.toContain('calc(5rem+var(--safe-bottom))')
    }
  })
})

/* The glass bar itself: the controller must push the suite's tabs to the
 * plugin and resolve a tap against the CURRENT suite, or Dashboard, Events and
 * Collectives would push the right items and then do nothing when tapped. */
const plugin = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  listener: null as null | ((e: { id: string }) => void),
}))
vi.mock('@capgo/capacitor-native-navigation', () => ({
  NativeNavigation: {
    configure: vi.fn(async () => {}),
    addListener: vi.fn(async (_name: string, fn: (e: { id: string }) => void) => {
      plugin.listener = fn
      return { remove: vi.fn(async () => {}) }
    }),
    setTabbar: vi.fn(async (opts: Record<string, unknown>) => { plugin.calls.push(opts) }),
  },
}))

describe('NativeTabBarController (glass bar) on member, leader and admin routes', () => {
  async function mount(path: string) {
    const { NativeTabBarController } = await import('@/components/native-tab-bar-controller')
    const { useLocation } = await import('react-router-dom')
    const { act } = await import('@testing-library/react')
    plugin.calls.length = 0
    plugin.listener = null
    const seen: string[] = []
    function Probe() { seen.push(useLocation().pathname); return null }
    function Host() {
      const suite = resolveSuite(useLocation().pathname)
      return <NativeTabBarController tabs={TAB_SUITES[suite]} visible chatBadge={3} onMorePress={() => {}} />
    }
    const utils = render(
      <MemoryRouter initialEntries={[path]}>
        <Host />
        <Probe />
      </MemoryRouter>,
    )
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    const last = () => plugin.calls.filter((c) => c.hidden === false).at(-1) as { selectedId: string; tabs: Array<{ id: string; title: string; badge?: string }> }
    const tap = async (id: string) => { await act(async () => { plugin.listener!({ id }); await new Promise((r) => setTimeout(r, 20)) }) }
    return { utils, last, tap, seen }
  }

  it('shows the glass bar with the leader tabs on a leader page and navigates on a leader tab tap', async () => {
    const { utils, last, tap, seen } = await mount('/leader')
    expect(last().tabs.map((t) => t.title)).toEqual(['App', 'Dashboard', 'Events', 'More'])
    expect(last().selectedId).toBe('leader-home')
    await tap('leader-events')
    expect(seen.at(-1)).toBe('/leader/events')
    expect(last().selectedId).toBe('leader-events')
    utils.unmount()
  })

  it('shows the glass bar with the admin tabs on an admin page, with the chat badge', async () => {
    const { utils, last, tap, seen } = await mount('/admin/collectives')
    expect(last().tabs.map((t) => t.title)).toEqual(['App', 'Chat', 'Collectives', 'More'])
    expect(last().selectedId).toBe('admin-collectives')
    expect(last().tabs.find((t) => t.id === 'chat')?.badge).toBe('3')
    await tap('home')
    expect(seen.at(-1)).toBe('/')
    expect(last().tabs.map((t) => t.title)).toEqual(['Home', 'Chat', 'Profile', 'More'])
    utils.unmount()
  })

  it('never hides the glass bar because the route is a leader or admin page', async () => {
    for (const path of ['/', '/leader', '/leader/events', '/admin', '/admin/collectives']) {
      const { utils } = await mount(path)
      expect(plugin.calls.some((c) => c.hidden === false)).toBe(true)
      expect(plugin.calls.filter((c) => c.hidden === true)).toEqual([])
      utils.unmount()
    }
  })
})
