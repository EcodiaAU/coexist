import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'

/*
 * Regression guard for the native cold-start logout bug.
 *
 * Bug: on native the supabase client restored the session from its own durable
 * store AND use-auth.ts independently called supabase.auth.setSession() on boot.
 * Two restores -> two concurrent refreshes on the ROTATING refresh token -> the
 * second hit "refresh token already used" -> SIGNED_OUT -> user logged out on
 * every reopen.
 *
 * Fix invariants asserted here:
 *  1. Returning user (durable store has the session, so onAuthStateChange fires
 *     INITIAL_SESSION WITH a session): the provider must NOT call setSession at
 *     all. The client owns the single refresh path.
 *  2. Upgrading user (durable store empty -> INITIAL_SESSION null, but the legacy
 *     Preferences cache holds a valid session): the provider calls setSession
 *     EXACTLY ONCE to migrate the session into the durable store. There is no
 *     competing client session, so this one call cannot race.
 */

const STORAGE_KEY = 'coexist-auth-session'

// Shared mock state. vi.mock factories are hoisted above normal top-level vars,
// so anything they reference must live inside vi.hoisted.
const h = vi.hoisted(() => {
  const prefStore = new Map<string, string>()
  const setSession = vi.fn(() => Promise.resolve({ data: { session: null }, error: null }))
  const ref: { cb: ((event: string, session: unknown) => void) | null } = { cb: null }
  return { prefStore, setSession, ref }
})

// --- Capacitor: force native platform ---
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))

// --- Capacitor Preferences: in-memory store the test controls ---
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(({ key }: { key: string }) =>
      Promise.resolve({ value: h.prefStore.has(key) ? h.prefStore.get(key)! : null }),
    ),
    set: vi.fn(({ key, value }: { key: string; value: string }) => {
      h.prefStore.set(key, value)
      return Promise.resolve()
    }),
    remove: vi.fn(({ key }: { key: string }) => {
      h.prefStore.delete(key)
      return Promise.resolve()
    }),
  },
}))

// --- Social login: no-op ---
vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: { initialize: vi.fn(), login: vi.fn(), logout: vi.fn() },
}))

// --- Supabase client: capture the auth-state callback + count setSession ---
vi.mock('@/lib/supabase', () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'single', 'maybeSingle', 'is', 'gte', 'lte', 'not']) {
      c[m] = vi.fn(() => c)
    }
    c.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
    return c
  }
  return {
    supabase: {
      auth: {
        onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
          h.ref.cb = cb
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
        setSession: h.setSession,
        signOut: vi.fn(() => Promise.resolve({ error: null })),
      },
      from: vi.fn(() => chain()),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      channel: vi.fn(() => {
        const ch: Record<string, unknown> = {}
        ch.on = vi.fn(() => ch)
        ch.subscribe = vi.fn(() => ch)
        ch.unsubscribe = vi.fn(() => Promise.resolve('ok'))
        return ch
      }),
      removeChannel: vi.fn(() => Promise.resolve('ok')),
    },
    escapeIlike: (s: string) => s,
  }
})

const prefStore = h.prefStore
const setSession = h.setSession

// Import AFTER mocks are registered.
import { useAuthProvider } from '@/hooks/use-auth'

function fakeSession(): Session {
  return {
    access_token: 'at',
    refresh_token: 'rt',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: 'user-123', email: 'keely@example.com' } as Session['user'],
  } as Session
}

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
})

describe('native auth session persistence (cold-start logout regression)', () => {
  beforeEach(() => {
    prefStore.clear()
    h.ref.cb = null
    setSession.mockClear()
    localStorage.clear()
  })

  it('returning user: does NOT call setSession when the client restores the session itself', async () => {
    // Durable store already holds the session (legacy display cache present too).
    prefStore.set(STORAGE_KEY, JSON.stringify(fakeSession()))

    renderHook(() => useAuthProvider())
    await flush() // let restoreSession + onAuthStateChange registration settle

    // Client restored its own session -> emits INITIAL_SESSION WITH a session.
    await act(async () => { h.ref.cb?.('INITIAL_SESSION', fakeSession()) })
    await flush()

    expect(setSession).not.toHaveBeenCalled()
  })

  it('upgrading user: calls setSession exactly once to migrate the legacy cache', async () => {
    // Legacy cache has a session, durable store is empty -> client emits null.
    prefStore.set(STORAGE_KEY, JSON.stringify(fakeSession()))

    renderHook(() => useAuthProvider())
    await flush() // legacyCached is seeded from restoreSession before the event

    await act(async () => { h.ref.cb?.('INITIAL_SESSION', null) })
    await flush() // migration setSession is deferred via setTimeout(0)

    expect(setSession).toHaveBeenCalledTimes(1)
    const arg = setSession.mock.calls[0][0] as Session
    expect(arg.user.id).toBe('user-123')
  })

  it('migration fires only once even across repeated null events', async () => {
    prefStore.set(STORAGE_KEY, JSON.stringify(fakeSession()))

    renderHook(() => useAuthProvider())
    await flush()

    await act(async () => { h.ref.cb?.('INITIAL_SESSION', null) })
    await flush()
    await act(async () => { h.ref.cb?.('SIGNED_OUT', null) })
    await flush()

    expect(setSession).toHaveBeenCalledTimes(1)
  })
})
