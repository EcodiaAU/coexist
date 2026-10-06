import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Signup heads-up for 30+ (Tate, iMessage 2026-10-06).
 *
 * Co-Exist is a community for under-30s. Someone whose DOB makes them 30 or
 * older sees an inline notice beside the field, and STILL signs up: the notice
 * is informational and never feeds canSubmit. Invariants:
 *  1. 30 today (the boundary) shows the notice; 29 and 364 days does not.
 *  2. An over-30 with every other field filled has an ENABLED Create Account.
 *  3. Under-18 keeps its existing error and gets no notice on top.
 */

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    signUp: vi.fn().mockResolvedValue({ error: null, hasSession: true }),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOffline: false }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  },
}))

import SignUpPage from '@/pages/auth/sign-up'
import { isAtOrOverCommunityAge } from '@/lib/community-age'

const NOTICE = /built for the under-30s community/

function renderPage() {
  render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  )
}

function typeDob(display: string) {
  fireEvent.change(screen.getByLabelText(/Date of Birth/), { target: { value: display } })
}

function fillEverythingButDob() {
  fireEvent.change(screen.getByLabelText(/Display name/), { target: { value: 'Sam' } })
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'sam@example.com' } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'Strongpass1!' } })
  fireEvent.click(screen.getByRole('checkbox'))
}

describe('SignUpPage community-age notice', () => {
  beforeEach(() => {
    // Fake Date only: framer-motion and the rest keep real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the notice on the 30th birthday itself', () => {
    renderPage()
    typeDob('06/10/1996')
    expect(screen.getByText(NOTICE)).toBeTruthy()
  })

  it('shows nothing new one day short of 30', () => {
    renderPage()
    typeDob('07/10/1996')
    expect(screen.queryByText(NOTICE)).toBeNull()
  })

  it('never blocks: an over-30 with every field filled can create the account', () => {
    renderPage()
    fillEverythingButDob()
    typeDob('15/06/1981')
    expect(screen.getByText(NOTICE)).toBeTruthy()
    const create = screen.getByRole('button', { name: /Create Account/ }) as HTMLButtonElement
    expect(create.disabled).toBe(false)
  })

  it('an under-30 with every field filled sees no notice and can create the account', () => {
    renderPage()
    fillEverythingButDob()
    typeDob('15/06/2000')
    expect(screen.queryByText(NOTICE)).toBeNull()
    const create = screen.getByRole('button', { name: /Create Account/ }) as HTMLButtonElement
    expect(create.disabled).toBe(false)
  })

  it('under-18 keeps its error and gets no notice', async () => {
    renderPage()
    typeDob('15/06/2010')
    // The Input swaps helper for error through AnimatePresence mode="wait", so
    // the error lands after the helper's exit animation.
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('You must be at least 18 to create an account')
    expect(screen.queryByText(NOTICE)).toBeNull()
  })
})

describe('isAtOrOverCommunityAge', () => {
  it('is true from 30 up and false below or when unknown', () => {
    expect(isAtOrOverCommunityAge(30)).toBe(true)
    expect(isAtOrOverCommunityAge(64)).toBe(true)
    expect(isAtOrOverCommunityAge(29)).toBe(false)
    expect(isAtOrOverCommunityAge(null)).toBe(false)
    expect(isAtOrOverCommunityAge(undefined)).toBe(false)
  })
})
