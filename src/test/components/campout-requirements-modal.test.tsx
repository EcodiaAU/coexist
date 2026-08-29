import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CampoutRequirementsModal } from '@/components/campout-requirements-modal'

/* ------------------------------------------------------------------ */
/*  Pre-checkout safety gate                                           */
/*                                                                     */
/*  This modal is the LAST thing between a signed-in member and Stripe. */
/*  Commit 65646d56 made the emergency contact mandatory on the guest   */
/*  paths and in the app-open backstop but left this one asking only    */
/*  for dietary + medical, so a member could reach checkout with nobody */
/*  to call. These tests pin the three-field requirement.               */
/* ------------------------------------------------------------------ */

const mockUpdate = vi.fn()
const mockRefreshProfile = vi.fn()

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, refreshProfile: mockRefreshProfile }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        mockUpdate(payload)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  },
}))

vi.mock('@/components/toast', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn() } }),
}))

const baseProps = {
  open: true,
  needDietary: false,
  needMedical: false,
  needEmergency: true,
  needFourWheelDrive: false,
  isCampout: true,
  onClose: vi.fn(),
  onSaved: vi.fn(),
}

describe('CampoutRequirementsModal emergency contact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks for an emergency contact before checkout', () => {
    render(<CampoutRequirementsModal {...baseProps} />)
    expect(screen.getByLabelText(/emergency contact name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/emergency contact phone/i)).toBeInTheDocument()
  })

  it('does not ask when the member already has one on file', () => {
    render(<CampoutRequirementsModal {...baseProps} needEmergency={false} needDietary />)
    expect(screen.queryByLabelText(/emergency contact name/i)).not.toBeInTheDocument()
  })

  // A contact you cannot ring is not a contact, so a name alone must not pass.
  it('blocks the purchase when only a name is given', async () => {
    const onSaved = vi.fn()
    render(<CampoutRequirementsModal {...baseProps} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText(/emergency contact name/i), { target: { value: 'Sarah' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue to payment/i }))
    await waitFor(() => {
      expect(screen.getByText(/phone number for your emergency contact/i)).toBeInTheDocument()
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('blocks the purchase when only a phone is given', async () => {
    const onSaved = vi.fn()
    render(<CampoutRequirementsModal {...baseProps} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText(/emergency contact phone/i), { target: { value: '0400000000' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue to payment/i }))
    await waitFor(() => {
      expect(screen.getByText(/give us an emergency contact name/i)).toBeInTheDocument()
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('persists name and phone and continues to checkout once both are given', async () => {
    const onSaved = vi.fn()
    render(<CampoutRequirementsModal {...baseProps} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText(/emergency contact name/i), { target: { value: 'Sarah' } })
    fireEvent.change(screen.getByLabelText(/emergency contact phone/i), { target: { value: '0403507939' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue to payment/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ emergency_contact_name: 'Sarah', emergency_contact_phone: '0403507939' }),
    )
  })

  // Relationship is optional, so it must never appear in the payload when blank
  // (writing '' would overwrite a value the member set elsewhere).
  it('omits a blank relationship from the write', async () => {
    render(<CampoutRequirementsModal {...baseProps} />)
    fireEvent.change(screen.getByLabelText(/emergency contact name/i), { target: { value: 'Sarah' } })
    fireEvent.change(screen.getByLabelText(/emergency contact phone/i), { target: { value: '0403507939' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue to payment/i }))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('emergency_contact_relationship')
  })

  // There is deliberately no "None" quick-fill for the emergency contact,
  // unlike dietary and medical. A remote camp-out with nobody to call is not a
  // valid answer, and a quick-fill would make it one.
  it('offers no None shortcut for the emergency contact', () => {
    render(<CampoutRequirementsModal {...baseProps} />)
    expect(screen.queryByRole('button', { name: /no emergency/i })).not.toBeInTheDocument()
  })
})
