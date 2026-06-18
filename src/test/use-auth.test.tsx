import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// We test the auth context via the provider since useAuth is context-based.
// The supabase mock is set up in setup.ts.

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </QueryClientProvider>
    )
  }
}

describe('useAuth hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provides default unauthenticated state', async () => {
    // Import dynamically so mocks are applied
    const { useAuth } = await import('@/hooks/use-auth')
    const { AuthProvider } = await import('@/components/auth-provider')

    const Wrapper = createWrapper()
    const WrapperWithAuth = ({ children }: { children: ReactNode }) => (
      <Wrapper>
        <AuthProvider>{children}</AuthProvider>
      </Wrapper>
    )

    const { result } = renderHook(() => useAuth(), { wrapper: WrapperWithAuth })

    // Initially loading, then resolves to no user
    await waitFor(() => {
      expect(result.current.user).toBeNull()
    })
  })

  // Regression for status_board 1b1e718d: first paint must not block on the
  // profile network round trip. isLoading has to flip false as soon as the
  // SESSION is known (so the splash, which waits on isLoading, dismisses),
  // independent of loadUserData (profile/roles) still being in flight.
  it('clears isLoading as soon as the session is known, before the profile fetch resolves', async () => {
    // Capture the auth-state callback and force the profile fetch to hang so
    // the only way isLoading can clear is the session-known path, not the
    // background loadUserData completion.
    let authCb: ((event: string, session: unknown) => void) | null = null
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { subscription: { unsubscribe: vi.fn() } as any },
    } as never)
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((cb: never) => {
      authCb = cb as unknown as (event: string, session: unknown) => void
      return { data: { subscription: { unsubscribe: vi.fn() } } } as never
    })
    // Profile fetch never resolves (simulates a blocked/flaky network).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hanging = { eq: vi.fn().mockReturnThis(), maybeSingle: () => new Promise(() => {}) } as any
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue(hanging),
    } as never)

    const { useAuth } = await import('@/hooks/use-auth')
    const { AuthProvider } = await import('@/components/auth-provider')

    const Wrapper = createWrapper()
    const WrapperWithAuth = ({ children }: { children: ReactNode }) => (
      <Wrapper>
        <AuthProvider>{children}</AuthProvider>
      </Wrapper>
    )

    const { result } = renderHook(() => useAuth(), { wrapper: WrapperWithAuth })

    // Fire a signed-in event with a user, but the profile fetch stays pending.
    act(() => {
      authCb?.('SIGNED_IN', { user: { id: 'u1' }, expires_at: 9_999_999_999 })
    })

    await waitFor(() => {
      expect(result.current.user?.id).toBe('u1')
      // The fix: loading is cleared even though the profile is still null
      // (loadUserData is still hanging on the network).
      expect(result.current.isLoading).toBe(false)
      expect(result.current.profile).toBeNull()
    })
  })
})
