import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Last name is mandatory when creating an account (Jess Ditchfield via Tate,
 * 2026-10-19). Before this the form asked only for a display name, and 2,485
 * of 3,586 profiles carried no last name, so leaders could not tell two
 * people with the same first name apart on the event-day roster.
 *
 * Invariants:
 *  1. Every other field filled, last name blank: Create Account is disabled
 *     and the form says why ("Add your last name").
 *  2. A last name of only spaces counts as blank.
 *  3. With both names, the account is created and BOTH halves reach signUp,
 *     trimmed, so handle_new_user can copy them onto the profile.
 */

const signUp = vi.fn().mockResolvedValue({ error: null, hasSession: true })

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    signUp,
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

function renderPage() {
  render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  )
}

function fillAllButLastName() {
  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: '  Jess ' } })
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'jess@example.com' } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'Strongpass1!' } })
  fireEvent.change(screen.getByLabelText(/Date of Birth/), { target: { value: '15/06/2000' } })
  fireEvent.click(screen.getByRole('checkbox'))
}

const createButton = () => screen.getByRole('button', { name: /Create Account/ }) as HTMLButtonElement

describe('SignUpPage last name is required', () => {
  beforeEach(() => signUp.mockClear())

  it('refuses a blank last name and says why', () => {
    renderPage()
    fillAllButLastName()
    expect(createButton().disabled).toBe(true)
    expect(screen.getByText('Add your last name')).toBeTruthy()
  })

  it('treats a last name of only spaces as blank', () => {
    renderPage()
    fillAllButLastName()
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: '   ' } })
    expect(createButton().disabled).toBe(true)
    expect(screen.getByText('Add your last name')).toBeTruthy()
  })

  it('creates the account with both names, trimmed', async () => {
    renderPage()
    fillAllButLastName()
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: ' Ditchfield ' } })
    expect(createButton().disabled).toBe(false)
    fireEvent.click(createButton())
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1))
    expect(signUp.mock.calls[0][2]).toEqual({ firstName: 'Jess', lastName: 'Ditchfield' })
  })
})
