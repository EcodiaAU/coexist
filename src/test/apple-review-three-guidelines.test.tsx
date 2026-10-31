import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/*
 * The three App Review guidelines Apple cited on Co-Exist 2.3.58 (build 97,
 * 2026-10-22, Resolution Center thread 1bd5ef89). 2.3.58 was approved as a
 * bug-fix release only on our written commitment that the NEXT store binary
 * fixes all three, so a regression here is a re-rejection.
 *
 *  3.2.2(iv) The iOS app takes no in-app donation payment; Donate opens the
 *            Co-Exist website in Safari. Android and web keep Stripe.
 *  4.0       After Sign in with Apple the app never asks for the name again;
 *            the name Apple sends is saved instead.
 *  1.2       Terms are stated before a Google/Apple account is created.
 */

const platform = vi.hoisted(() => ({ native: false, name: 'web' }))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
}))

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke }, from: vi.fn() },
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('@/hooks/use-parallax-scroll', () => ({
  useParallaxLayers: () => ({ bgRef: { current: null }, fgRef: { current: null }, textRef: { current: null } }),
}))

function setPlatform(name: 'ios' | 'android' | 'web') {
  platform.name = name
  platform.native = name !== 'web'
}

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('3.2.2(iv) donations on iOS open the website', () => {
  let openSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    invoke.mockReset()
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })
  afterEach(() => {
    openSpy.mockRestore()
    setPlatform('web')
  })

  it('routes to the website only inside the native iOS app', async () => {
    const { donationsOpenWebsite } = await import('@/lib/donate-external')
    setPlatform('ios')
    expect(donationsOpenWebsite()).toBe(true)
    setPlatform('android')
    expect(donationsOpenWebsite()).toBe(false)
    setPlatform('web')
    expect(donationsOpenWebsite()).toBe(false)
  })

  it('iOS: the donate page shows no payment form and Donate opens Safari', async () => {
    setPlatform('ios')
    const { default: DonatePage } = await import('@/pages/donate/index')
    render(<DonatePage />, { wrapper })
    expect(screen.getByTestId('donate-website-card')).toBeTruthy()
    expect(screen.queryByText(/Secure payment via Stripe/i)).toBeNull()
    expect(screen.queryByText(/Make a donation/i)).toBeNull()
    expect(screen.queryByText('Choose an amount')).toBeNull()
    expect(screen.queryByPlaceholderText('Enter a custom amount')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Donate on coexistaus\.org/i }))
    expect(openSpy).toHaveBeenCalledWith('https://www.coexistaus.org/donate', '_system')
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each(['android', 'web'] as const)('%s keeps the in-app Stripe form', async (name) => {
    setPlatform(name)
    const { default: DonatePage } = await import('@/pages/donate/index')
    render(<DonatePage />, { wrapper })
    expect(screen.queryByTestId('donate-website-card')).toBeNull()
    expect(screen.getByText(/Secure payment via Stripe/i)).toBeTruthy()
  })

  it('iOS: no screen can start an in-app donation checkout', async () => {
    setPlatform('ios')
    const { useCreateDonation } = await import('@/hooks/use-donations')
    const { result } = renderHook(() => useCreateDonation(), { wrapper })
    await expect(
      result.current.mutateAsync({ amount: 25, frequency: 'one_time' }),
    ).rejects.toThrow(/website/)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('the Stripe billing portal opens in Safari on iOS, never in the web view', () => {
    const s = src('pages/profile/donations.tsx')
    expect(s).toMatch(/if \(donationsOpenWebsite\(\)\) openInSystemBrowser\(url\)/)
  })

  it('the system-browser hand-off is window.open(_system), never location', () => {
    const s = src('lib/donate-external.ts')
    expect(s).toMatch(/window\.open\(url, '_system'\)/)
    expect(s).not.toMatch(/location\.href\s*=/)
  })
})

describe('4.0 no name re-ask after Sign in with Apple', () => {
  it('recognises an Apple account however Supabase records it', async () => {
    const { isAppleSignInAccount } = await import('@/lib/onboarding-name')
    expect(isAppleSignInAccount({ app_metadata: { provider: 'apple' } })).toBe(true)
    expect(isAppleSignInAccount({ app_metadata: { provider: 'email', providers: ['email', 'apple'] } })).toBe(true)
    expect(isAppleSignInAccount({ identities: [{ provider: 'apple' }] })).toBe(true)
    expect(isAppleSignInAccount({ app_metadata: { provider: 'google', providers: ['google'] } })).toBe(false)
    expect(isAppleSignInAccount({ app_metadata: { provider: 'email' } })).toBe(false)
    expect(isAppleSignInAccount(null)).toBe(false)
  })

  it('an Apple account never gets the name step, even with no name on file', async () => {
    const { needsNameStep } = await import('@/lib/onboarding-name')
    const empty = { display_name: 'bk2pv6nhy2', first_name: null, last_name: null }
    expect(needsNameStep(empty, { appleSignIn: true })).toBe(false)
    // Everyone else still must give both halves (2026-10-19 rule).
    expect(needsNameStep(empty)).toBe(true)
    expect(needsNameStep(empty, { appleSignIn: false })).toBe(true)
  })

  it('onboarding passes the Apple identity into the name decision', () => {
    expect(src('pages/onboarding/onboarding.tsx')).toMatch(
      /needsNameStep\(profile, \{ appleSignIn: isAppleSignInAccount\(user\) \}\)/,
    )
  })

  it('reads the name Apple sends, and nothing when Apple sends none', async () => {
    const { readAppleCredentialName } = await import('@/lib/apple-signin-name')
    expect(readAppleCredentialName({ givenName: ' Ada ', familyName: 'Lovelace', email: null })).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
    expect(readAppleCredentialName({ givenName: null, familyName: null })).toBeNull()
    expect(readAppleCredentialName(undefined)).toBeNull()
  })

  it('fills only missing halves and replaces only a defaulted display name', async () => {
    const { appleNamePatch } = await import('@/lib/apple-signin-name')
    const relay = 'bk2pv6nhy2@privaterelay.appleid.com'
    const name = { firstName: 'Ada', lastName: 'Lovelace' }
    expect(appleNamePatch({ display_name: 'bk2pv6nhy2', first_name: null, last_name: null }, name, relay)).toEqual({
      first_name: 'Ada',
      last_name: 'Lovelace',
      display_name: 'Ada',
    })
    // A name the member already chose is never overwritten.
    expect(appleNamePatch({ display_name: 'Ads', first_name: 'Adele', last_name: 'L' }, name, relay)).toEqual({})
  })

  it('signInWithApple saves the credential name after the session exists', () => {
    const s = src('hooks/use-auth.ts')
    const apple = s.slice(s.indexOf('const signInWithApple'), s.indexOf('const signInWithMagicLink'))
    expect(apple).toMatch(/readAppleCredentialName\(appleResult\?\.profile\)/)
    expect(apple.indexOf('signInWithIdToken')).toBeLessThan(apple.indexOf('saveAppleCredentialName('))
  })
})

describe('1.2 terms before a Google/Apple account exists', () => {
  it.each(['pages/auth/login.tsx', 'pages/auth/sign-up.tsx'])('%s states the terms under the social buttons', (p) => {
    const s = src(p)
    expect(s).toMatch(/<SocialTermsNote \/>/)
    expect(s.indexOf("handleSocial('apple')")).toBeLessThan(s.indexOf('<SocialTermsNote />'))
  })

  it('the note names zero tolerance and links the terms', async () => {
    const { SocialTermsNote } = await import('@/components/social-terms-note')
    render(<SocialTermsNote />, { wrapper })
    expect(screen.getByTestId('social-terms-note').textContent).toMatch(/zero tolerance for objectionable content/)
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms')
  })
})
