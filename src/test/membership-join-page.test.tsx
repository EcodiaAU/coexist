import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Membership join page - Apple 3.1.1 safety guarantee.
 * The native app must NEVER show an in-app buy button; it points to the web.
 * On web it shows the Join CTA. This is the load-bearing behavioural contract
 * behind the web-first payment decision.
 */

// Toggle native/web per test (setup.ts mocks Capacitor to web by default).
const { nativeRef } = vi.hoisted(() => ({ nativeRef: { value: false } }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => nativeRef.value, getPlatform: () => (nativeRef.value ? 'ios' : 'web') },
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

const plan = {
  id: 'plan-1',
  name: 'Co-Exist Membership',
  description: 'Cheaper campout tickets, plus member perks as they roll out.',
  price_monthly: 20,
  price_yearly: 250,
  stripe_price_monthly: 'price_m',
  stripe_price_yearly: 'price_y',
  is_active: true,
  sort_order: 0,
}

vi.mock('@/hooks/use-membership', () => ({
  useMembershipPlans: () => ({ data: [plan], isLoading: false }),
  useMyMembership: () => ({ data: null }),
  useCreateMembership: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/components/toast', () => ({
  useToast: () => ({ toast: { error: vi.fn(), success: vi.fn() } }),
}))

import MembershipPage from '@/pages/membership/index'

function renderPage() {
  return render(
    <MemoryRouter>
      <MembershipPage />
    </MemoryRouter>,
  )
}

describe('MembershipPage (web-first Apple-safety)', () => {
  beforeEach(() => {
    nativeRef.value = false
  })

  it('renders both pricing tiers with the $5/week framing on the monthly card', () => {
    renderPage()
    expect(screen.getByText('$20/month')).toBeTruthy()
    expect(screen.getByText('about $5 a week')).toBeTruthy()
    expect(screen.getByText('$250/year')).toBeTruthy()
  })

  it('WEB: shows the in-app Join CTA', () => {
    nativeRef.value = false
    renderPage()
    expect(screen.getByText('Join now')).toBeTruthy()
    expect(screen.queryByText(/Join on the web/i)).toBeNull()
  })

  it('NATIVE: shows the manage-on-web message and NO in-app buy button', () => {
    nativeRef.value = true
    renderPage()
    expect(screen.getByText(/Join on the web/i)).toBeTruthy()
    expect(screen.queryByText('Join now')).toBeNull()
  })
})
